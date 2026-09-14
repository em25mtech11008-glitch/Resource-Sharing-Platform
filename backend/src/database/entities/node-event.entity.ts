import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { NodeEntity } from './node.entity';

@Entity({ name: 'node_events' })
@Index(['node_id', 'timestamp'])
export class NodeEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 128 })
  node_id: string;

  @ManyToOne(() => NodeEntity, (node) => node.events, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'node_id' })
  node: NodeEntity;

  @Column({ type: 'varchar', length: 64 })
  event_type: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  timestamp: Date;
}
