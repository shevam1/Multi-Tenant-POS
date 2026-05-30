import { Global, Module } from '@nestjs/common';
import { StripeService } from './stripe.service';

/** Global so any module can inject StripeService without importing StripeModule. */
@Global()
@Module({
  providers: [StripeService],
  exports: [StripeService],
})
export class StripeModule {}
