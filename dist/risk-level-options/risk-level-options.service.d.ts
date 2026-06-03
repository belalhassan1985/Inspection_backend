import { PrismaService } from '../prisma/prisma.service';
export declare class RiskLevelOptionsService {
    private prisma;
    constructor(prisma: PrismaService);
    findAll(includeInactive?: boolean): Promise<{
        id: number;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        sortOrder: number;
        code: string;
        nameAr: string;
        color: string;
        severityWeight: number | null;
    }[]>;
    findActive(): Promise<{
        id: number;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        sortOrder: number;
        code: string;
        nameAr: string;
        color: string;
        severityWeight: number | null;
    }[]>;
    create(data: any): Promise<{
        id: number;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        sortOrder: number;
        code: string;
        nameAr: string;
        color: string;
        severityWeight: number | null;
    }>;
    update(id: number, data: any): Promise<{
        id: number;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        sortOrder: number;
        code: string;
        nameAr: string;
        color: string;
        severityWeight: number | null;
    }>;
    toggle(id: number, isActive: boolean): Promise<{
        id: number;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        sortOrder: number;
        code: string;
        nameAr: string;
        color: string;
        severityWeight: number | null;
    }>;
    reorder(ids: number[]): Promise<{
        id: number;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        sortOrder: number;
        code: string;
        nameAr: string;
        color: string;
        severityWeight: number | null;
    }[]>;
    private ensureExists;
    private normalizePayload;
}
