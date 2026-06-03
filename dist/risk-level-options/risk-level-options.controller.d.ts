import { RiskLevelOptionsService } from './risk-level-options.service';
export declare class RiskLevelOptionsController {
    private service;
    constructor(service: RiskLevelOptionsService);
    findAll(activeOnly?: string): Promise<{
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
    create(body: any): Promise<{
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
    update(id: string, body: any): Promise<{
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
    toggle(id: string, body: any): Promise<{
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
    reorder(body: {
        ids: number[];
    }): Promise<{
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
}
