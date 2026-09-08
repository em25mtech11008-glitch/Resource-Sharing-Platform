import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NodeEntity } from '../database/entities/node.entity';
import { GpuEntity } from '../database/entities/gpu.entity';
import { GpuMetricEntity } from '../database/entities/gpu-metric.entity';
import { NodeEventEntity } from '../database/entities/node-event.entity';
import { NodesService } from './nodes.service';
import { NodesController } from './nodes.controller';
import { NodesGateway } from './nodes.gateway';
import { OfflineDetectorService } from './offline-detector.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NodeEntity,
      GpuEntity,
      GpuMetricEntity,
      NodeEventEntity,
    ]),
  ],
  controllers: [NodesController],
  providers: [NodesService, NodesGateway, OfflineDetectorService],
  exports: [NodesService, NodesGateway],
})
export class NodesModule {}
