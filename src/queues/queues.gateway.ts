import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' } })
export class QueuesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: any) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: any) {
    console.log(`Client disconnected: ${client.id}`);
  }

  emitMetrics(metrics: any) {
    this.server.emit('queue-metrics', metrics);
  }
}
