import { IsString, IsIn, IsOptional } from 'class-validator';

export class CreateAlertDto {
  @IsString()
  alertname: string;

  @IsString()
  service: string;

  @IsIn(['info', 'warning', 'critical'])
  severity: string;

  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  labels?: string;
}
