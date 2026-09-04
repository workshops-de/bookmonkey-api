import { Module } from '@nestjs/common';
import { DevController } from './dev.controller.js';

@Module({
  controllers: [DevController],
})
export class DevModule {}
