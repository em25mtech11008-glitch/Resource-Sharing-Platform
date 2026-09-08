import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NodesModule } from './nodes/nodes.module';
import { NodeEntity } from './database/entities/node.entity';
import { GpuEntity } from './database/entities/gpu.entity';
import { GpuMetricEntity } from './database/entities/gpu-metric.entity';
import { NodeEventEntity } from './database/entities/node-event.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USER || 'gpu_user',
      password: process.env.DB_PASSWORD || 'gpu_password',
      database: process.env.DB_NAME || 'p2p_gpu',
      entities: [NodeEntity, GpuEntity, GpuMetricEntity, NodeEventEntity],
      synchronize: true, // Automatically sync DB schema for MVP
      logging: false,
    }),
    NodesModule,
  ],
})
export class AppModule {}
