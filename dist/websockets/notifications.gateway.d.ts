import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
export declare class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private readonly jwtService;
    server: Server;
    constructor(jwtService: JwtService);
    handleConnection(socket: Socket): Promise<void>;
    handleDisconnect(socket: Socket): void;
    private extractToken;
    handleJoinRecommendation(socket: Socket, data: {
        recommendationId: string;
    }): Promise<void>;
    handleLeaveRecommendation(socket: Socket, data: {
        recommendationId: string;
    }): Promise<void>;
    sendNotificationToUser(userId: string, notification: any): void;
    sendNotificationRead(userId: string, notificationId: string): void;
    sendNotificationReadAll(userId: string): void;
    emitRecommendationUpdated(recommendationId: string, trackingData: any): void;
    emitEscalationCreated(recommendationId: string, data: any): void;
}
