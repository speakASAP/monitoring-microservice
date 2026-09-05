import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './config/configuration';
import { HealthController } from './health/health.controller';
import { RepairModule } from './repair/repair.module';
import { AlertsModule } from './alerts/alerts.module';
import { ServicesModule } from './services/services.module';
import { DigestModule } from './digest/digest.module';
import { MarathonMonitoringModule } from './marathon-monitoring/marathon-monitoring.module';
import { AuthConsumerModule } from './auth/auth-consumer.module';
import { SessionController } from './auth/session.controller';
import { CustomerIntegrationsModule } from './customer-integrations/customer-integrations.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    AuthConsumerModule,
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cs: ConfigService) => ({
        type: 'postgres',
        host: cs.get('db.host'),
        port: cs.get('db.port'),
        username: cs.get('db.username'),
        password: cs.get('db.password'),
        database: cs.get('db.database'),
        schema: 'monitoring',
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
    AlertsModule,
    RepairModule,
    ServicesModule,
    DigestModule,
    MarathonMonitoringModule,
    CustomerIntegrationsModule,
  ],
  controllers: [HealthController, SessionController],
})
export class AppModule {}
