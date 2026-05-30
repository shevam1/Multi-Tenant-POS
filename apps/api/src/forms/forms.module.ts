import { Module } from '@nestjs/common';
import { FormsController } from './forms.controller';
import { PublicFormsController } from './public-forms.controller';
import { FormsService } from './forms.service';

@Module({
  controllers: [FormsController, PublicFormsController],
  providers: [FormsService],
  exports: [FormsService],
})
export class FormsModule {}
