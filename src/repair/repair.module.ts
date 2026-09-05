import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RepairAttempt } from './repair-attempt.entity';
import { RepairService } from './repair.service';
import { RepairVerifier } from './repair-verifier';
import { AlertsModule } from '../alerts/alerts.module';
import { KubeClient } from '../k8s/kube-client';
import { LogReadClient } from '../common/logging/log-read.client';
import { NotificationsClient } from '../common/notifications/notifications.client';

@Module({
  imports: [TypeOrmModule.forFeature([RepairAttempt]), AlertsModule],
  providers: [RepairService, RepairVerifier, KubeClient, LogReadClient, NotificationsClient],
  exports: [RepairService, RepairVerifier],
})
export class RepairModule {}
