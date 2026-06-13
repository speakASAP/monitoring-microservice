import { IsIn, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateCustomerIntegrationDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  serviceType?: string;

  @IsOptional()
  @IsIn(['https', 'webhook', 'api', 'custom'])
  endpointType?: string;

  @IsUrl({ require_tld: false })
  @MaxLength(500)
  baseUrl: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  healthPath?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  webhookPath?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
