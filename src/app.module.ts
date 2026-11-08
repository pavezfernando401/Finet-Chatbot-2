import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { MessagesModule } from './messages/messages.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, expandVariables: true }),
    MessagesModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
