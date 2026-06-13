import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ schema: 'monitoring', name: 'customer_integrations' })
@Index(['ownerUserId'])
export class CustomerIntegration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  ownerUserId: string;

  @Column({ nullable: true })
  ownerEmail: string;

  @Column()
  name: string;

  @Column({ default: 'custom' })
  serviceType: string;

  @Column({ default: 'https' })
  endpointType: string;

  @Column()
  baseUrl: string;

  @Column({ default: '/health' })
  healthPath: string;

  @Column({ nullable: true })
  webhookPath: string;

  @Column({ default: 'active' })
  status: string;

  @Column({ nullable: true })
  apiKeyId: string;

  @Column({ nullable: true })
  apiKeyHash: string;

  @Column({ nullable: true })
  apiKeyPreview: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
