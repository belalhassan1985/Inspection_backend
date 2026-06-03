"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const jwt_1 = require("@nestjs/jwt");
const common_1 = require("@nestjs/common");
let NotificationsGateway = class NotificationsGateway {
    jwtService;
    server;
    constructor(jwtService) {
        this.jwtService = jwtService;
    }
    async handleConnection(socket) {
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
            socket.data.user = payload;
            const userId = payload.sub;
            const roomName = `user:${userId}`;
            await socket.join(roomName);
            console.log(`[Websocket] Client authenticated. User ${userId} joined room ${roomName}`);
        }
        catch (err) {
            console.log(`[Websocket] Connection rejected: Invalid token. Error:`, err.message);
            socket.disconnect(true);
        }
    }
    handleDisconnect(socket) {
        console.log(`[Websocket] Client disconnected: ${socket.id}`);
    }
    extractToken(socket) {
        const authHeader = socket.handshake.auth?.token;
        if (authHeader) {
            return authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
        }
        const queryToken = socket.handshake.query?.token;
        if (queryToken) {
            return queryToken.startsWith('Bearer ') ? queryToken.substring(7) : queryToken;
        }
        const headerToken = socket.handshake.headers?.authorization;
        if (headerToken) {
            return headerToken.startsWith('Bearer ') ? headerToken.substring(7) : headerToken;
        }
        return null;
    }
    async handleJoinRecommendation(socket, data) {
        const user = socket.data.user;
        if (!user)
            return;
        const roomName = `recommendation:${data.recommendationId}`;
        await socket.join(roomName);
        console.log(`[Websocket] User ${user.sub} joined room ${roomName}`);
    }
    async handleLeaveRecommendation(socket, data) {
        const roomName = `recommendation:${data.recommendationId}`;
        await socket.leave(roomName);
        console.log(`[Websocket] User left room ${roomName}`);
    }
    sendNotificationToUser(userId, notification) {
        const roomName = `user:${userId}`;
        this.server.to(roomName).emit('notification:new', notification);
        console.log(`[Websocket] Emitted notification:new to room ${roomName}`);
    }
    sendNotificationRead(userId, notificationId) {
        const roomName = `user:${userId}`;
        this.server.to(roomName).emit('notification:read', { id: notificationId });
        console.log(`[Websocket] Emitted notification:read to room ${roomName}`);
    }
    sendNotificationReadAll(userId) {
        const roomName = `user:${userId}`;
        this.server.to(roomName).emit('notification:readAll');
        console.log(`[Websocket] Emitted notification:readAll to room ${roomName}`);
    }
    emitRecommendationUpdated(recommendationId, trackingData) {
        const roomName = `recommendation:${recommendationId}`;
        this.server.to(roomName).emit('recommendation:updated', trackingData);
        console.log(`[Websocket] Emitted recommendation:updated to room ${roomName}`);
    }
    emitEscalationCreated(recommendationId, data) {
        const roomName = `recommendation:${recommendationId}`;
        this.server.to(roomName).emit('escalation:created', data);
        console.log(`[Websocket] Emitted escalation:created to room ${roomName}`);
    }
};
exports.NotificationsGateway = NotificationsGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], NotificationsGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('join:recommendation'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], NotificationsGateway.prototype, "handleJoinRecommendation", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('leave:recommendation'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], NotificationsGateway.prototype, "handleLeaveRecommendation", null);
exports.NotificationsGateway = NotificationsGateway = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: {
            origin: '*',
        },
    }),
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [jwt_1.JwtService])
], NotificationsGateway);
//# sourceMappingURL=notifications.gateway.js.map