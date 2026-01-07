import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { FirewallService } from './firewall.service';
import { CreateFirewallRuleDto } from './dto/create-rule.dto';

@Controller('firewall')
export class FirewallController {
  constructor(private readonly firewallService: FirewallService) {}

  @Get()
  getStatus() {
    return this.firewallService.getStatus();
  }

  @Post('toggle')
  toggle(@Body('enable') enable: boolean) {
      return this.firewallService.toggle(enable);
  }

  @Post('rules')
  addRule(@Body() dto: CreateFirewallRuleDto) {
      return this.firewallService.addRule(dto);
  }

  @Put('rules/:id')
  updateRule(@Param('id') id: string, @Body() dto: CreateFirewallRuleDto) {
      return this.firewallService.updateRule(parseInt(id), dto);
  }

  @Delete('rules/:id')
  deleteRule(@Param('id') id: string) {
      return this.firewallService.deleteRule(parseInt(id));
  }
}
