import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

import { Request, Response, NextFunction } from 'express';
import * as express from 'express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  if (!process.env.JWT_SECRET) {
    console.error('FATAL: JWT_SECRET environment variable is not set. The application cannot start securely.');
    console.error('Set JWT_SECRET in your .env file or environment before starting the server.');
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule);

  // Raw CORS middleware — must be first, before everything, so OPTIONS
  // preflight is handled before any Guard/Interceptor/ExceptionFilter fires.
  // NestJS enableCors() may not attach CORS headers to error responses from
  // global guards, so this explicit middleware guarantees they are always sent.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin || '*';
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  app.useGlobalFilters(new AllExceptionsFilter());

  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: 'Content-Type,Authorization',
    credentials: true,
    optionsSuccessStatus: 204,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('نظام أسس التفتيش المطور - وزارة الداخلية')
    .setDescription(
      'مستندات الـ API لنظام إدارة لجان التفتيش والتقييم والتقارير الرسمية',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  app.use('/uploads', express.static(join(__dirname, '..', 'uploads')));

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(
    `Backend server successfully started on: http://localhost:${port}`,
  );
  console.log(
    `Swagger documentation available at: http://localhost:${port}/api/docs`,
  );
}
bootstrap();
