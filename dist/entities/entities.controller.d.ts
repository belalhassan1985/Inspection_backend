import { EntitiesService } from './entities.service';
export declare class EntitiesController {
    private entitiesService;
    constructor(entitiesService: EntitiesService);
    findAll(): Promise<({
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
    })[]>;
    findOne(id: string): Promise<{
        children: {
            id: string;
            name: string;
            createdAt: Date;
            parentId: string | null;
            level: string;
            isAssistant: boolean;
        }[];
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
    }>;
    create(body: any): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        parentId: string | null;
        level: string;
        isAssistant: boolean;
    }>;
    update(id: string, body: any): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        parentId: string | null;
        level: string;
        isAssistant: boolean;
    }>;
    remove(id: string): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        parentId: string | null;
        level: string;
        isAssistant: boolean;
    }>;
    addPosition(id: string, body: any): Promise<{
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
    }>;
    updatePosition(posId: string, body: any): Promise<{
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
    }>;
    deletePosition(posId: string): Promise<{
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
    }>;
}
