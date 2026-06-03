import { InspectorsService } from './inspectors.service';
export declare class InspectorsController {
    private inspectorsService;
    constructor(inspectorsService: InspectorsService);
    findAll(): Promise<{
        id: string;
        fullName: string;
        department: string | null;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        phone: string | null;
        notes: string | null;
    }[]>;
    findOne(id: string): Promise<{
        id: string;
        fullName: string;
        department: string | null;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        phone: string | null;
        notes: string | null;
    }>;
    create(body: any): Promise<{
        id: string;
        fullName: string;
        department: string | null;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        phone: string | null;
        notes: string | null;
    }>;
    update(id: string, body: any): Promise<{
        id: string;
        fullName: string;
        department: string | null;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        phone: string | null;
        notes: string | null;
    }>;
    remove(id: string): Promise<{
        id: string;
        fullName: string;
        department: string | null;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        phone: string | null;
        notes: string | null;
    }>;
}
