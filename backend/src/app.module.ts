import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NodesModule } from './nodes/nodes.module';
import { NodeEntity } from './database/entities/node.entity';
import { GpuEntity } from './database/entities/gpu.entity';
import { GpuMetricEntity } from './database/entities/gpu-metric.entity';
import { NodeEventEntity } from './database/entities/node-event.entity';
import { AuthModule } from './auth/auth.module';
import { User } from './database/user.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: 'database.sqlite',
      entities: [NodeEntity, GpuEntity, GpuMetricEntity, NodeEventEntity, User],
      synchronize: true, // Automatically sync DB schema for MVP
      logging: false,
    }),
    NodesModule,
    AuthModule,
  ],
})
export class AppModule {}
