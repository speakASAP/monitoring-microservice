import { IsIn, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class UpdateCustomerIntegrationDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  serviceType?: string;

  @IsOptional()
  @IsIn(['https', 'webhook', 'api', 'custom'])
  endpointType?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  @MaxLength(500)
  baseUrl?: string;

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
