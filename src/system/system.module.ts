import { Module } from '@nestjs/common';
import { SystemController, AppController } from './system.controller';
import { QueuesModule } from '../queues/queues.module';

@Module({
  imports: [QueuesModule],
  controllers: [SystemController, AppController],
})
export class SystemModule {}
