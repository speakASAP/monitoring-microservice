import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { CheckResult } from './repair-verifier';

/**
 * One attempt to repair one alert fingerprint.
 *
 * Keyed on the alert fingerprint rather than describing an incident of its own,
 * so the alert store stays the single source of truth about what is broken and
 * this table only records what was done about it. That separation is
 * deliberate: EP-TASK-006 warned that Phase 5 must not invent a second,
 * parallel incident model beside the writerless `monitoring.incidents`.
 */
export type RepairStatus =
  | 'shadow'
  | 'blocked'
  | 'proposed'
  | 'in_progress'
  | 'verifying'
  | 'verified'
  | 'failed'
  | 'abandoned';

@Entity({ name: 'repair_attempts', schema: 'monitoring' })
@Index('idx_repair_attempts_fingerprint', ['fingerprint', 'startedAt'])
export class RepairAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  fingerprint: string;

  @Column({ type: 'varchar', length: 255 })
  alertname: string;

  /** Ledger surface name, which is what eligibility is decided against. */
  @Column({ type: 'varchar', length: 255 })
  surface: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  service: string | null;

  @Column({ type: 'varchar', length: 32, default: 'proposed' })
  status: RepairStatus;

  /** Why the gate refused. Written verbatim into the escalation message. */
  @Column({ name: 'blocked_reason', type: 'text', nullable: true })
  blockedReason: string | null;

  @Column({ name: 'goal_id', type: 'varchar', length: 255, nullable: true })
  goalId: string | null;

  @Column({ name: 'commit_sha', type: 'varchar', length: 64, nullable: true })
  commitSha: string | null;

  /** Full per-check verdicts, kept so a disputed outcome can be re-read later. */
  @Column({ type: 'jsonb', nullable: true })
  checks: CheckResult[] | null;

  @Column({ name: 'verification_summary', type: 'text', nullable: true })
  verificationSummary: string | null;

  @Column({ name: 'started_at', type: 'timestamp' })
  startedAt: Date;

  @Column({ name: 'finished_at', type: 'timestamp', nullable: true })
  finishedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
