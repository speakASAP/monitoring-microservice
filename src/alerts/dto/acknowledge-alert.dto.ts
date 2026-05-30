import { IsString } from 'class-validator';

export class AcknowledgeAlertDto {
  @IsString()
  acknowledgedBy: string;
}
