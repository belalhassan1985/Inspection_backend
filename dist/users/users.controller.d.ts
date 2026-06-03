import { UsersService } from './users.service';
export declare class UsersController {
    private usersService;
    constructor(usersService: UsersService);
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
    create(body: any): Promise<{
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
    updateProfile(req: any, body: any): Promise<{
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
    update(id: string, body: any): Promise<{
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
