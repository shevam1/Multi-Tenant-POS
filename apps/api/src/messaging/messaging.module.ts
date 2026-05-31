import { Global, Module } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { RemindersService } from './reminders.service';
import { RemindersController } from './reminders.controller';
import { RemindersJob } from './reminders.job';
import { SmsAutoReplyService } from './sms-auto-reply.service';
import { SmsAutoReplyController } from './sms-auto-reply.controller';

/** Global so the forms (agreement-signed) + cron flows can post system messages. */
@Global()
@Module({
  controllers: [MessagesController, RemindersController, SmsAutoReplyController],
  providers: [MessagingService, MessagesService, RemindersService, RemindersJob, SmsAutoReplyService],
  exports: [MessagingService, MessagesService, RemindersService, SmsAutoReplyService],
})
export class MessagingModule {}
