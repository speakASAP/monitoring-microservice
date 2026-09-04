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
   * The service this alert is about. Live sources (HealthWatcher, the deploy
   * queue) set the affected service directly.
   *
   * Historical rows are NOT like that. Until the observability stack was retired
   * on 2026-08-27 this held the Prometheus `job` label, which names the SCRAPER
   * (kube-state-metrics, blackbox-http), not the affected app — so on old rows
   * `message` is the only place the real subject appears. Reading this column as
   * the subject of a pre-2026-08-27 alert will mislead you.
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
   * Dedup identity. Live sources pass a stable synthetic value (`health:<name>`,
   * `deploy:<service>`); historical rows carry the retired Alertmanager hash of
   * the label set.
   * A partial unique index (uq_alerts_active_fingerprint) enforces at most one
   * ACTIVE row per fingerprint, so a re-fire updates instead of inserting.
   * Null for alerts predating the lifecycle migration and for sources that do
   * not supply one; the index is scoped to NOT NULL so those never collide.
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  fingerprint: string | null;

  /**
   * How many times this alert has fired without an intervening resolve. A
   * long-running problem climbs this on its own, once per HealthWatcher sweep
   * (5 min) or once per failing deploy.
   */
  @Column({ default: 1 })
  occurrenceCount: number;

  @Column({ type: 'timestamp', nullable: true })
  lastFiredAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt: Date | null;

  /**
   * When this alert entered the deferred-resolve state, or null if it is not
   * awaiting a recovery announcement.
   *
   * A resolve does not notify immediately. The row is marked resolved at once
   * so the digest and findActive() stop naming it, but the ✅ message is held
   * until the service has stayed quiet for ALERT_FLAP_WINDOW_MINUTES. A re-fire
   * inside that window reopens this same row silently instead of announcing a
   * recovery followed by a fresh outage.
   */
  @Column({ type: 'timestamp', nullable: true })
  pendingResolveSince: Date | null;

  /**
   * How many times this alert has resolved and re-fired inside the flap window.
   *
   * Never resets while the alert stays open, so it is the honest measure of an
   * unstable target. Surfaced in the repeat message: the flapping itself is the
   * signal worth acting on once suppression makes the cycles invisible.
   */
  @Column({ default: 0 })
  flapCount: number;

  /**
   * When a message about this alert was last actually delivered - not when it
   * last fired. Drives the repeat backoff, so a long-running outage restates
   * itself on an escalating schedule instead of on every 5-minute tick.
   */
  @Column({ type: 'timestamp', nullable: true })
  lastNotifiedAt: Date | null;

  @Column({ nullable: true })
  acknowledgedBy: string;

  @Column({ nullable: true })
  acknowledgedAt: Date;

  @CreateDateColumn()
  firedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
