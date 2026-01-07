import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async login(password: string) {
    const adminPassword = this.configService.get<string>('ADMIN_PASSWORD', 'admin');
    
    if (password !== adminPassword) {
      throw new UnauthorizedException('Invalid password');
    }

    const payload = { role: 'admin' };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
