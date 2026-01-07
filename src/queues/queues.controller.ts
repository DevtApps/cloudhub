import { Controller, Get, Post, Delete, Body, Param, Query } from '@nestjs/common';
import { QueuesService } from './queues.service';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('queues')
@Controller('queues')
export class QueuesController {
  constructor(private readonly queuesService: QueuesService) {}

  @Get()
  getQueues() {
    return this.queuesService.getQueueNames();
  }

  @Post(':name/register')
  registerNewQueue(@Param('name') name: string) {
      this.queuesService.registerQueue(name);
      return { success: true, message: `Queue ${name} registered` };
  }

  @Get(':name/stats')
  getStats(@Param('name') name: string) {
    return this.queuesService.getQueueStats(name);
  }

  @Get(':name/jobs')
  getJobs(
      @Param('name') name: string, 
      @Query('status') status: string = 'completed',
      @Query('start') start?: string,
      @Query('end') end?: string
    ) {
        const startVal = start ? parseInt(start, 10) : 0;
        const endVal = end ? parseInt(end, 10) : 10;
        const statuses = status.split(',');
        return this.queuesService.getJobs(name, statuses, startVal, endVal);
  }

  @Post(':name/clean')
  clean(
      @Param('name') name: string, 
      @Body('type') type: 'completed' | 'failed' | 'delayed' | 'wait' | 'active'
    ) {
    return this.queuesService.cleanQueue(name, type);
  }

  @Post(':name/job')
  addJob(@Param('name') name: string, @Body() data: any) {
      return this.queuesService.addJob(name, data);
  }

  @Delete(':name/job/:jobId')
  removeJob(@Param('name') name: string, @Param('jobId') jobId: string) {
      return this.queuesService.removeJob(name, jobId);
  }

  @Delete(':name/obliterate') // Full removal
  obliterate(@Param('name') name: string) {
      return this.queuesService.obliterateQueue(name);
  }

  @Post(':name/drain') // Empty jobs
  drain(@Param('name') name: string) {
      return this.queuesService.emptyQueue(name);
  }

  @Post(':name/pause')
  pause(@Param('name') name: string) {
      return this.queuesService.pauseQueue(name);
  }

  @Post(':name/resume')
  resume(@Param('name') name: string) {
      return this.queuesService.resumeQueue(name);
  }
}
