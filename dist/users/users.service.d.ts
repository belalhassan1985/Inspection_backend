import { PrismaService } from '../prisma/prisma.service';
export declare class UsersService {
    private prisma;
    constructor(prisma: PrismaService);
    findAll(): Promise<({
        role: {
            id: number;
            name: string;
            description: string | null;
        } | null;
    } & {
        id: string;
        username: string;
        fullName: string;
        passwordHash: string;
        roleId: number | null;
        department: string | null;
        isActive: boolean;
        securityClassification: import(".prisma/client").$Enums.SecurityClassificationLevel;
        createdAt: Date;
        updatedAt: Date;
    })[]>;
    findRoles(): Promise<{
        id: number;
        name: string;
        description: string | null;
    }[]>;
    create(data: any): Promise<{
        role: {
            id: number;
            name: string;
            description: string | null;
        } | null;
    } & {
        id: string;
        username: string;
        fullName: string;
        passwordHash: string;
        roleId: number | null;
        department: string | null;
        isActive: boolean;
        securityClassification: import(".prisma/client").$Enums.SecurityClassificationLevel;
        createdAt: Date;
        updatedAt: Date;
    }>;
    update(id: string, data: any): Promise<{
        role: {
            id: number;
            name: string;
            description: string | null;
        } | null;
    } & {
        id: string;
        username: string;
        fullName: string;
        passwordHash: string;
        roleId: number | null;
        department: string | null;
        isActive: boolean;
        securityClassification: import(".prisma/client").$Enums.SecurityClassificationLevel;
        createdAt: Date;
        updatedAt: Date;
    }>;
    remove(id: string): Promise<{
        id: string;
        username: string;
        fullName: string;
        passwordHash: string;
        roleId: number | null;
        department: string | null;
        isActive: boolean;
        securityClassification: import(".prisma/client").$Enums.SecurityClassificationLevel;
        createdAt: Date;
        updatedAt: Date;
    }>;
}
