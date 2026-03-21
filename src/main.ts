// DEVE ser o primeiro import — força tfjs JS puro antes do face-api carregar
import './face/face-api-setup';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import * as fs from 'fs';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.setGlobalPrefix('api/v1');

  const config = new DocumentBuilder()
    .setTitle('Smart Lock API')
    .setDescription('Backend da fechadura inteligente com NFC e reconhecimento facial')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const uploadDir = process.env.UPLOAD_DIR || './uploads/faces';
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🔐 Smart Lock Backend rodando em: http://localhost:${port}`);
  console.log(`📚 Swagger disponível em: http://localhost:${port}/docs`);
}

bootstrap();
