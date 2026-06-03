import { EvaluationOptionTypesService } from './evaluation-option-types.service';
export declare class EvaluationOptionTypesController {
    private service;
    constructor(service: EvaluationOptionTypesService);
    findAll(activeOnly?: string): Promise<{
        id: number;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        sortOrder: number;
        code: string;
        nameAr: string;
        nameEn: string | null;
        color: string | null;
        icon: string | null;
        affectsScore: boolean;
        scoreMultiplier: import("@prisma/client/runtime/library").Decimal;
    }[]>;
    findActive(): Promise<{
        id: number;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        sortOrder: number;
        code: string;
        nameAr: string;
        nameEn: string | null;
        color: string | null;
        icon: string | null;
        affectsScore: boolean;
        scoreMultiplier: import("@prisma/client/runtime/library").Decimal;
    }[]>;
    create(body: any): Promise<{
        id: number;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        sortOrder: number;
        code: string;
        nameAr: string;
        nameEn: string | null;
        color: string | null;
        icon: string | null;
        affectsScore: boolean;
        scoreMultiplier: import("@prisma/client/runtime/library").Decimal;
    }>;
    update(id: string, body: any): Promise<{
        id: number;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        sortOrder: number;
        code: string;
        nameAr: string;
        nameEn: string | null;
        color: string | null;
        icon: string | null;
        affectsScore: boolean;
        scoreMultiplier: import("@prisma/client/runtime/library").Decimal;
    }>;
    toggle(id: string, body: any): Promise<{
        id: number;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        sortOrder: number;
        code: string;
        nameAr: string;
        nameEn: string | null;
        color: string | null;
        icon: string | null;
        affectsScore: boolean;
        scoreMultiplier: import("@prisma/client/runtime/library").Decimal;
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
        nameEn: string | null;
        color: string | null;
        icon: string | null;
        affectsScore: boolean;
        scoreMultiplier: import("@prisma/client/runtime/library").Decimal;
    }[]>;
}
