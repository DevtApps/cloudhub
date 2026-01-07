import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RegexService } from './regex.service';
import { RegexController } from './regex.controller';
import { RegexPattern } from './entities/regex.entity';
import { QueuesModule } from '../queues/queues.module';

@Module({
  imports: [TypeOrmModule.forFeature([RegexPattern]), QueuesModule],
  controllers: [RegexController],
  providers: [RegexService],
  exports: [RegexService],
})
export class RegexModule {}
