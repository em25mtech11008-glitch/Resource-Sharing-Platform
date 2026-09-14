import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { NodeEntity } from './node.entity';
import { GpuMetricEntity } from './gpu-metric.entity';

export enum GpuAvailability {
  AVAILABLE = 'AVAILABLE',
  BUSY = 'BUSY',
  OFFLINE = 'OFFLINE',
}

@Entity({ name: 'gpus' })
@Index(['node_id', 'gpu_index'], { unique: true })
export class GpuEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 128 })
  node_id: string;

  @ManyToOne(() => NodeEntity, (node) => node.gpus, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'node_id' })
  node: NodeEntity;

  @Column({ type: 'int' })
  gpu_index: number;

  @Column({ type: 'varchar', length: 128, nullable: true })
  gpu_uuid: string;

  @Column({ type: 'varchar', length: 255 })
  gpu_name: string;

  @Column({ type: 'bigint', default: 0 })
  total_memory: number; // in MB

  @Column({ type: 'varchar', length: 100, nullable: true })
  driver_version: string;

  @Column({
    type: 'varchar',
    default: GpuAvailability.AVAILABLE,
  })
  availability: GpuAvailability;

  @OneToMany(() => GpuMetricEntity, (metric) => metric.gpu, { cascade: true })
  metrics: GpuMetricEntity[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
