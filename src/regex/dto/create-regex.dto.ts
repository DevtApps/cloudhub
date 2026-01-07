import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsArray } from 'class-validator';

export class CreateRegexDto {
  @IsString()
  @IsNotEmpty()
  key: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  pattern: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsArray()
  @IsOptional()
  fields?: string[];
}
