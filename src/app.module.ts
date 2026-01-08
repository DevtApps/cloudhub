import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, Reflector } from '@nestjs/core';

import { SystemModule } from './system/system.module';
import { FilesModule } from './files/files.module';
import { MetricAgentModule } from './metric-agent/metric-agent.module';
import { FirewallModule } from './firewall/firewall.module';
import { ServicesManagerModule } from './services-manager/services-manager.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    
    // Rate Limiting (Default: 10 requests per minute)
    ThrottlerModule.forRoot([{
        ttl: 60000,
        limit: 100,
    }]),

    AuthModule,
    SystemModule,
    FilesModule,
    MetricAgentModule,
    FirewallModule,
    ServicesManagerModule,
  
    // Database Connection
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('POSTGRES_HOST'),
        port: configService.get<number>('POSTGRES_PORT'),
        username: configService.get<string>('POSTGRES_USER'),
        password: configService.get<string>('POSTGRES_PASSWORD'),
        database: configService.get<string>('POSTGRES_DB'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: true, // Force true for dev environment to create tables
        autoLoadEntities: true,
      }),
      inject: [ConfigService],
    }),
    // Queue Configuration
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get<string>('REDIS_HOST'),
          port: configService.get<number>('REDIS_PORT'),
          password: configService.get<string>('REDIS_PASSWORD'),
          db: configService.get<number>('REDIS_DB'),
        },
      }),
      inject: [ConfigService],
    }),
    // Logger Configuration
    WinstonModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        transports: [
          new winston.transports.Console({
            format: winston.format.combine(
              winston.format.timestamp(),
              winston.format.ms(),
              winston.format.colorize(),
              winston.format.printf(({ timestamp, level, message, ms }) => {
                return `${timestamp} ${level}: ${message} ${ms}`;
              }),
            ),
          }),
          // Add file transports here based on LOGS_DIR if needed
        ],
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [],
  providers: [
      Reflector,
      {
          provide: APP_GUARD,
          useClass: ThrottlerGuard,
      },
      {
          provide: APP_GUARD,
          useClass: JwtAuthGuard,
      },
  ],
})
export class AppModule {}
