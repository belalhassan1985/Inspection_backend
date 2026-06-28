import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Injectable } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
@Injectable()
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(socket: Socket) {
    try {
      const token = this.extractToken(socket);
      if (!token) {
        console.log(`[Websocket] Connection rejected: No token provided.`);
        socket.disconnect(true);
        return;
      }

      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET || 'super-secret-inspection-key-13579',
      });

      socket.data.user = payload; // payload has sub: userId
      const userId = payload.sub;
      const roomName = `user:${userId}`;
      await socket.join(roomName);
      console.log(
        `[Websocket] Client authenticated. User ${userId} joined room ${roomName}`,
      );
    } catch (err) {
      console.log(
        `[Websocket] Connection rejected: Invalid token. Error:`,
        err.message,
      );
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket) {
    console.log(`[Websocket] Client disconnected: ${socket.id}`);
  }

  private extractToken(socket: Socket): string | null {
    // 1. Auth payload
    const authHeader = socket.handshake.auth?.token;
    if (authHeader) {
      return authHeader.startsWith('Bearer ')
        ? authHeader.substring(7)
        : authHeader;
    }
    // 2. Query parameter
    const queryToken = socket.handshake.query?.token as string;
    if (queryToken) {
      return queryToken.startsWith('Bearer ')
        ? queryToken.substring(7)
        : queryToken;
    }
    // 3. Headers
    const headerToken = socket.handshake.headers?.authorization;
    if (headerToken) {
      return headerToken.startsWith('Bearer ')
        ? headerToken.substring(7)
        : headerToken;
    }
    return null;
  }

  // Room Subscription Handlers
  @SubscribeMessage('join:recommendation')
  async handleJoinRecommendation(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { recommendationId: string },
  ) {
    const user = socket.data.user;
    if (!user) return;
    const roomName = `recommendation:${data.recommendationId}`;
    await socket.join(roomName);
    console.log(`[Websocket] User ${user.sub} joined room ${roomName}`);
  }

  @SubscribeMessage('leave:recommendation')
  async handleLeaveRecommendation(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { recommendationId: string },
  ) {
    const roomName = `recommendation:${data.recommendationId}`;
    await socket.leave(roomName);
    console.log(`[Websocket] User left room ${roomName}`);
  }

  // Real-time Event Emmitters
  sendNotificationToUser(userId: string, notification: any) {
    const roomName = `user:${userId}`;
    this.server.to(roomName).emit('notification:new', notification);
    console.log(`[Websocket] Emitted notification:new to room ${roomName}`);
  }

  sendNotificationRead(userId: string, notificationId: string) {
    const roomName = `user:${userId}`;
    this.server.to(roomName).emit('notification:read', { id: notificationId });
    console.log(`[Websocket] Emitted notification:read to room ${roomName}`);
  }

  sendNotificationReadAll(userId: string) {
    const roomName = `user:${userId}`;
    this.server.to(roomName).emit('notification:readAll');
    console.log(`[Websocket] Emitted notification:readAll to room ${roomName}`);
  }

  emitRecommendationUpdated(recommendationId: string, trackingData: any) {
    const roomName = `recommendation:${recommendationId}`;
    this.server.to(roomName).emit('recommendation:updated', trackingData);
    console.log(
      `[Websocket] Emitted recommendation:updated to room ${roomName}`,
    );
  }

  emitEscalationCreated(recommendationId: string, data: any) {
    const roomName = `recommendation:${recommendationId}`;
    this.server.to(roomName).emit('escalation:created', data);
    console.log(`[Websocket] Emitted escalation:created to room ${roomName}`);
  }
}
