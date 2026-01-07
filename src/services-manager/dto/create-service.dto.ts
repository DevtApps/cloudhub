import { IsNotEmpty, IsString, IsOptional, IsEnum } from 'class-validator';

export class CreateServiceDto {
    @IsNotEmpty()
    @IsString()
    name: string;

    @IsNotEmpty()
    @IsString()
    script: string;

    @IsEnum(['node', 'python3', 'bash'])
    interpreter: 'node' | 'python3' | 'bash';

    @IsOptional()
    @IsString()
    description?: string;
}
