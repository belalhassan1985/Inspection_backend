import { PrismaService } from '../prisma/prisma.service';
export declare class AuditLogsService {
    private prisma;
    constructor(prisma: PrismaService);
    log(userId: string, username: string, actionType: string, ipAddress?: string, userAgent?: string, details?: any): Promise<void>;
    findAll(): Promise<{
        id: string;
        userId: string;
        username: string;
        actionType: string;
        ipAddress: string | null;
        userAgent: string | null;
        timestamp: Date;
        details: import("@prisma/client/runtime/library").JsonValue | null;
    }[]>;
}
