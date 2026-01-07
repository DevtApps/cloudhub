import { Injectable, Logger, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { CreateServiceDto } from './dto/create-service.dto';
import { SystemService } from './entities/service.entity';

const execAsync = promisify(exec);

export interface ManagedService {
    name: string;
    status: 'active' | 'inactive' | 'failed' | 'unknown';
    interpreter: string;
    description: string;
}

@Injectable()
export class ServicesManagerService {
    private readonly logger = new Logger(ServicesManagerService.name);
    private readonly storageDir: string;
    private readonly systemdDir: string;
    private readonly serviceUser: string;

    constructor(
        private configService: ConfigService,
        @InjectRepository(SystemService)
        private servicesRepository: Repository<SystemService>,
    ) {
        this.storageDir = this.configService.get('SERVICES_STORAGE_DIR', '/opt/cloud-hub/custom-services');
        this.systemdDir = this.configService.get('SERVICES_SYSTEMD_DIR', '/etc/systemd/system');
        this.serviceUser = this.configService.get('SERVICES_RUN_USER', 'cloud-hub');
    }

    private async runCommand(command: string, logError = true): Promise<string> {
        try {
            const { stdout } = await execAsync(command);
            return stdout.trim();
        } catch (error) {
            if (logError) {
                this.logger.error(`Command failed: ${command}`, error);
            }
            throw error;
        }
    }

    async getServices(): Promise<ManagedService[]> {
        try {
            const storedServices = await this.servicesRepository.find();
            const services: ManagedService[] = [];

            for (const svc of storedServices) {
                // Check status via systemctl
                const serviceName = `custom-${svc.name}`;
                let status: 'active' | 'inactive' | 'failed' | 'unknown' = 'unknown';
                try {
                     const output = await this.runCommand(`systemctl show -p ActiveState --value ${serviceName}`, false);
                     status = output === 'active' ? 'active' : 'inactive';
                } catch {
                     status = 'inactive';
                }

                services.push({ 
                    name: svc.name, 
                    status, 
                    interpreter: svc.interpreter, 
                    description: svc.description 
                });
            }
            return services;
        } catch (error) {
            this.logger.error('Failed to list services', error);
            return [];
        }
    }

    async getService(name: string) {
        const service = await this.servicesRepository.findOne({ where: { name } });
        if (!service) throw new NotFoundException('Service not found in DB');
        
        // Return script from DB (Entity) instead of file
        const scriptFilename = `main.${this.getExtension(service.interpreter)}`;
        return { 
            name: service.name,
            description: service.description,
            interpreter: service.interpreter,
            script: service.script,
            packages: service.packages,
            scriptFilename
        };
    }

    private async setupPythonEnv(serviceDir: string, packages?: string) {
        if (!packages || !packages.trim()) return null; // Return null if no extra env needed

        this.logger.log(`Setting up Python virtual environment in ${serviceDir}...`);
        
        // 1. Create Verify Env
        const venvPath = path.join(serviceDir, 'venv');
        // Use the configured python path to create the venv
        const pythonPath = this.configService.get('SERVICES_PYTHON_PATH', 'python3');
        
        if (!existsSync(venvPath)) {
            await this.runCommand(`${pythonPath} -m venv ${venvPath}`, true);
        }

        // 2. Write requirements.txt
        const reqPath = path.join(serviceDir, 'requirements.txt');
        await fs.writeFile(reqPath, packages);

        // 3. Install
        const pipPath = path.join(venvPath, 'bin', 'pip');
        try {
            this.logger.log(`Installing packages via ${pipPath}...`);
            await this.runCommand(`${pipPath} install -r ${reqPath}`, true);
        } catch (e) {
            this.logger.error('Failed to install python packages', e);
            throw new InternalServerErrorException(`Failed to install python packages: ${e.message}`);
        }

        // Return the interpreter path inside venv
        return path.join(venvPath, 'bin', 'python');
    }

    async createService(dto: CreateServiceDto) {
        const sanitizedName = dto.name.replace(/[^a-z0-9-]/g, '');
        if (!sanitizedName) throw new InternalServerErrorException('Invalid name');

        // Check DB
        const existing = await this.servicesRepository.findOne({ where: { name: sanitizedName } });
        if (existing) throw new InternalServerErrorException('Service already exists');
        
        const serviceDir = path.join(this.storageDir, sanitizedName);
        const serviceName = `custom-${sanitizedName}.service`;
        
        // 1. Create Directory
        await fs.mkdir(serviceDir, { recursive: true });

        // 2. Write Script
        const ext = this.getExtension(dto.interpreter);
        const scriptPath = path.join(serviceDir, `main.${ext}`);
        await fs.writeFile(scriptPath, dto.script);

        // 3. Setup Python Env (if applicable)
        let interpreterCmd = this.getInterpreterPath(dto.interpreter);
        if (dto.interpreter === 'python3' && dto.packages) {
             const venvPython = await this.setupPythonEnv(serviceDir, dto.packages);
             if (venvPython) interpreterCmd = venvPython;
        }

        // 4. Save to DB
        const service = this.servicesRepository.create({
            name: sanitizedName,
            description: dto.description,
            interpreter: dto.interpreter,
            script: dto.script,
            packages: dto.packages,
            enabled: true
        });
        await this.servicesRepository.save(service);

        // 5. Generate Systemd Unit
        const unitContent = `[Unit]
Description=${dto.description || `Custom Service ${sanitizedName}`}
After=network.target

[Service]
Type=simple
User=${this.serviceUser}
WorkingDirectory=${serviceDir}
ExecStart=${interpreterCmd} ${scriptPath}
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal
SyslogIdentifier=custom-${sanitizedName}

[Install]
WantedBy=multi-user.target
`;
        
        // Write to tmp then sudo cp/tee
        const tmpPath = `/tmp/${serviceName}`;
        await fs.writeFile(tmpPath, unitContent);
        
        try {
            await this.runCommand(`sudo tee /etc/systemd/system/${serviceName} < ${tmpPath}`);
            await this.runCommand(`sudo systemctl daemon-reload`);
            await this.runCommand(`sudo systemctl enable --now ${serviceName}`);
            
            await fs.unlink(tmpPath); // Cleanup
        } catch (error) {
            this.logger.error('Failed to install systemd service', error);
            // Rollback DB?
            await this.servicesRepository.delete({ name: sanitizedName });
            throw new InternalServerErrorException('Failed to register system service. Check logs.');
        }

        return { success: true, name: sanitizedName };
    }

    async updateService(name: string, dto: CreateServiceDto) {
        const service = await this.servicesRepository.findOne({ where: { name } });
        if (!service) throw new NotFoundException('Service not found');

        const serviceDir = path.join(this.storageDir, name);
        if (!existsSync(serviceDir)) {
             // Recreate dir if missing
             await fs.mkdir(serviceDir, { recursive: true });
        }
        
        // Update DB
        service.description = dto.description;
        service.script = dto.script;
        service.interpreter = dto.interpreter;
        service.packages = dto.packages;
        await this.servicesRepository.save(service);

        // Update script file
        const ext = this.getExtension(dto.interpreter);
        const scriptPath = path.join(serviceDir, `main.${ext}`);
        await fs.writeFile(scriptPath, dto.script);

        // Update Python Env (if applicable)
        let interpreterCmd = this.getInterpreterPath(dto.interpreter);
        if (dto.interpreter === 'python3' && dto.packages) {
             const venvPython = await this.setupPythonEnv(serviceDir, dto.packages);
             if (venvPython) interpreterCmd = venvPython;
        }

        // Re-generate systemd unit
        const serviceName = `custom-${name}.service`;
        const unitContent = `[Unit]
Description=${dto.description || `Custom Service ${name}`}
After=network.target

[Service]
Type=simple
User=${this.serviceUser}
WorkingDirectory=${serviceDir}
ExecStart=${interpreterCmd} ${scriptPath}
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=custom-${name}

[Install]
WantedBy=multi-user.target
`;
        const tmpPath = `/tmp/${serviceName}`;
        await fs.writeFile(tmpPath, unitContent);
        
        await this.runCommand(`sudo tee /etc/systemd/system/${serviceName} < ${tmpPath}`);
        await this.runCommand(`sudo systemctl daemon-reload`);
        await fs.unlink(tmpPath);

        // Restart
        await this.runCommand(`sudo systemctl restart custom-${name}`);

        return { success: true };
    }

    async deleteService(name: string) {
        const serviceName = `custom-${name}`;
        
        try {
            await this.runCommand(`sudo systemctl stop ${serviceName}`);
            await this.runCommand(`sudo systemctl disable ${serviceName}`);
            await this.runCommand(`sudo rm /etc/systemd/system/${serviceName}.service`);
            await this.runCommand(`sudo systemctl daemon-reload`);

            // Remove files
            await fs.rm(path.join(this.storageDir, name), { recursive: true, force: true });
            
            // Remove DB
            await this.servicesRepository.delete({ name });
        } catch (error) {
             this.logger.error('Error removing service', error);
             throw new InternalServerErrorException('Failed to remove service');
        }
        return { success: true };
    }
    
    async toggleService(name: string, enable: boolean) {
        const action = enable ? 'start' : 'stop';
        await this.runCommand(`sudo systemctl ${action} custom-${name}`);
        return { success: true, status: enable ? 'active' : 'inactive' };
    }

    async getLogs(name: string) {
         return this.runCommand(`journalctl -u custom-${name} -n 100 --no-pager`);
    }

    private getExtension(interpreter: string) {
        switch(interpreter) {
            case 'node': return 'js';
            case 'python3': return 'py';
            case 'bash': return 'sh';
            default: return 'txt';
        }
    }

    private getInterpreterPath(interpreter: string) {
        if (interpreter === 'node') {
            return this.configService.get('SERVICES_NODE_PATH', '/opt/cloud-hub/node/bin/node');
        }
        if (interpreter === 'python3') {
            return this.configService.get('SERVICES_PYTHON_PATH', '/usr/bin/python3');
        }
        if (interpreter === 'bash') {
            return this.configService.get('SERVICES_BASH_PATH', '/usr/bin/bash');
        }
        return interpreter;
    }
}
