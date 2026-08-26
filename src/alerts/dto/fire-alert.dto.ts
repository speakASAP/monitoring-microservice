import { IsString, IsIn, IsOptional, IsNotEmpty } from 'class-validator';

export class FireAlertDto {
  @IsString()
  @IsNotEmpty()
  alertname: string;

  @IsString()
  @IsNotEmpty()
  service: string;

  @IsIn(['info', 'warning', 'critical'])
  severity: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  /**
   * Dedup identity. Callers without an Alertmanager fingerprint (the deploy
   * queue) should pass a stable synthetic one such as
   * `deploy:<service>` so repeat failures update one row instead of inserting.
   */
  @IsOptional()
  @IsString()
  fingerprint?: string;

  @IsOptional()
  @IsString()
  labels?: string;
}

export class ResolveAlertDto {
  /** Resolve by dedup identity — preferred, closes exactly one alert. */
  @IsOptional()
  @IsString()
  fingerprint?: string;

  /** Resolve every active alert for a service. Used when no fingerprint exists. */
  @IsOptional()
  @IsString()
  service?: string;
}
