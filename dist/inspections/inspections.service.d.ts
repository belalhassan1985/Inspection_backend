import { PrismaService } from '../prisma/prisma.service';
export declare class InspectionsService {
    private prisma;
    constructor(prisma: PrismaService);
    findAll(): Promise<({
        entity: {
            id: string;
            name: string;
            level: string;
        };
        campaign: {
            id: string;
            name: string;
        };
        inspector: {
            id: string;
            username: string;
            fullName: string;
        } | null;
    } & {
        id: string;
        createdAt: Date;
        entityId: string;
        campaignId: string;
        status: string;
        inspectorId: string | null;
        location: string | null;
        findings: string | null;
        totalScore: import("@prisma/client/runtime/library").Decimal | null;
        performanceRating: string | null;
        officerCredentials: import("@prisma/client/runtime/library").JsonValue | null;
    })[]>;
    findOne(id: string): Promise<{
        entity: {
            id: string;
            name: string;
            level: string;
            positions: {
                id: string;
                isActive: boolean;
                updatedAt: Date;
                notes: string | null;
                entityId: string;
                positionName: string;
                positionStatus: string;
                statisticalNumber: string;
                positionHolder: string;
                joinedDate: Date | null;
                cadreStatus: string | null;
                education: string | null;
                evaluation: string | null;
                rank: string | null;
                yearsOfService: number | null;
            }[];
        };
        campaign: {
            id: string;
            name: string;
            type: string;
            formationNumber: string | null;
        };
        inspector: {
            id: string;
            username: string;
            fullName: string;
        } | null;
        grades: ({
            criteriaDetail: {
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
                secondary: {
                    primary: {
                        id: number;
                        sortOrder: number;
                        title: string;
                        maxGrade: import("@prisma/client/runtime/library").Decimal;
                    };
                } & {
                    id: number;
                    sortOrder: number;
                    title: string;
                    maxGrade: import("@prisma/client/runtime/library").Decimal;
                    primaryId: number;
                };
            } & {
                id: number;
                sortOrder: number;
                maxGrade: import("@prisma/client/runtime/library").Decimal;
                secondaryId: number;
                detailText: string;
                inputType: string;
                tableSchema: import("@prisma/client/runtime/library").JsonValue | null;
            };
            selectedOptions: ({
                option: {
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
                };
            } & {
                id: string;
                inspectionGradeId: string;
                optionId: number;
            })[];
        } & {
            id: string;
            createdAt: Date;
            notes: string | null;
            inspectionId: string;
            detailId: number;
            gradeEarned: import("@prisma/client/runtime/library").Decimal;
            quantitativeData: import("@prisma/client/runtime/library").JsonValue | null;
            instanceName: string | null;
        })[];
    } & {
        id: string;
        createdAt: Date;
        entityId: string;
        campaignId: string;
        status: string;
        inspectorId: string | null;
        location: string | null;
        findings: string | null;
        totalScore: import("@prisma/client/runtime/library").Decimal | null;
        performanceRating: string | null;
        officerCredentials: import("@prisma/client/runtime/library").JsonValue | null;
    }>;
    findByCampaign(campaignId: string): Promise<({
        entity: {
            id: string;
            name: string;
            level: string;
            positions: {
                id: string;
                isActive: boolean;
                updatedAt: Date;
                notes: string | null;
                entityId: string;
                positionName: string;
                positionStatus: string;
                statisticalNumber: string;
                positionHolder: string;
                joinedDate: Date | null;
                cadreStatus: string | null;
                education: string | null;
                evaluation: string | null;
                rank: string | null;
                yearsOfService: number | null;
            }[];
        };
        campaign: {
            id: string;
            name: string;
            type: string;
            formationNumber: string | null;
        };
        inspector: {
            id: string;
            username: string;
            fullName: string;
        } | null;
        grades: ({
            criteriaDetail: {
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
                secondary: {
                    primary: {
                        id: number;
                        sortOrder: number;
                        title: string;
                        maxGrade: import("@prisma/client/runtime/library").Decimal;
                    };
                } & {
                    id: number;
                    sortOrder: number;
                    title: string;
                    maxGrade: import("@prisma/client/runtime/library").Decimal;
                    primaryId: number;
                };
            } & {
                id: number;
                sortOrder: number;
                maxGrade: import("@prisma/client/runtime/library").Decimal;
                secondaryId: number;
                detailText: string;
                inputType: string;
                tableSchema: import("@prisma/client/runtime/library").JsonValue | null;
            };
            selectedOptions: ({
                option: {
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
                };
            } & {
                id: string;
                inspectionGradeId: string;
                optionId: number;
            })[];
        } & {
            id: string;
            createdAt: Date;
            notes: string | null;
            inspectionId: string;
            detailId: number;
            gradeEarned: import("@prisma/client/runtime/library").Decimal;
            quantitativeData: import("@prisma/client/runtime/library").JsonValue | null;
            instanceName: string | null;
        })[];
    } & {
        id: string;
        createdAt: Date;
        entityId: string;
        campaignId: string;
        status: string;
        inspectorId: string | null;
        location: string | null;
        findings: string | null;
        totalScore: import("@prisma/client/runtime/library").Decimal | null;
        performanceRating: string | null;
        officerCredentials: import("@prisma/client/runtime/library").JsonValue | null;
    }) | null>;
    getCriteriaTemplate(campaignId?: string): Promise<({
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
    })[]>;
    create(data: any): Promise<{
        entity: {
            id: string;
            name: string;
            level: string;
            positions: {
                id: string;
                isActive: boolean;
                updatedAt: Date;
                notes: string | null;
                entityId: string;
                positionName: string;
                positionStatus: string;
                statisticalNumber: string;
                positionHolder: string;
                joinedDate: Date | null;
                cadreStatus: string | null;
                education: string | null;
                evaluation: string | null;
                rank: string | null;
                yearsOfService: number | null;
            }[];
        };
        campaign: {
            id: string;
            name: string;
            type: string;
            formationNumber: string | null;
        };
        inspector: {
            id: string;
            username: string;
            fullName: string;
        } | null;
        grades: ({
            criteriaDetail: {
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
                secondary: {
                    primary: {
                        id: number;
                        sortOrder: number;
                        title: string;
                        maxGrade: import("@prisma/client/runtime/library").Decimal;
                    };
                } & {
                    id: number;
                    sortOrder: number;
                    title: string;
                    maxGrade: import("@prisma/client/runtime/library").Decimal;
                    primaryId: number;
                };
            } & {
                id: number;
                sortOrder: number;
                maxGrade: import("@prisma/client/runtime/library").Decimal;
                secondaryId: number;
                detailText: string;
                inputType: string;
                tableSchema: import("@prisma/client/runtime/library").JsonValue | null;
            };
            selectedOptions: ({
                option: {
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
                };
            } & {
                id: string;
                inspectionGradeId: string;
                optionId: number;
            })[];
        } & {
            id: string;
            createdAt: Date;
            notes: string | null;
            inspectionId: string;
            detailId: number;
            gradeEarned: import("@prisma/client/runtime/library").Decimal;
            quantitativeData: import("@prisma/client/runtime/library").JsonValue | null;
            instanceName: string | null;
        })[];
    } & {
        id: string;
        createdAt: Date;
        entityId: string;
        campaignId: string;
        status: string;
        inspectorId: string | null;
        location: string | null;
        findings: string | null;
        totalScore: import("@prisma/client/runtime/library").Decimal | null;
        performanceRating: string | null;
        officerCredentials: import("@prisma/client/runtime/library").JsonValue | null;
    }>;
    updateStatus(id: string, status: string, findings?: string): Promise<{
        id: string;
        createdAt: Date;
        entityId: string;
        campaignId: string;
        status: string;
        inspectorId: string | null;
        location: string | null;
        findings: string | null;
        totalScore: import("@prisma/client/runtime/library").Decimal | null;
        performanceRating: string | null;
        officerCredentials: import("@prisma/client/runtime/library").JsonValue | null;
    }>;
    remove(id: string): Promise<{
        id: string;
        createdAt: Date;
        entityId: string;
        campaignId: string;
        status: string;
        inspectorId: string | null;
        location: string | null;
        findings: string | null;
        totalScore: import("@prisma/client/runtime/library").Decimal | null;
        performanceRating: string | null;
        officerCredentials: import("@prisma/client/runtime/library").JsonValue | null;
    }>;
    createPrimary(data: any): Promise<{
        id: number;
        sortOrder: number;
        title: string;
        maxGrade: import("@prisma/client/runtime/library").Decimal;
    }>;
    updatePrimary(id: number, data: any): Promise<{
        id: number;
        sortOrder: number;
        title: string;
        maxGrade: import("@prisma/client/runtime/library").Decimal;
    }>;
    removePrimary(id: number): Promise<{
        id: number;
        sortOrder: number;
        title: string;
        maxGrade: import("@prisma/client/runtime/library").Decimal;
    }>;
    createSecondary(data: any): Promise<{
        id: number;
        sortOrder: number;
        title: string;
        maxGrade: import("@prisma/client/runtime/library").Decimal;
        primaryId: number;
    }>;
    updateSecondary(id: number, data: any): Promise<{
        id: number;
        sortOrder: number;
        title: string;
        maxGrade: import("@prisma/client/runtime/library").Decimal;
        primaryId: number;
    }>;
    removeSecondary(id: number): Promise<{
        id: number;
        sortOrder: number;
        title: string;
        maxGrade: import("@prisma/client/runtime/library").Decimal;
        primaryId: number;
    }>;
    createDetail(data: any): Promise<{
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
    }>;
    createOption(data: any): Promise<{
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
    }>;
    updateDetail(id: number, data: any): Promise<{
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
    }>;
    removeDetail(id: number): Promise<{
        id: number;
        sortOrder: number;
        maxGrade: import("@prisma/client/runtime/library").Decimal;
        secondaryId: number;
        detailText: string;
        inputType: string;
        tableSchema: import("@prisma/client/runtime/library").JsonValue | null;
    }>;
    reorderPrimary(ids: number[], templateId?: string): Promise<void>;
    reorderSecondary(ids: number[]): Promise<{
        id: number;
        sortOrder: number;
        title: string;
        maxGrade: import("@prisma/client/runtime/library").Decimal;
        primaryId: number;
    }[]>;
    reorderDetail(ids: number[]): Promise<{
        id: number;
        sortOrder: number;
        maxGrade: import("@prisma/client/runtime/library").Decimal;
        secondaryId: number;
        detailText: string;
        inputType: string;
        tableSchema: import("@prisma/client/runtime/library").JsonValue | null;
    }[]>;
    private buildOptionCreateData;
    private resolveOptionType;
    private calculateRating;
}
