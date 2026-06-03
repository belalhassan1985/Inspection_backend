import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
export declare class AuthService {
    private prisma;
    private jwtService;
    private auditLogsService;
    constructor(prisma: PrismaService, jwtService: JwtService, auditLogsService: AuditLogsService);
    login(body: any, ip?: string, userAgent?: string): Promise<{
        token: string;
        user: {
            id: string;
            fullName: string;
            username: string;
            role: string;
            department: string | null;
            securityClassification: import(".prisma/client").$Enums.SecurityClassificationLevel;
        };
    }>;
    seed(): Promise<{
        message: string;
        admin: {
            username: string;
            password: string;
        };
        evaluator: {
            username: string;
            password: string;
        };
        imported: {
            users: number;
            entities: number;
            campaigns: number;
        };
    }>;
    private toUuid;
}
