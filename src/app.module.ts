import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './config/configuration';
import { HealthController } from './health/health.controller';
import { AlertsModule } from './alerts/alerts.module';
import { ServicesModule } from './services/services.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
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
    ServicesModule,
    WebhooksModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
