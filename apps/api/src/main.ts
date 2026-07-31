import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { AppConfigService } from './config/config.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const config = app.get(AppConfigService);

  app.enableCors({
    origin: config.isProduction ? (process.env.WEB_ORIGIN ?? false) : true,
    credentials: true,
  });

  // Unexpected fields are rejected, not silently dropped, so a typo in a client request
  // fails loudly instead of quietly posting something other than what was intended.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(config.port);
  console.log(`LedgerLine API listening on port ${config.port}`);
}

bootstrap();
