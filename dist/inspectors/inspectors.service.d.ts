import { PrismaService } from '../prisma/prisma.service';
export declare class InspectorsService {
    private prisma;
    constructor(prisma: PrismaService);
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
    create(data: any): Promise<{
        id: string;
        fullName: string;
        department: string | null;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        phone: string | null;
        notes: string | null;
    }>;
    update(id: string, data: any): Promise<{
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
