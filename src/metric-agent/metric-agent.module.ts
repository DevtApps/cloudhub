import { Module } from '@nestjs/common';
import { QueuesModule } from '../queues/queues.module';
import { RegexModule } from '../regex/regex.module';
import { SourcesModule } from '../sources/sources.module';

@Module({
  imports: [
    QueuesModule,
    RegexModule,
    SourcesModule
  ],
  exports: [
    QueuesModule,
    RegexModule,
    SourcesModule
  ]
})
export class MetricAgentModule {}
