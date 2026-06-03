import { AuditLogsService } from './audit-logs.service';
export declare class AuditLogsController {
    private auditLogsService;
    constructor(auditLogsService: AuditLogsService);
    getLogs(): Promise<{
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
