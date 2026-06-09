import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceHealthSnapshot } from './service-health-snapshot.entity';
import { DailyDigestService } from './daily-digest.service';
import { DigestController } from './digest.controller';
import { ServicesModule } from '../services/services.module';
import { NotificationsClient } from '../common/notifications/notifications.client';
import { LoggingService } from '../common/logging/logging.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ServiceHealthSnapshot]),
    ServicesModule,
  ],
  controllers: [DigestController],
  providers: [DailyDigestService, NotificationsClient, LoggingService],
})
export class DigestModule {}
