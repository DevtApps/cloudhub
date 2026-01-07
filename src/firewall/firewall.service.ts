import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import { CreateFirewallRuleDto, RuleAction, Protocol } from './dto/create-rule.dto';

const execAsync = promisify(exec);

export interface FirewallRule {
  id: number;
  to: string;
  action: string;
  from: string;
  ipv6: boolean;
  comment?: string;
}

export interface FirewallStatus {
  status: 'active' | 'inactive';
  rules: FirewallRule[];
}

@Injectable()
export class FirewallService {
  private readonly logger = new Logger(FirewallService.name);
  // Use -n to prevent sudo from waiting for password interactively
  private readonly IPTABLES_CMD = 'sudo -n iptables';

  private async runCommand(command: string): Promise<string> {
    try {
      // Direct iptables execution
      const fullCmd = `${this.IPTABLES_CMD} ${command}`;
      const { stdout } = await execAsync(fullCmd);
      return stdout.trim();
    } catch (error) {
      this.logger.error(`Command failed: ${this.IPTABLES_CMD} ${command}`, error);
      throw new InternalServerErrorException(`Firewall operation failed: ${error.message}`);
    }
  }

  private async ruleExists(rule: string): Promise<boolean> {
      try {
          await execAsync(`${this.IPTABLES_CMD} -C ${rule}`);
          return true;
      } catch {
          return false;
      }
  }

  async getStatus(): Promise<FirewallStatus> {
    try {
        // List INPUT chain with line numbers and numeric output
        const output = await this.runCommand('-L INPUT -n --line-numbers');
        const lines = output.split('\n');
        
        // Parse Policy from first line: "Chain INPUT (policy ACCEPT)" or "Chain INPUT (policy DROP)"
        const policyMatch = lines[0].match(/policy\s+(ACCEPT|DROP|REJECT)/i);
        const policy = policyMatch ? policyMatch[1].toUpperCase() : 'ACCEPT';
        const isActive = policy !== 'ACCEPT'; // If default is not ACCEPT, we consider it "active" (enforced)

        const rules: FirewallRule[] = [];
        // iptables output format:
        // num  target     prot opt source               destination         options
        // 1    ACCEPT     tcp  --  0.0.0.0/0            0.0.0.0/0            tcp dpt:22
        
        for (let i = 2; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line || !/^\d+/.test(line)) continue; // Must start with a number
            
            // Split by whitespace, limit to 6 (so the last part contains all options)
            // But wait, split with limit puts the rest in the last element? No, JS split limit truncates.
            // We should split and then join the rest.
            const parts = line.split(/\s+/);
            
            if (parts.length < 6) continue;

            const num = parts[0];
            const target = parts[1];
            const prot = parts[2];
            // parts[3] is opt usually '--'
            const source = parts[4];
            // parts[5] is destination
            
            // Options are everything from index 6 onwards
            const options = parts.slice(6).join(' ');
            
            // Extract ports and comments from options
            let to = 'any';
            let comment = '';
            
            // Try parse dpt (destination port)
            // dpt:22 or dpt:8080:8090 or multiport dports 80,443 (iptables syntax varies)
            const dptMatch = options.match(/dpt:(\S+)/); 
            if (dptMatch) {
                to = `${dptMatch[1]}/${prot}`;
            } else if (prot !== 'all' && prot !== '0') { // 0 is sometimes used for all
                 to = `any/${prot}`;
            }

            // Try parse comment
            const commentMatch = options.match(/comment "(.+?)"/);
            if (commentMatch) comment = commentMatch[1];

            rules.push({
                id: parseInt(num),
                to: to,
                action: target,
                from: source === '0.0.0.0/0' ? 'Anywhere' : source,
                ipv6: false, // iptables is ipv4
                comment: comment
            });
        }

        return { status: isActive ? 'active' : 'inactive', rules };
    } catch (error) {
        this.logger.error('Failed to get status', error);
        return { status: 'inactive', rules: [] };
    }
  }

  async toggle(enable: boolean) {
      if (enable) {
          // SAFE ENABLE:
          // 1. Allow Loopback
          if (!(await this.ruleExists('INPUT -i lo -j ACCEPT'))) {
             await this.runCommand('-A INPUT -i lo -j ACCEPT');
          }
          // 2. Allow Established/Related
          if (!(await this.ruleExists('INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT'))) {
             await this.runCommand('-A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT');
          }
          // 3. Allow SSH (22) if not exists
          if (!(await this.ruleExists('INPUT -p tcp --dport 22 -j ACCEPT'))) {
             await this.runCommand('-A INPUT -p tcp --dport 22 -j ACCEPT');
          }
          
          // Set Policy DROP
          await this.runCommand('-P INPUT DROP');
          return { success: true, message: 'Firewall Enabled (Policy DROP)' };
      } else {
          // Set Policy ACCEPT
          await this.runCommand('-P INPUT ACCEPT');
          // We DO NOT flush rules to keep configuration, just disable enforcement
          return { success: true, message: 'Firewall Disabled (Policy ACCEPT)' };
      }
  }

  private buildRuleParams(dto: CreateFirewallRuleDto): string {
      let cmd = '';
      
      // Protocol
      const proto = dto.protocol && dto.protocol !== Protocol.ANY ? dto.protocol : 'tcp';
      cmd += ` -p ${proto}`;

      // Port
      if (dto.port && dto.port !== 'any') {
          // iptables uses colons for ranges (start:end)
          const port = dto.port.replace('-', ':');
          cmd += ` --dport ${port}`;
      }

      // Source
      if (dto.source && dto.source !== 'any') {
          cmd += ` -s ${dto.source}`;
      }

      // Action
      const target = dto.action === 'allow' ? 'ACCEPT' : 
                     dto.action === 'deny' ? 'DROP' : 
                     dto.action === 'reject' ? 'REJECT' : 'ACCEPT';
      cmd += ` -j ${target}`;

      // Comment
      if (dto.comment) {
          cmd += ` -m comment --comment "${dto.comment}"`;
      }
      return cmd;
  }

  async addRule(dto: CreateFirewallRuleDto) {
      const params = this.buildRuleParams(dto);
      await this.runCommand(`-A INPUT ${params}`);
      return { success: true, message: `Rule added` };
  }

  async updateRule(id: number, dto: CreateFirewallRuleDto) {
      const params = this.buildRuleParams(dto);
      await this.runCommand(`-R INPUT ${id} ${params}`);
      return { success: true, message: `Rule ${id} updated` };
  }

  async deleteRule(id: number) {
      // iptables -D INPUT <id>
      const cmd = `-D INPUT ${id}`;
      await this.runCommand(cmd);
      return { success: true, message: `Rule ${id} deleted` };
  }

  async reset() {
       // Flush all rules
       await this.runCommand('-P INPUT ACCEPT');
       await this.runCommand('-F');
       return { success: true };
  }
}
