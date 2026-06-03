import { PrismaService } from '../prisma/prisma.service';
export declare class CampaignsService {
    private prisma;
    constructor(prisma: PrismaService);
    findAll(): Promise<({
        entity: {
            id: string;
            name: string;
            createdAt: Date;
            parentId: string | null;
            level: string;
            isAssistant: boolean;
        } | null;
        members: ({
            inspector: {
                id: string;
                fullName: string;
                department: string | null;
                phone: string | null;
            };
        } & {
            campaignId: string;
            inspectorId: string;
        })[];
        deputy: {
            id: string;
            fullName: string;
            department: string | null;
            phone: string | null;
        } | null;
        leader: {
            id: string;
            fullName: string;
            department: string | null;
            phone: string | null;
        } | null;
        template: {
            id: string;
            name: string;
            isDefault: boolean;
        } | null;
    } & {
        id: string;
        name: string;
        createdAt: Date;
        entityId: string | null;
        type: string;
        assignmentText: string;
        assignmentReference: string;
        assignmentDate: Date;
        leaderId: string | null;
        deputyId: string | null;
        purpose: string | null;
        formationNumber: string | null;
        startDate: Date;
        endDate: Date | null;
        status: string;
        templateId: string | null;
    })[]>;
    findOne(id: string): Promise<{
        entity: {
            id: string;
            name: string;
            createdAt: Date;
            parentId: string | null;
            level: string;
            isAssistant: boolean;
        } | null;
        inspections: ({
            entity: {
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
            } & {
                id: string;
                name: string;
                createdAt: Date;
                parentId: string | null;
                level: string;
                isAssistant: boolean;
            };
            inspector: {
                id: string;
                username: string;
                fullName: string;
            } | null;
            grades: ({
                criteriaDetail: {
                    options: {
                        id: number;
                        type: string;
                        detailId: number;
                        optionText: string;
                        optionTypeId: number | null;
                        scoreValue: import("@prisma/client/runtime/library").Decimal | null;
                    }[];
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
        })[];
        notes: {
            id: string;
            campaignId: string;
            type: string;
            text: string;
            sortOrder: number;
            parentNoteId: string | null;
        }[];
        appendices: {
            symbol: string;
            id: string;
            campaignId: string;
            text: string;
        }[];
        members: ({
            inspector: {
                id: string;
                fullName: string;
                department: string | null;
                phone: string | null;
            };
        } & {
            campaignId: string;
            inspectorId: string;
        })[];
        recommendations: {
            id: string;
            campaignId: string;
            sortOrder: number;
            authorityName: string;
            recommendationText: string;
            riskLevel: import(".prisma/client").$Enums.RiskLevel | null;
            impactCategory: import(".prisma/client").$Enums.ImpactCategory | null;
            parentRecId: string | null;
        }[];
        deputy: {
            id: string;
            fullName: string;
            department: string | null;
            phone: string | null;
        } | null;
        leader: {
            id: string;
            fullName: string;
            department: string | null;
            phone: string | null;
        } | null;
        template: {
            id: string;
            name: string;
            isDefault: boolean;
        } | null;
    } & {
        id: string;
        name: string;
        createdAt: Date;
        entityId: string | null;
        type: string;
        assignmentText: string;
        assignmentReference: string;
        assignmentDate: Date;
        leaderId: string | null;
        deputyId: string | null;
        purpose: string | null;
        formationNumber: string | null;
        startDate: Date;
        endDate: Date | null;
        status: string;
        templateId: string | null;
    }>;
    create(data: any): Promise<{
        entity: {
            id: string;
            name: string;
            createdAt: Date;
            parentId: string | null;
            level: string;
            isAssistant: boolean;
        } | null;
        inspections: ({
            entity: {
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
            } & {
                id: string;
                name: string;
                createdAt: Date;
                parentId: string | null;
                level: string;
                isAssistant: boolean;
            };
            inspector: {
                id: string;
                username: string;
                fullName: string;
            } | null;
            grades: ({
                criteriaDetail: {
                    options: {
                        id: number;
                        type: string;
                        detailId: number;
                        optionText: string;
                        optionTypeId: number | null;
                        scoreValue: import("@prisma/client/runtime/library").Decimal | null;
                    }[];
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
        })[];
        notes: {
            id: string;
            campaignId: string;
            type: string;
            text: string;
            sortOrder: number;
            parentNoteId: string | null;
        }[];
        appendices: {
            symbol: string;
            id: string;
            campaignId: string;
            text: string;
        }[];
        members: ({
            inspector: {
                id: string;
                fullName: string;
                department: string | null;
                phone: string | null;
            };
        } & {
            campaignId: string;
            inspectorId: string;
        })[];
        recommendations: {
            id: string;
            campaignId: string;
            sortOrder: number;
            authorityName: string;
            recommendationText: string;
            riskLevel: import(".prisma/client").$Enums.RiskLevel | null;
            impactCategory: import(".prisma/client").$Enums.ImpactCategory | null;
            parentRecId: string | null;
        }[];
        deputy: {
            id: string;
            fullName: string;
            department: string | null;
            phone: string | null;
        } | null;
        leader: {
            id: string;
            fullName: string;
            department: string | null;
            phone: string | null;
        } | null;
        template: {
            id: string;
            name: string;
            isDefault: boolean;
        } | null;
    } & {
        id: string;
        name: string;
        createdAt: Date;
        entityId: string | null;
        type: string;
        assignmentText: string;
        assignmentReference: string;
        assignmentDate: Date;
        leaderId: string | null;
        deputyId: string | null;
        purpose: string | null;
        formationNumber: string | null;
        startDate: Date;
        endDate: Date | null;
        status: string;
        templateId: string | null;
    }>;
    update(id: string, data: any): Promise<{
        entity: {
            id: string;
            name: string;
            createdAt: Date;
            parentId: string | null;
            level: string;
            isAssistant: boolean;
        } | null;
        inspections: ({
            entity: {
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
            } & {
                id: string;
                name: string;
                createdAt: Date;
                parentId: string | null;
                level: string;
                isAssistant: boolean;
            };
            inspector: {
                id: string;
                username: string;
                fullName: string;
            } | null;
            grades: ({
                criteriaDetail: {
                    options: {
                        id: number;
                        type: string;
                        detailId: number;
                        optionText: string;
                        optionTypeId: number | null;
                        scoreValue: import("@prisma/client/runtime/library").Decimal | null;
                    }[];
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
        })[];
        notes: {
            id: string;
            campaignId: string;
            type: string;
            text: string;
            sortOrder: number;
            parentNoteId: string | null;
        }[];
        appendices: {
            symbol: string;
            id: string;
            campaignId: string;
            text: string;
        }[];
        members: ({
            inspector: {
                id: string;
                fullName: string;
                department: string | null;
                phone: string | null;
            };
        } & {
            campaignId: string;
            inspectorId: string;
        })[];
        recommendations: {
            id: string;
            campaignId: string;
            sortOrder: number;
            authorityName: string;
            recommendationText: string;
            riskLevel: import(".prisma/client").$Enums.RiskLevel | null;
            impactCategory: import(".prisma/client").$Enums.ImpactCategory | null;
            parentRecId: string | null;
        }[];
        deputy: {
            id: string;
            fullName: string;
            department: string | null;
            phone: string | null;
        } | null;
        leader: {
            id: string;
            fullName: string;
            department: string | null;
            phone: string | null;
        } | null;
        template: {
            id: string;
            name: string;
            isDefault: boolean;
        } | null;
    } & {
        id: string;
        name: string;
        createdAt: Date;
        entityId: string | null;
        type: string;
        assignmentText: string;
        assignmentReference: string;
        assignmentDate: Date;
        leaderId: string | null;
        deputyId: string | null;
        purpose: string | null;
        formationNumber: string | null;
        startDate: Date;
        endDate: Date | null;
        status: string;
        templateId: string | null;
    }>;
    remove(id: string): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        entityId: string | null;
        type: string;
        assignmentText: string;
        assignmentReference: string;
        assignmentDate: Date;
        leaderId: string | null;
        deputyId: string | null;
        purpose: string | null;
        formationNumber: string | null;
        startDate: Date;
        endDate: Date | null;
        status: string;
        templateId: string | null;
    }>;
    addNote(campaignId: string, noteData: any): Promise<{
        id: string;
        campaignId: string;
        type: string;
        text: string;
        sortOrder: number;
        parentNoteId: string | null;
    }>;
    updateNote(noteId: string, noteData: any): Promise<{
        id: string;
        campaignId: string;
        type: string;
        text: string;
        sortOrder: number;
        parentNoteId: string | null;
    }>;
    deleteNote(noteId: string): Promise<{
        id: string;
        campaignId: string;
        type: string;
        text: string;
        sortOrder: number;
        parentNoteId: string | null;
    }>;
    addRecommendation(campaignId: string, recData: any): Promise<{
        id: string;
        campaignId: string;
        sortOrder: number;
        authorityName: string;
        recommendationText: string;
        riskLevel: import(".prisma/client").$Enums.RiskLevel | null;
        impactCategory: import(".prisma/client").$Enums.ImpactCategory | null;
        parentRecId: string | null;
    }>;
    updateRecommendation(recId: string, recData: any): Promise<{
        id: string;
        campaignId: string;
        sortOrder: number;
        authorityName: string;
        recommendationText: string;
        riskLevel: import(".prisma/client").$Enums.RiskLevel | null;
        impactCategory: import(".prisma/client").$Enums.ImpactCategory | null;
        parentRecId: string | null;
    }>;
    deleteRecommendation(recId: string): Promise<{
        id: string;
        campaignId: string;
        sortOrder: number;
        authorityName: string;
        recommendationText: string;
        riskLevel: import(".prisma/client").$Enums.RiskLevel | null;
        impactCategory: import(".prisma/client").$Enums.ImpactCategory | null;
        parentRecId: string | null;
    }>;
    addAppendix(campaignId: string, appData: any): Promise<{
        symbol: string;
        id: string;
        campaignId: string;
        text: string;
    }>;
    updateAppendix(appId: string, appData: any): Promise<{
        symbol: string;
        id: string;
        campaignId: string;
        text: string;
    }>;
    deleteAppendix(appId: string): Promise<{
        symbol: string;
        id: string;
        campaignId: string;
        text: string;
    }>;
    findAllTypes(): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        key: string;
    }[]>;
    createType(data: any): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        key: string;
    }>;
    updateType(id: string, data: any): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        key: string;
    }>;
    removeType(id: string): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        key: string;
    }>;
}
