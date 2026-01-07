import { IsString, IsEnum, IsBoolean, IsOptional } from 'class-validator';
import { SourceType } from '../entities/source.entity';

export class CreateSourceDto {
  @IsString()
  name: string;

  @IsEnum(SourceType)
  type: SourceType;

  @IsString()
  config: string;

  @IsString()
  @IsOptional()
  targetQueue?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsOptional()
  @IsString({ each: true })
  patternIds?: string[];
}
