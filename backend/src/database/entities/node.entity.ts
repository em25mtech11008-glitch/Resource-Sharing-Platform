import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { GpuEntity } from './gpu.entity';
import { NodeEventEntity } from './node-event.entity';

export enum NodeStatus {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
  AVAILABLE = 'AVAILABLE',
  BUSY = 'BUSY',
}

@Entity({ name: 'nodes' })
export class NodeEntity {
  @PrimaryColumn({ type: 'varchar', length: 128 })
  node_id: string;

  @Column({ type: 'varchar', length: 255, default: 'GPU Node' })
  node_name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  hostname: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  os: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  cpu: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  ram: string;

  @Column({
    type: 'varchar',
    default: NodeStatus.OFFLINE,
  })
  status: NodeStatus;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  last_seen: Date;

  @OneToMany(() => GpuEntity, (gpu) => gpu.node, { cascade: true })
  gpus: GpuEntity[];

  @OneToMany(() => NodeEventEntity, (event) => event.node)
  events: NodeEventEntity[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
