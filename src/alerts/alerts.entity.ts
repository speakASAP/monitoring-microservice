import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export type AlertStatus = 'active' | 'acknowledged' | 'resolved';

@Entity({ name: 'alerts', schema: 'monitoring' })
@Index('idx_alerts_status_fired', ['status', 'firedAt'])
export class Alert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  alertname: string;

  /**
   * The Prometheus `job`/`service` label — for Alertmanager-sourced alerts this
   * is the SCRAPER (kube-state-metrics, blackbox-http), not the affected app.
   * Use `fingerprint` for identity and `message` for what is actually broken.
   */
  @Column()
  service: string;

  @Column({ default: 'warning' })
  severity: string;

  @Column('text')
  message: string;

  @Column({ default: 'active' })
  status: AlertStatus;

  @Column({ nullable: true })
  labels: string;

  /**
   * Alertmanager's stable hash of the alert's label set — the correct dedup key.
   * A partial unique index (uq_alerts_active_fingerprint) enforces at most one
   * ACTIVE row per fingerprint, so a re-fire updates instead of inserting.
   * Null for alerts predating the lifecycle migration and for sources that do
   * not supply one; the index is scoped to NOT NULL so those never collide.
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  fingerprint: string | null;

  /**
   * How many times this alert has fired without an intervening resolve.
   * Alertmanager re-POSTs every `repeat_interval` (4h), so this climbs on its
   * own for a long-running problem.
   */
  @Column({ default: 1 })
  occurrenceCount: number;

  @Column({ type: 'timestamp', nullable: true })
  lastFiredAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt: Date | null;

  @Column({ nullable: true })
  acknowledgedBy: string;

  @Column({ nullable: true })
  acknowledgedAt: Date;

  @CreateDateColumn()
  firedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
