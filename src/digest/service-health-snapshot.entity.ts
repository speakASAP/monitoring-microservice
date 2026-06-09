import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export interface SnapshotServiceEntry {
  name: string;
  healthy: boolean;
  responseTimeMs: number;
  error?: string;
}

@Entity({ name: 'service_health_snapshots', schema: 'monitoring' })
export class ServiceHealthSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date', unique: true, name: 'snapshot_date' })
  snapshotDate: string; // 'YYYY-MM-DD'

  @Column({ type: 'jsonb' })
  services: SnapshotServiceEntry[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
