import { Injectable, BadRequestException, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { QueuesGateway } from './queues.gateway';

@Injectable()
export class QueuesService implements OnModuleInit, OnModuleDestroy {
  private queues: Map<string, Queue> = new Map();
  private metricsInterval: NodeJS.Timeout;
  private readonly logger = new Logger(QueuesService.name);

  constructor(
    private configService: ConfigService,
    private queuesGateway: QueuesGateway,
    // We can inject widely used queues here if registered in the module
    // But for a dynamic hub, we might instantiate them manually or wrap them
  ) {
    // Initialize default queues
    const metricQueueName = this.configService.get('METRIC_QUEUE') || 'metric-queue';
    const smtpQueueName = this.configService.get('SMTP_SENT_QUEUE') || 'smtp_email_sent';
    
    this.registerQueue(metricQueueName);
    this.registerQueue(smtpQueueName);
  }

  // Dynamic queue registration (could be expanded)
  registerQueue(name: string) {
    if (this.queues.has(name)) return;
    
    // Using the same redis connection string from config
    const queue = new Queue(name, {
      connection: {
        host: this.configService.get('REDIS_HOST'),
        port: this.configService.get('REDIS_PORT'),
        password: this.configService.get('REDIS_PASSWORD'),
        db: this.configService.get('REDIS_DB'),
      },
      defaultJobOptions: {
        attempts: this.configService.get('JOB_ATTEMPTS', 3),
        backoff: {
            type: 'fixed',
            delay: this.configService.get('JOB_BACKOFF_MS', 15000)
        }
      }
    });

    this.queues.set(name, queue);
  }

  getQueueNames() {
    return Array.from(this.queues.keys());
  }

  getQueue(name: string): Queue {
    const queue = this.queues.get(name);
    if (!queue) throw new BadRequestException(`Queue ${name} not found`);
    return queue;
  }

  async getQueueStats(name: string) {
    const queue = this.getQueue(name);
    const [waiting, active, completed, failed, delayed, isPaused] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
      queue.isPaused(),
    ]);
    return { waiting, active, completed, failed, delayed, isPaused };
  }


  async cleanQueue(name: string, type: 'completed' | 'failed' | 'delayed' | 'wait' | 'active', limit = 1000) {
     const queue = this.getQueue(name);
     await queue.clean(0, limit, type);
     return { success: true, message: `Cleaned ${type} jobs from ${name}` };
  }

  async addJob(queueName: string, data: any) {
      const queue = this.getQueue(queueName); 
      return await queue.add('manual-job', data);
  }

  async getJobs(name: string, status: any[], start = 0, end = 10) {
      const queue = this.getQueue(name);
      return await queue.getJobs(status, start, end);
  }

  async removeJob(queueName: string, jobId: string) {
      const queue = this.getQueue(queueName);
      const job = await queue.getJob(jobId);
      if (job) {
          await job.remove();
          return { success: true };
      }
      throw new BadRequestException('Job not found');
  }

  // Management functions
  async pauseQueue(name: string) {
      await this.getQueue(name).pause();
      return { success: true, message: `Queue ${name} paused` };
  }

  async resumeQueue(name: string) {
      await this.getQueue(name).resume();
      return { success: true, message: `Queue ${name} resumed` };
  }

  async emptyQueue(name: string) { // Removes all waiting/delayed/active... wait using 'drain' is faster for pure removal
      const queue = this.getQueue(name);
      await queue.drain();
      return { success: true, message: `Queue ${name} drained` };
  }

  async obliterateQueue(name: string) {
       const queue = this.getQueue(name);
       await queue.obliterate({ force: true });
       this.queues.delete(name);
       // Re-create or leave dead? For "Remove Queue", we leave dead.
       return { success: true, message: `Queue ${name} obliterated` };
  }

  async checkHealth() {
      try {
          // Check if we can connect to redis via the first registered queue
          const queueNames = this.getQueueNames();
          if (queueNames.length === 0) return true; // No queues allowed is "healthy" conceptually if just started?
          
          const queue = this.queues.get(queueNames[0]);
          const client = await queue.client
            await client.ping();
          return true;
      } catch (e) {
          return false;
      }
  }

  onModuleInit() {
    this.metricsInterval = setInterval(async () => {
        await this.broadcastMetrics();
    }, 2000); // Broadcast every 2 seconds for real-time feel
  }

  onModuleDestroy() {
    if (this.metricsInterval) {
        clearInterval(this.metricsInterval);
    }
  }

  private async broadcastMetrics() {
      try {
        const queueNames = this.getQueueNames();
        const metrics = {};
        
        for (const name of queueNames) {
            const stats = await this.getQueueStats(name);
            metrics[name] = stats;
        }

        this.queuesGateway.emitMetrics(metrics);
      } catch (e) {
          this.logger.error('Error broadcasting metrics', e);
      }
  }
}
