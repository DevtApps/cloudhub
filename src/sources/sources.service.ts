import { Injectable, OnModuleInit, OnModuleDestroy, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { DataSource, SourceType } from './entities/source.entity';
import { RegexPattern } from '../regex/entities/regex.entity';
import { CreateSourceDto } from './dto/create-source.dto';
import { QueuesService } from '../queues/queues.service';
import { RegexService } from '../regex/regex.service';
import { Tail } from 'tail';
import * as fs from 'fs';

@Injectable()
export class SourcesService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(SourcesService.name);
    private watchers: Map<string, Tail> = new Map();

    constructor(
        @InjectRepository(DataSource)
        private sourcesRepository: Repository<DataSource>,
        private queuesService: QueuesService,
        private regexService: RegexService
    ) {}

    async onModuleInit() {
        this.logger.log('Initializing Data Sources...');
        await this.loadAndStartSources();
    }

    onModuleDestroy() {
        this.stopAllWatchers();
    }

    async loadAndStartSources() {
        // Clear any existing watchers first to be safe
        this.stopAllWatchers();
        
        const sources = await this.sourcesRepository.find({ 
            where: { isActive: true },
            relations: ['patterns']
        });
        
        this.logger.log(`Found ${sources.length} active sources to watch.`);
        for (const source of sources) {
            this.startWatcher(source);
        }

        return { count: sources.length, message: 'All sources reloaded' };
    }

    async restartAll() {
        this.logger.log('Restarting all source watchers...');
        return this.loadAndStartSources();
    }

    async restart(id: string) {
        this.logger.log(`Restarting watcher for source ${id}`);
        // Stop
        if (this.watchers.has(id)) {
            try {
                this.watchers.get(id).unwatch();
            } catch (error) {}
            this.watchers.delete(id);
        }

        // Start if active
        const source = await this.findOne(id);
        if (source.isActive) {
            await this.startWatcher(source);
            return { success: true, status: 'running' };
        }
        return { success: true, status: 'stopped' };
    }

    private stopAllWatchers() {
        this.watchers.forEach(watcher => {
            try {
                watcher.unwatch();
            } catch (e) {
                // Ignore errors during unwatch
            }
        });
        this.watchers.clear();
    }

    private async startWatcher(source: DataSource, retryCount = 0) {
        // Ensure target queue is registered so it appears in the system
        const queueName = source.targetQueue || 'metric-queue';
        this.queuesService.registerQueue(queueName);

        if (this.watchers.has(source.id)) {
            try {
                this.watchers.get(source.id).unwatch();
            } catch (error) { }
            this.watchers.delete(source.id);
        }

        if (source.type === SourceType.FILE) {
            const filePath = source.config;
            
            if (!fs.existsSync(filePath)) {
                if (retryCount < 5) {
                     this.logger.warn(`File not found for source ${source.name}: ${filePath}. Retrying in 5s... (${retryCount + 1}/5)`);
                     setTimeout(() => this.startWatcher(source, retryCount + 1), 5000);
                } else {
                     this.logger.error(`File not found for source ${source.name}: ${filePath} after 5 attempts. Skipping.`);
                }
                return; 
            }

            try {
                this.logger.log(`Starting tail on ${filePath} for source ${source.name}`);
                
                // Advanced options for robustness
                const options = {
                    separator: /[\r]{0,1}\n/, 
                    fromBeginning: false, 
                    fsWatchOptions: {}, 
                    follow: true,
                    logger: {
                        info: (msg: any) => this.logger.log(msg),
                        error: (msg: any) => this.logger.error(msg),
                    },
                    useWatchFile: true // More robust than fs.watch for rotation, though slightly slower
                };

                const tail = new Tail(filePath, options);
                
                tail.on("line", async (data: string) => {
                    await this.processLogLine(data, source);
                });

                tail.on("error", (error: any) => {
                    this.logger.error(`Tail error on ${source.name}: ${error}`);
                    // Attempt to restart watcher on error after delay
                     setTimeout(() => this.startWatcher(source, 0), 5000);
                });

                this.watchers.set(source.id, tail);
            } catch (e) {
                this.logger.error(`Failed to start watcher for ${source.name}: ${e.message}`);
                // Retry
                setTimeout(() => this.startWatcher(source, 0), 10000);
            }
        }
    }

    private async processLogLine(line: string, source: DataSource) {
        if (!line || !line.trim()) return;

        // Use ONLY patterns associated with this source
        const patternsToUse = source.patterns || [];
        if (patternsToUse.length === 0) return;

        const parseResult = this.regexService.matchPatterns(line, patternsToUse);
        
        if (parseResult.success) {
            // Build payload with PostfixMessage base structure
            const payload: Record<string, any> = {
                ts: '',
                host: '',
                program: '',
                message: '',
                service: '',
                component: '',
                pid: 0,
                detail: '',
                queue_id: '',
                to: '',
                status: '',
                subsystem: '',
                message_id: '',
            };

            // Add all matched groups (including extra keys)
            for (const match of parseResult.matches) {
                for (const [key, value] of Object.entries(match.data)) {
                    payload[key] = key === 'pid' ? parseInt(value as string, 10) || 0 : value;
                }
            }
            
            try {
                await this.queuesService.addJob(source.targetQueue, payload);
            } catch (e) {
                this.logger.error(`Failed to enqueue job: ${e.message}`);
                // Try to ensure queue exists
                await this.queuesService.registerQueue(source.targetQueue);
                await this.queuesService.addJob(source.targetQueue, payload);
            }
        }
    }

    // CRUD
    async create(dto: CreateSourceDto): Promise<DataSource> {
        const source = this.sourcesRepository.create(dto);
        
        if (dto.patternIds && dto.patternIds.length > 0) {
            source.patterns = dto.patternIds.map(id => ({ id } as RegexPattern));
        }

        const saved = await this.sourcesRepository.save(source);
        if (saved.isActive) {
            const fullSource = await this.findOne(saved.id);
            this.startWatcher(fullSource);
        }
        return saved;
    }

    async findAll() {
        const sources = await this.sourcesRepository.find({ relations: ['patterns'] });
        return sources.map(source => ({
            ...source,
            status: this.watchers.has(source.id) ? 'running' : 'stopped'
        }));
    }

    async findOne(id: string) {
        const s = await this.sourcesRepository.findOne({ 
            where: { id },
            relations: ['patterns']
        });
        if (!s) throw new NotFoundException('Source not found');
        return s;
    }

    async update(id: string, updateDto: any) {
        const source = await this.findOne(id);
        const wasActive = source.isActive;

        if (updateDto.patternIds) {
            source.patterns = updateDto.patternIds.map(pid => ({ id: pid } as RegexPattern));
            delete updateDto.patternIds; // Prevent overwrite by Object.assign if it exists there
        }

        Object.assign(source, updateDto);
        const saved = await this.sourcesRepository.save(source);

        // Restart watcher if config changed or status changed or patterns changed
        // Since we blindly restarted if active, let's just use the saved instance relations
        if (updateDto.isActive !== undefined || updateDto.config !== undefined || updateDto.type !== undefined || source.patterns !== undefined) {
             if (this.watchers.has(id)) {
                 this.watchers.get(id).unwatch();
                 this.watchers.delete(id);
             }
             if (saved.isActive) {
                 const fullSource = await this.findOne(saved.id);
                 this.startWatcher(fullSource);
             }
        }
        return saved;
    }

    async remove(id: string) {
         if (this.watchers.has(id)) {
             this.watchers.get(id).unwatch();
             this.watchers.delete(id);
         }
         await this.sourcesRepository.delete(id);
    }

    // Toggle
    async toggle(id: string) {
        const source = await this.findOne(id);
        source.isActive = !source.isActive;
        const saved = await this.sourcesRepository.save(source);
        if (saved.isActive) {
            this.startWatcher(saved);
        } else {
             if (this.watchers.has(id)) {
                 this.watchers.get(id).unwatch();
                 this.watchers.delete(id);
             }
        }
        return saved;
    }
}
