import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ schema: 'monitoring', name: 'customer_integration_events' })
@Index(['integrationId', 'createdAt'])
@Index(['ownerUserId', 'createdAt'])
@Index(['integrationId', 'eventId'], { unique: true, where: '"eventId" IS NOT NULL' })
export class CustomerIntegrationEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  integrationId: string;

  @Column()
  ownerUserId: string;

  @Column({ default: 'ingest' })
  source: string;

  @Column({ default: 'event' })
  eventType: string;

  @Column({ nullable: true })
  eventId: string;

  @Column({ default: 'unknown' })
  status: string;

  @Column({ default: 'info' })
  severity: string;

  @Column({ type: 'text', nullable: true })
  message: string;

  @Column({ type: 'jsonb', nullable: true })
  payloadSummary: Record<string, unknown> | null;

  @Column({ nullable: true })
  observedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
