import { Global, Module } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { RemindersService } from './reminders.service';
import { RemindersController } from './reminders.controller';
import { RemindersJob } from './reminders.job';

/** Global so the forms (agreement-signed) + cron flows can post system messages. */
@Global()
@Module({
  controllers: [MessagesController, RemindersController],
  providers: [MessagingService, MessagesService, RemindersService, RemindersJob],
  exports: [MessagingService, MessagesService, RemindersService],
})
export class MessagingModule {}
