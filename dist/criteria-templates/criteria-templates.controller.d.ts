import { CriteriaTemplatesService } from './criteria-templates.service';
export declare class CriteriaTemplatesController {
    private criteriaTemplatesService;
    constructor(criteriaTemplatesService: CriteriaTemplatesService);
    findAll(): Promise<({
        _count: {
            campaigns: number;
            items: number;
        };
    } & {
        id: string;
        name: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        isDefault: boolean;
    })[]>;
    create(body: {
        name: string;
        description?: string;
    }): Promise<{
        id: string;
        name: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        isDefault: boolean;
    }>;
    createFromCurrent(body: {
        name?: string;
        description?: string;
    }): Promise<{
        items: ({
            primary: {
                id: number;
                sortOrder: number;
                title: string;
                maxGrade: import("@prisma/client/runtime/library").Decimal;
            };
        } & {
            id: string;
            templateId: string;
            sortOrder: number;
            primaryId: number;
        })[];
    } & {
        id: string;
        name: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        isDefault: boolean;
    }>;
    findOne(id: string): Promise<{
        _count: {
            campaigns: number;
        };
        items: ({
            primary: {
                secondaryCriteria: ({
                    details: ({
                        options: ({
                            optionType: {
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
                            } | null;
                        } & {
                            id: number;
                            type: string;
                            detailId: number;
                            optionText: string;
                            optionTypeId: number | null;
                            scoreValue: import("@prisma/client/runtime/library").Decimal | null;
                        })[];
                    } & {
                        id: number;
                        sortOrder: number;
                        maxGrade: import("@prisma/client/runtime/library").Decimal;
                        secondaryId: number;
                        detailText: string;
                        inputType: string;
                        tableSchema: import("@prisma/client/runtime/library").JsonValue | null;
                    })[];
                } & {
                    id: number;
                    sortOrder: number;
                    title: string;
                    maxGrade: import("@prisma/client/runtime/library").Decimal;
                    primaryId: number;
                })[];
            } & {
                id: number;
                sortOrder: number;
                title: string;
                maxGrade: import("@prisma/client/runtime/library").Decimal;
            };
        } & {
            id: string;
            templateId: string;
            sortOrder: number;
            primaryId: number;
        })[];
    } & {
        id: string;
        name: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        isDefault: boolean;
    }>;
    update(id: string, body: {
        name?: string;
        description?: string;
    }): Promise<{
        id: string;
        name: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        isDefault: boolean;
    }>;
    remove(id: string): Promise<{
        id: string;
        name: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        isDefault: boolean;
    }>;
    addItem(id: string, body: {
        primaryId: number;
        sortOrder?: number;
    }): Promise<{
        primary: {
            id: number;
            sortOrder: number;
            title: string;
            maxGrade: import("@prisma/client/runtime/library").Decimal;
        };
    } & {
        id: string;
        templateId: string;
        sortOrder: number;
        primaryId: number;
    }>;
    removeItem(id: string, primaryId: number): Promise<void>;
    setDefault(id: string): Promise<{
        id: string;
        name: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        isDefault: boolean;
    }>;
}
