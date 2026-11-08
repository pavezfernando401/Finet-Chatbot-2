import { LogLevel, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { optionalSetting } from './config/env.js';

const QUIET: LogLevel[] = ['error', 'warn', 'log'];
const VERBOSE: LogLevel[] = [...QUIET, 'debug', 'verbose'];

async function bootstrap() {
  // `rawBody` keeps the untouched bytes around so the Chatwoot webhook can
  // check the signature computed over them.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Nest turns every level on by default, debug included, and debug is where
  // message bodies go. Off unless asked for, so customer text stays out of
  // the logs. Set after create() so the level can come from .env.
  const level = optionalSetting(app.get(ConfigService), 'LOG_LEVEL');
  app.useLogger(level === 'debug' ? VERBOSE : QUIET);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // systemd or PM2 stop the process with SIGTERM: let Nest close cleanly.
  app.enableShutdownHooks();

  // HOST=127.0.0.1 keeps the bot off the internet when the site's backend,
  // its only caller, runs on the same machine. Unset, it listens everywhere.
  const host = optionalSetting(app.get(ConfigService), 'HOST');
  const port = process.env.PORT ?? 3000;
  await (host ? app.listen(port, host) : app.listen(port));
}
await bootstrap();
