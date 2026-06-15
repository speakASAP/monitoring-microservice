import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCustomerIntegrationEventDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  eventId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  eventType?: string;

  @IsOptional()
  @IsIn(['healthy', 'degraded', 'failing', 'resolved', 'event', 'unknown'])
  status?: string;

  @IsOptional()
  @IsIn(['info', 'warning', 'critical'])
  severity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  observedAt?: string;

  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;
}
