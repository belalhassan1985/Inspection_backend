import { AuthService } from './auth.service';
export declare class AuthController {
    private authService;
    constructor(authService: AuthService);
    login(body: any, req: any): Promise<{
        token: string;
        user: {
            id: string;
            fullName: string;
            username: string;
            role: string;
            department: string | null;
            securityClassification: import(".prisma/client").$Enums.SecurityClassificationLevel;
        };
    }>;
    seed(): Promise<{
        message: string;
        admin: {
            username: string;
            password: string;
        };
        evaluator: {
            username: string;
            password: string;
        };
        imported: {
            users: number;
            entities: number;
            campaigns: number;
        };
    }>;
    getProfile(req: any): Promise<any>;
}
