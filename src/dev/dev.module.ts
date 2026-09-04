import { Module } from '@nestjs/common';
import { DevController } from './dev.controller';

@Module({
  controllers: [DevController],
})
export class DevModule {}
