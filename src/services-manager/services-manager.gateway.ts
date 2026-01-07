import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { spawn, ChildProcess } from 'child_process';
import { Logger } from '@nestjs/common';

@WebSocketGateway({ cors: { origin: '*' } })
export class ServicesManagerGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger(ServicesManagerGateway.name);

  // Map to store active log streams per client
  // Key: clientId, Value: Map<serviceName, ChildProcess>
  private activeStreams: Map<string, Map<string, ChildProcess>> = new Map();

  handleConnection(client: Socket) {
     // connected
  }

  handleDisconnect(client: Socket) {
    this.cleanupClientStreams(client.id);
  }

  @SubscribeMessage('subscribe-service-logs')
  handleSubscribeLogs(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { name: string }
  ) {
    const { name } = data;
    const clientId = client.id;
    const serviceName = `custom-${name}`;

    if (!this.activeStreams.has(clientId)) {
      this.activeStreams.set(clientId, new Map());
    }
    const clientStreams = this.activeStreams.get(clientId);

    if (clientStreams.has(name)) {
        return;
    }

    this.logger.log(`Starting log stream for ${serviceName} (Client: ${clientId})`);

    // Note: If running as non-root, this depends on user permissions (e.g. systemd-journal group)
    // For now we assume the user running the backend has access or privileges.
    // If sudo is required, "sudo journalctl" must be used and sudoers configured for passwordless access.
    
    // We try without sudo first, assuming development env or proper groups.
    // In production (cloud-hub user), 'journalctl' usually works if user is in systemd-journal.
    // If not, we might need to prefix with 'sudo'.
    
    // Let's use 'sudo' if we are not root, assuming the sudoers file allows it (which we set up).
    // The install.sh didn't explicitely add journalctl to sudoers, so let's try direct first.
    
    const journal = spawn('journalctl', [
        '-f', 
        '-u', serviceName, 
        '-n', '100', 
        '--no-pager',
        '--output', 'cat' 
    ]);

    clientStreams.set(name, journal);

    journal.stdout.on('data', (chunk) => {
        client.emit('service-log-chunk', { name, data: chunk.toString() });
    });

    journal.stderr.on('data', (chunk) => {
        client.emit('service-log-chunk', { name, data: chunk.toString() });
    });

    journal.on('error', (err) => {
        this.logger.error(`Error spawning journalctl for ${serviceName}: ${err.message}`);
        client.emit('service-log-chunk', { name, data: `\n[System Error] Failed to read logs: ${err.message}\n` });
    });

    journal.on('close', (code) => {
        clientStreams.delete(name);
    });
  }

  @SubscribeMessage('unsubscribe-service-logs')
  handleUnsubscribeLogs(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { name: string }
  ) {
      const clientId = client.id;
      const clientStreams = this.activeStreams.get(clientId);
      if (clientStreams && clientStreams.has(data.name)) {
          const process = clientStreams.get(data.name);
          process.kill();
          clientStreams.delete(data.name);
      }
  }

  private cleanupClientStreams(clientId: string) {
      if (this.activeStreams.has(clientId)) {
          const streams = this.activeStreams.get(clientId);
          streams.forEach((proc) => proc.kill());
          this.activeStreams.delete(clientId);
      }
  }
}
