import { Module } from '@nestjs/common';
import { ClaudeService } from './claude.service';
import { AiController } from './ai.controller';

@Module({
  controllers: [AiController],
  providers: [ClaudeService],
  exports: [ClaudeService],
})
export class IntelligenceModule {}
