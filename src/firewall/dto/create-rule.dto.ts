import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export enum RuleAction {
  ALLOW = 'allow',
  DENY = 'deny',
  REJECT = 'reject',
  LIMIT = 'limit'
}

export enum Protocol {
  TCP = 'tcp',
  UDP = 'udp',
  ANY = 'any'
}

export class CreateFirewallRuleDto {
  @IsEnum(RuleAction)
  action: RuleAction;

  @IsNotEmpty()
  @IsString()
  port: string;

  @IsEnum(Protocol)
  @IsOptional()
  protocol?: Protocol = Protocol.ANY;

  @IsString()
  @IsOptional()
  source?: string = 'any';

  @IsString()
  @IsOptional()
  comment?: string;
}
