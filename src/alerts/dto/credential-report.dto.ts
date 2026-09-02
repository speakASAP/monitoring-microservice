import { IsIn, IsInt, IsISO8601, IsOptional, IsString, MaxLength, Min, Max } from 'class-validator';

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

  /**
   * The `exp` of the token the reporter presented, as an ISO-8601 string.
   *
   * Optional by design: auth cannot supply this — it stores principals, not
   * issued tokens — so only the reporter can read it, and making it required
   * would break every reporter written before the field existed.
   *
   * Still not a substitute for the verdict. On 2026-08-18 every token carried a
   * far-future `exp` and none of them verified, so this annotates a probe
   * result and never stands in for one.
   */
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
