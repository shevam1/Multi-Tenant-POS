import { Module } from '@nestjs/common';
import { PetOptionsController } from './pet-options.controller';
import { PetOptionsService } from './pet-options.service';

@Module({
  controllers: [PetOptionsController],
  providers: [PetOptionsService],
  exports: [PetOptionsService],
})
export class PetOptionsModule {}
