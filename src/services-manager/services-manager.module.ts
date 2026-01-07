import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServicesManagerController } from './services-manager.controller';
import { ServicesManagerService } from './services-manager.service';
import { ServicesManagerGateway } from './services-manager.gateway';
import { ConfigModule } from '@nestjs/config';
import { SystemService } from './entities/service.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([SystemService])
  ],
  controllers: [ServicesManagerController],
  providers: [ServicesManagerService, ServicesManagerGateway],
})
export class ServicesManagerModule {}
