import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Alert } from './alerts.entity';
import { CreateAlertDto } from './dto/create-alert.dto';
import { AcknowledgeAlertDto } from './dto/acknowledge-alert.dto';

@Injectable()
export class AlertsService {
  constructor(@InjectRepository(Alert) private repo: Repository<Alert>) {}

  findActive(): Promise<Alert[]> {
    return this.repo.find({ where: { status: 'active' }, order: { firedAt: 'DESC' } });
  }

  findAll(): Promise<Alert[]> {
    return this.repo.find({ order: { firedAt: 'DESC' }, take: 200 });
  }

  async create(dto: CreateAlertDto): Promise<Alert> {
    const alert = this.repo.create(dto);
    return this.repo.save(alert);
  }

  async acknowledge(id: string, dto: AcknowledgeAlertDto): Promise<Alert> {
    const alert = await this.repo.findOne({ where: { id } });
    if (!alert) throw new NotFoundException(`Alert ${id} not found`);
    alert.status = 'acknowledged';
    alert.acknowledgedBy = dto.acknowledgedBy;
    alert.acknowledgedAt = new Date();
    return this.repo.save(alert);
  }

  async resolve(id: string): Promise<Alert> {
    const alert = await this.repo.findOne({ where: { id } });
    if (!alert) throw new NotFoundException(`Alert ${id} not found`);
    alert.status = 'resolved';
    return this.repo.save(alert);
  }
}
