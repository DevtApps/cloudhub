import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Enable CORS
  const configService = app.get(ConfigService);
  
  app.setGlobalPrefix('api');

  app.enableCors({
    origin: configService.get('CORS_ORIGIN', 'http://localhost:3000'),
    credentials: true,
  });

  // Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Swagger Documentation
  const config = new DocumentBuilder()
    .setTitle('Metric Hub API')
    .setDescription('The Metric Hub API description')
    .setVersion('1.0')
    .addTag('metrics')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Start Server
  const port = configService.get('API_PORT', 3001);
  await app.listen(port);
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
