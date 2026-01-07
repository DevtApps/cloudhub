import { Controller, Get } from '@nestjs/common';
import * as os from 'os';
import { QueuesService } from '../queues/queues.service';

@Controller('system')
export class SystemController {
  @Get('info')
  getSystemInfo() {
    return {
      system: {
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        cpus: os.cpus(),
        totalmem: os.totalmem(),
        freemem: os.freemem(),
        uptime: os.uptime(),
        loadavg: os.loadavg(),
        hostname: os.hostname(),
        networkInterfaces: os.networkInterfaces(),
        memory: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        nodeVersion: process.version,
        processUptime: process.uptime()
      }
    };
  }
}

@Controller()
export class AppController {
    constructor(private queuesService: QueuesService) {}

    @Get('health')
    async getHealth() {
        const redisHealthy = await this.queuesService.checkHealth();
        return { 
            status: redisHealthy ? 'healthy' : 'degraded', 
            redis: redisHealthy,
            timestamp: new Date().toISOString() 
        };
    }
}
