import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WsAdapter } from '@nestjs/platform-ws';
import { ValidationPipe, Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Enable CORS for dashboard frontend
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  });

  // Enable validation pipe for incoming request bodies
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // Use native WebSocket adapter (RFC 6455 ws) for seamless Python agent integration
  app.useWebSocketAdapter(new WsAdapter(app));

  const port = process.env.PORT || 4000;
  await app.listen(port);
  logger.log(`====================================================`);
  logger.log(`P2P GPU Backend & Control Server listening on port ${port}`);
  logger.log(`WebSocket endpoint active on ws://localhost:${port}`);
  logger.log(`REST API available at http://localhost:${port}/api/nodes`);
  logger.log(`====================================================`);
}
bootstrap();
