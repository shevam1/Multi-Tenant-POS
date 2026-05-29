import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

/**
 * Socket.IO gateway powering:
 *   - Live queue board (grooming workflow state per store)
 *   - Booking → admin real-time push (new pending bookings from the web)
 */
@WebSocketGateway({ cors: { origin: '*' }, namespace: '/realtime' })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() private readonly server!: Server;

  handleConnection(socket: Socket) {
    const { storeId, tenantId } = socket.handshake.query as Record<string, string>;
    if (storeId) socket.join(`store:${storeId}`);
    if (tenantId) socket.join(`tenant:${tenantId}`);
  }

  handleDisconnect(_socket: Socket) { /* no-op */ }

  @SubscribeMessage('join:store')
  joinStore(@ConnectedSocket() socket: Socket, @MessageBody() storeId: string) {
    socket.join(`store:${storeId}`);
  }

  /** Called by the bookings service when a workflow stage advances. */
  emitQueueUpdate(storeId: string, payload: unknown) {
    this.server.to(`store:${storeId}`).emit('queue:update', payload);
  }

  /** Called when a new booking arrives from the web app. */
  emitNewBooking(tenantId: string, booking: unknown) {
    this.server.to(`tenant:${tenantId}`).emit('booking:new', booking);
  }

  /** Called when any booking status changes. */
  emitBookingStatusChange(storeId: string, payload: unknown) {
    this.server.to(`store:${storeId}`).emit('booking:status', payload);
  }
}
