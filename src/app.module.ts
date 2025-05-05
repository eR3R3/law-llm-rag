import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { KnowledgeBaseModule } from './knowledge-base/knowledge-base.module';

@Module({
  imports: [KnowledgeBaseModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
