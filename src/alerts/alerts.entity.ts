import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'alerts', schema: 'monitoring' })
export class Alert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  alertname: string;

  @Column()
  service: string;

  @Column({ default: 'warning' })
  severity: string;

  @Column('text')
  message: string;

  @Column({ default: 'active' })
  status: string;

  @Column({ nullable: true })
  labels: string;

  @Column({ nullable: true })
  acknowledgedBy: string;

  @Column({ nullable: true })
  acknowledgedAt: Date;

  @CreateDateColumn()
  firedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
