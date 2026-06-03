"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecommendationTrackingModule = void 0;
const common_1 = require("@nestjs/common");
const recommendation_tracking_service_1 = require("./recommendation-tracking.service");
const recommendation_tracking_controller_1 = require("./recommendation-tracking.controller");
const prisma_module_1 = require("../prisma/prisma.module");
const websockets_module_1 = require("../websockets/websockets.module");
const notification_module_1 = require("../notifications/notification.module");
let RecommendationTrackingModule = class RecommendationTrackingModule {
};
exports.RecommendationTrackingModule = RecommendationTrackingModule;
exports.RecommendationTrackingModule = RecommendationTrackingModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule, websockets_module_1.WebsocketsModule, notification_module_1.NotificationModule],
        controllers: [recommendation_tracking_controller_1.RecommendationTrackingController],
        providers: [recommendation_tracking_service_1.RecommendationTrackingService],
        exports: [recommendation_tracking_service_1.RecommendationTrackingService],
    })
], RecommendationTrackingModule);
//# sourceMappingURL=recommendation-tracking.module.js.map