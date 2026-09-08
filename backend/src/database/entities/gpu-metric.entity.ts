import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { GpuEntity } from './gpu.entity';

@Entity({ name: 'gpu_metrics' })
@Index(['gpu_id', 'timestamp'])
@Index(['node_id', 'timestamp'])
export class GpuMetricEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  gpu_id: string;

  @ManyToOne(() => GpuEntity, (gpu) => gpu.metrics, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'gpu_id' })
  gpu: GpuEntity;

  @Column({ type: 'varchar', length: 128 })
  node_id: string;

  @Column({ type: 'float', default: 0 })
  utilization: number; // GPU core % (0-100)

  @Column({ type: 'float', default: 0 })
  memory_utilization: number; // Memory controller % (0-100)

  @Column({ type: 'bigint', default: 0 })
  memory_used: number; // MB

  @Column({ type: 'bigint', default: 0 })
  memory_free: number; // MB

  @Column({ type: 'float', default: 0 })
  temperature: number; // Celsius

  @Column({ type: 'float', default: 0 })
  power_draw: number; // Watts

  @Column({ type: 'float', default: 0 })
  power_limit: number; // Watts

  @CreateDateColumn({ type: 'timestamptz' })
  timestamp: Date;
}
