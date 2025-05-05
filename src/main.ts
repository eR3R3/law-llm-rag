import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';

async function bootstrap() {
  dotenv.config();
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  
  // Configure file upload size limit
  app.use((req, res, next) => {
    res.setHeader('Content-Length', '50mb');
    next();
  });
  
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
