import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SourcesService } from './sources.service';
import { SourcesController } from './sources.controller';
import { DataSource } from './entities/source.entity';
import { QueuesModule } from '../queues/queues.module';
import { RegexModule } from '../regex/regex.module';

@Module({
  imports: [
      TypeOrmModule.forFeature([DataSource]),
      QueuesModule,
      RegexModule
  ],
  controllers: [SourcesController],
  providers: [SourcesService],
})
export class SourcesModule {}
