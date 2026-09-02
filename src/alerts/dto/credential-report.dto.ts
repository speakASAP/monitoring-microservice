import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, Max } from 'class-validator';

/**
 * A consumer's verdict about its own service credential.
 *
 * Carries the outcome only. There is deliberately no token field: the reporter
 * probes with the credential it already holds, and a secret must never travel
 * to monitoring to be checked.
 */
export class CredentialReportDto {
  @IsString()
  @MaxLength(320)
  principal: string;

  @IsString()
  @MaxLength(200)
  target: string;

  @IsIn(['accepted', 'rejected', 'indeterminate'])
  verdict: 'accepted' | 'rejected' | 'indeterminate';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  detail?: string;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(599)
  status?: number;
}
