"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_logs_service_1 = require("../audit-logs/audit-logs.service");
const bcrypt = require("bcrypt");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
let AuthService = class AuthService {
    prisma;
    jwtService;
    auditLogsService;
    constructor(prisma, jwtService, auditLogsService) {
        this.prisma = prisma;
        this.jwtService = jwtService;
        this.auditLogsService = auditLogsService;
    }
    async login(body, ip, userAgent) {
        const { username, password } = body;
        if (!username || !password) {
            throw new common_1.BadRequestException('Username and password are required');
        }
        const user = await this.prisma.user.findUnique({
            where: { username },
            include: { role: true },
        });
        if (!user || !user.isActive) {
            throw new common_1.UnauthorizedException('Invalid credentials or inactive account');
        }
        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        const payload = { sub: user.id, username: user.username, role: user.role?.name || 'VIEWER' };
        const token = this.jwtService.sign(payload);
        await this.auditLogsService.log(user.id, user.username, 'USER_LOGIN', ip, userAgent, { timestamp: new Date() });
        return {
            token,
            user: {
                id: user.id,
                fullName: user.fullName,
                username: user.username,
                role: user.role?.name || 'VIEWER',
                department: user.department,
                securityClassification: user.securityClassification,
            },
        };
    }
    async seed() {
        const rolesData = [
            { name: 'ADMIN', description: 'مسؤول النظام الكامل وصاحب كافة الصلاحيات' },
            { name: 'EVALUATOR', description: 'المفتش المخول بإجراء التقييمات وإدخال الدرجات' },
            { name: 'EDITOR', description: 'محرر الحملات وتفاصيل التقرير والجهات' },
            { name: 'VIEWER', description: 'متابع مطلع على النتائج بدون صلاحية التعديل' },
            { name: 'REPORT_VIEWER', description: 'صلاحية معاينة وطباعة التقارير النهائية فقط' },
        ];
        for (const role of rolesData) {
            await this.prisma.role.upsert({
                where: { name: role.name },
                update: { description: role.description },
                create: role,
            });
        }
        const adminRole = await this.prisma.role.findUnique({ where: { name: 'ADMIN' } });
        const evaluatorRole = await this.prisma.role.findUnique({ where: { name: 'EVALUATOR' } });
        const passwordHash = await bcrypt.hash('1234', 10);
        await this.prisma.user.upsert({
            where: { username: 'ahmed' },
            update: { passwordHash },
            create: {
                fullName: 'العميد أحمد سلمان',
                username: 'ahmed',
                passwordHash,
                roleId: adminRole.id,
                department: 'هيئة الرقابة والتفتيش',
                isActive: true,
            },
        });
        const aliExists = await this.prisma.inspector.findFirst({ where: { fullName: 'العقيد علي جاسم' } });
        if (!aliExists) {
            await this.prisma.inspector.create({
                data: {
                    fullName: 'العقيد علي جاسم',
                    department: 'مديرية التفتيش الميداني',
                    isActive: true,
                },
            });
        }
        let rootEntity = await this.prisma.entity.findFirst({ where: { level: 'ROOT' } });
        if (!rootEntity) {
            rootEntity = await this.prisma.entity.create({
                data: {
                    name: 'هيئة التفتيش العام بوزارة الداخلية',
                    level: 'ROOT',
                    isAssistant: false,
                },
            });
        }
        let level1Entity = await this.prisma.entity.findFirst({ where: { parentId: rootEntity.id } });
        if (!level1Entity) {
            level1Entity = await this.prisma.entity.create({
                data: {
                    name: 'مديرية تفتيش المنطقة الأولى',
                    parentId: rootEntity.id,
                    level: 'LEVEL_1',
                    isAssistant: false,
                },
            });
        }
        let level2Entity = await this.prisma.entity.findFirst({ where: { parentId: level1Entity.id } });
        if (!level2Entity) {
            level2Entity = await this.prisma.entity.create({
                data: {
                    name: 'قسم تفتيش بغداد الكرخ',
                    parentId: level1Entity.id,
                    level: 'LEVEL_2',
                    isAssistant: false,
                },
            });
        }
        let level3Entity = await this.prisma.entity.findFirst({ where: { parentId: level2Entity.id } });
        if (!level3Entity) {
            level3Entity = await this.prisma.entity.create({
                data: {
                    name: 'شعبة تفتيش مركز الكاظمية',
                    parentId: level2Entity.id,
                    level: 'LEVEL_3',
                    isAssistant: false,
                },
            });
            await this.prisma.entityPosition.createMany({
                data: [
                    {
                        entityId: level3Entity.id,
                        positionName: 'آمر شعبة التفتيش',
                        positionStatus: 'اصالة',
                        statisticalNumber: 'A-10903',
                        positionHolder: 'العقيد خالد كريم الموسوي',
                        joinedDate: new Date('2024-01-10'),
                        isActive: true,
                    },
                    {
                        entityId: level3Entity.id,
                        positionName: 'معاون آمر شعبة التفتيش',
                        positionStatus: 'تكليف',
                        statisticalNumber: 'A-11005',
                        positionHolder: 'المقدم محمد عبد الرضا',
                        joinedDate: new Date('2024-04-12'),
                        isActive: true,
                    },
                ],
            });
        }
        const criteriaCount = await this.prisma.primaryCriteria.count();
        if (criteriaCount === 0) {
            console.log('Database criteria are empty. Please run node seed_hq.js to initialize the templates.');
        }
        let legacyUsersCount = 0;
        let legacyEntitiesCount = 0;
        let legacyCampaignsCount = 0;
        try {
            const dataPath1 = path.join(process.cwd(), '../Projects/build/data/inspectionData.json');
            const dataPath2 = path.join(process.cwd(), '../Projects/build/data/inspectionData_old.json');
            const file1Exists = fs.existsSync(dataPath1);
            const file2Exists = fs.existsSync(dataPath2);
            if (file1Exists || file2Exists) {
                const json1 = file1Exists ? JSON.parse(fs.readFileSync(dataPath1, 'utf8')) : { users: [], campaigns: [] };
                const json2 = file2Exists ? JSON.parse(fs.readFileSync(dataPath2, 'utf8')) : { users: [], campaigns: [] };
                const mergedUsers = new Map();
                for (const u of [...(json1.users || []), ...(json2.users || [])]) {
                    if (u.id && u.username) {
                        mergedUsers.set(this.toUuid(u.id), u);
                    }
                }
                const usedUsernames = new Set();
                usedUsernames.add('ahmed');
                usedUsernames.add('ali');
                for (const [uuid, u] of mergedUsers.entries()) {
                    let username = u.username.toLowerCase().trim();
                    const baseUsername = username;
                    let suffix = 1;
                    while (usedUsernames.has(username)) {
                        username = `${baseUsername}_${suffix}`;
                        suffix++;
                    }
                    usedUsernames.add(username);
                    const userRole = u.role === 'administrator' ? adminRole : evaluatorRole;
                    if (userRole === evaluatorRole) {
                        await this.prisma.inspector.upsert({
                            where: { id: uuid },
                            update: {
                                fullName: (u.fullName || '').slice(0, 150),
                                department: (u.department || '').slice(0, 150),
                            },
                            create: {
                                id: uuid,
                                fullName: (u.fullName || '').slice(0, 150),
                                department: (u.department || '').slice(0, 150),
                                isActive: true,
                            },
                        });
                    }
                    else {
                        const uHash = await bcrypt.hash(u.password || '1234', 10);
                        await this.prisma.user.upsert({
                            where: { id: uuid },
                            update: {
                                fullName: (u.fullName || '').slice(0, 150),
                                username: username.slice(0, 50),
                                department: (u.department || '').slice(0, 150),
                            },
                            create: {
                                id: uuid,
                                fullName: (u.fullName || '').slice(0, 150),
                                username: username.slice(0, 50),
                                passwordHash: uHash,
                                roleId: userRole.id,
                                department: (u.department || '').slice(0, 150),
                                isActive: true,
                            },
                        });
                    }
                    legacyUsersCount++;
                }
                const entitiesMap = new Map();
                const parseTree = (tree) => {
                    if (!tree)
                        return;
                    const levels = ['root', 'level_1', 'level_2', 'level_3'];
                    for (const lvl of levels) {
                        const list = tree[lvl] || [];
                        for (const item of list) {
                            if (item.id && item.name) {
                                const uuid = this.toUuid(item.id);
                                entitiesMap.set(uuid, {
                                    id: uuid,
                                    name: item.name,
                                    parentId: item.parentId ? this.toUuid(item.parentId) : null,
                                    level: lvl === 'root' ? 'ROOT' : lvl.toUpperCase(),
                                    isAssistant: item.isAssistant === '1' || item.isAssistant === true,
                                    positionInfo: item.positionInfo || [],
                                });
                            }
                        }
                    }
                };
                if (json1.hierarchy?.entityTree)
                    parseTree(json1.hierarchy.entityTree);
                if (json2.hierarchy?.entityTree)
                    parseTree(json2.hierarchy.entityTree);
                const mergedCampaigns = new Map();
                for (const c of [...(json1.campaigns || []), ...(json2.campaigns || [])]) {
                    if (c.id) {
                        mergedCampaigns.set(this.toUuid(c.id), c);
                        if (c.entityId) {
                            const entUuid = this.toUuid(c.entityId);
                            if (!entitiesMap.has(entUuid)) {
                                let entName = 'جهة تفتيشية مستوردة';
                                const logs = [...(json1.auditLogs || []), ...(json2.auditLogs || [])];
                                const matchLog = logs.find((l) => l.details?.entityId === c.entityId && l.details?.name);
                                if (matchLog)
                                    entName = matchLog.details.name;
                                entitiesMap.set(entUuid, {
                                    id: entUuid,
                                    name: entName,
                                    parentId: null,
                                    level: 'ROOT',
                                    isAssistant: false,
                                    positionInfo: [],
                                });
                            }
                        }
                    }
                }
                for (const [uuid, ent] of entitiesMap.entries()) {
                    await this.prisma.entity.upsert({
                        where: { id: uuid },
                        update: {
                            name: ent.name.slice(0, 200),
                            level: ent.level.slice(0, 20),
                            isAssistant: ent.isAssistant,
                        },
                        create: {
                            id: uuid,
                            name: ent.name.slice(0, 200),
                            level: ent.level.slice(0, 20),
                            isAssistant: ent.isAssistant,
                            parentId: null,
                        },
                    });
                    legacyEntitiesCount++;
                }
                for (const [uuid, ent] of entitiesMap.entries()) {
                    if (ent.parentId) {
                        const parentExists = await this.prisma.entity.findUnique({ where: { id: ent.parentId } });
                        if (parentExists) {
                            await this.prisma.entity.update({
                                where: { id: uuid },
                                data: { parentId: ent.parentId },
                            });
                        }
                    }
                }
                for (const [uuid, ent] of entitiesMap.entries()) {
                    let posName = '';
                    let posStatus = 'اصالة';
                    let statNum = '';
                    let holder = '';
                    let joined = null;
                    if (Array.isArray(ent.positionInfo)) {
                        for (const obj of ent.positionInfo) {
                            if (obj.positionName)
                                posName = obj.positionName;
                            if (obj.PositionStatus || obj.positionStatus)
                                posStatus = obj.PositionStatus || obj.positionStatus;
                            if (obj.statisticalNumber)
                                statNum = obj.statisticalNumber;
                            if (obj.positionHolder)
                                holder = obj.positionHolder;
                            if (obj.positionDate || obj.joinedDate) {
                                const dt = obj.positionDate || obj.joinedDate;
                                joined = dt ? new Date(dt) : null;
                            }
                        }
                    }
                    await this.prisma.entityPosition.deleteMany({ where: { entityId: uuid } });
                    if (posName || holder) {
                        await this.prisma.entityPosition.create({
                            data: {
                                entityId: uuid,
                                positionName: (posName || 'شاغل منصب').slice(0, 150),
                                positionStatus: (posStatus || 'اصالة').slice(0, 20),
                                statisticalNumber: (statNum || '000000').slice(0, 50),
                                positionHolder: (holder || 'غير متوفر').slice(0, 150),
                                joinedDate: joined,
                                isActive: true,
                            },
                        });
                    }
                }
                for (const [campaignUuid, c] of mergedCampaigns.entries()) {
                    const leaderUuid = c.authorship?.leaderId ? this.toUuid(c.authorship.leaderId) : null;
                    const deputyUuid = c.authorship?.deputyLeaderId ? this.toUuid(c.authorship.deputyLeaderId) : null;
                    const entityUuid = c.entityId ? this.toUuid(c.entityId) : null;
                    const leaderExists = leaderUuid ? await this.prisma.inspector.findUnique({ where: { id: leaderUuid } }) : null;
                    const deputyExists = deputyUuid ? await this.prisma.inspector.findUnique({ where: { id: deputyUuid } }) : null;
                    const entityExists = entityUuid ? await this.prisma.entity.findUnique({ where: { id: entityUuid } }) : null;
                    const refNum = (c.assignment?.reference || 'غير محدد').slice(0, 100);
                    const nameStr = `لجنة تفتيشية رقم ${refNum} - ${c.purpose ? c.purpose.slice(0, 80) + '...' : ''}`.slice(0, 255);
                    await this.prisma.campaignMember.deleteMany({ where: { campaignId: campaignUuid } });
                    await this.prisma.campaignNote.deleteMany({ where: { campaignId: campaignUuid } });
                    await this.prisma.campaignRecommendation.deleteMany({ where: { campaignId: campaignUuid } });
                    await this.prisma.campaignAppendix.deleteMany({ where: { campaignId: campaignUuid } });
                    await this.prisma.campaign.upsert({
                        where: { id: campaignUuid },
                        update: {
                            name: nameStr,
                            type: (c.type || 'regular').slice(0, 20),
                            assignmentText: c.assignment?.text || '',
                            assignmentReference: refNum,
                            assignmentDate: c.assignment?.date ? new Date(c.assignment.date) : new Date(),
                            leaderId: leaderExists ? leaderUuid : null,
                            deputyId: deputyExists ? deputyUuid : null,
                            purpose: c.purpose || '',
                            entityId: entityExists ? entityUuid : null,
                            formationNumber: (c.formationNumber || `هـ.ت / ${refNum}`).slice(0, 100),
                            startDate: c.startDate ? new Date(c.startDate) : new Date(),
                            endDate: c.endDate ? new Date(c.endDate) : null,
                            status: (c.status || 'active').slice(0, 20),
                        },
                        create: {
                            id: campaignUuid,
                            name: nameStr,
                            type: (c.type || 'regular').slice(0, 20),
                            assignmentText: c.assignment?.text || '',
                            assignmentReference: refNum,
                            assignmentDate: c.assignment?.date ? new Date(c.assignment.date) : new Date(),
                            leaderId: leaderExists ? leaderUuid : null,
                            deputyId: deputyExists ? deputyUuid : null,
                            purpose: c.purpose || '',
                            entityId: entityExists ? entityUuid : null,
                            formationNumber: (c.formationNumber || `هـ.ت / ${refNum}`).slice(0, 100),
                            startDate: c.startDate ? new Date(c.startDate) : new Date(),
                            endDate: c.endDate ? new Date(c.endDate) : null,
                            status: (c.status || 'active').slice(0, 20),
                        },
                    });
                    if (c.authorship?.memberIds && Array.isArray(c.authorship.memberIds)) {
                        for (const mId of c.authorship.memberIds) {
                            const mUuid = this.toUuid(mId);
                            const mExists = await this.prisma.inspector.findUnique({ where: { id: mUuid } });
                            if (mExists) {
                                await this.prisma.campaignMember.upsert({
                                    where: { campaignId_inspectorId: { campaignId: campaignUuid, inspectorId: mUuid } },
                                    update: {},
                                    create: {
                                        campaignId: campaignUuid,
                                        inspectorId: mUuid,
                                    },
                                });
                            }
                        }
                    }
                    const noteCategories = [
                        { key: 'positives', type: 'positive' },
                        { key: 'negatives', type: 'negative' },
                        { key: 'obstacles', type: 'obstacle' },
                        { key: 'impediments', type: 'impediment' },
                    ];
                    for (const cat of noteCategories) {
                        const noteList = c.notes?.[cat.key] || [];
                        for (let i = 0; i < noteList.length; i++) {
                            const n = noteList[i];
                            const nUuid = this.toUuid(n.id);
                            await this.prisma.campaignNote.create({
                                data: {
                                    id: nUuid,
                                    campaignId: campaignUuid,
                                    type: cat.type.slice(0, 20),
                                    text: n.text,
                                    sortOrder: i,
                                    parentNoteId: null,
                                },
                            });
                            const subList = n.sub || [];
                            for (let j = 0; j < subList.length; j++) {
                                const sub = subList[j];
                                const subUuid = this.toUuid(sub.id);
                                await this.prisma.campaignNote.create({
                                    data: {
                                        id: subUuid,
                                        campaignId: campaignUuid,
                                        type: cat.type.slice(0, 20),
                                        text: sub.text,
                                        sortOrder: j,
                                        parentNoteId: nUuid,
                                    },
                                });
                            }
                        }
                    }
                    const recsList = c.recommendations || [];
                    for (let i = 0; i < recsList.length; i++) {
                        const r = recsList[i];
                        const rUuid = this.toUuid(r.id);
                        const authorityName = (r.label || 'جهة غير محددة').slice(0, 150);
                        await this.prisma.campaignRecommendation.create({
                            data: {
                                id: rUuid,
                                campaignId: campaignUuid,
                                authorityName,
                                recommendationText: '',
                                sortOrder: i,
                                parentRecId: null,
                            },
                        });
                        const children = r.children || [];
                        for (let j = 0; j < children.length; j++) {
                            const child = children[j];
                            const childUuid = this.toUuid(child.id);
                            await this.prisma.campaignRecommendation.create({
                                data: {
                                    id: childUuid,
                                    campaignId: campaignUuid,
                                    authorityName,
                                    recommendationText: child.label || '',
                                    sortOrder: j,
                                    parentRecId: rUuid,
                                },
                            });
                            const subpoints = child.subpoints || [];
                            for (let k = 0; k < subpoints.length; k++) {
                                const sp = subpoints[k];
                                const spUuid = this.toUuid(sp.id);
                                await this.prisma.campaignRecommendation.create({
                                    data: {
                                        id: spUuid,
                                        campaignId: campaignUuid,
                                        authorityName,
                                        recommendationText: sp.text || '',
                                        sortOrder: k,
                                        parentRecId: childUuid,
                                    },
                                });
                            }
                        }
                    }
                    const appList = c.appendices || [];
                    const arabicLetters = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح', 'ط', 'ي', 'ك', 'ل', 'م', 'ن', 'س', 'ع', 'ف', 'ص', 'ق'];
                    for (let i = 0; i < appList.length; i++) {
                        const app = appList[i];
                        const appUuid = this.toUuid(app.id);
                        const symbol = (arabicLetters[i] || `${i + 1}`).slice(0, 5);
                        await this.prisma.campaignAppendix.create({
                            data: {
                                id: appUuid,
                                campaignId: campaignUuid,
                                symbol,
                                text: app.text,
                            },
                        });
                    }
                    legacyCampaignsCount++;
                }
            }
        }
        catch (e) {
            console.error('Error seeding legacy JSON data:', e);
        }
        return {
            message: 'Database seeded successfully with default Roles, Users, Organogram, Evaluation Criteria, and merged legacy campaigns data.',
            admin: { username: 'ahmed', password: '1234' },
            evaluator: { username: 'ali', password: '1234' },
            imported: {
                users: legacyUsersCount,
                entities: legacyEntitiesCount,
                campaigns: legacyCampaignsCount,
            },
        };
    }
    toUuid(str) {
        if (!str || typeof str !== 'string') {
            return crypto.randomUUID();
        }
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)) {
            return str.toLowerCase();
        }
        const hash = crypto.createHash('md5').update(str).digest('hex');
        return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}`;
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService,
        audit_logs_service_1.AuditLogsService])
], AuthService);
//# sourceMappingURL=auth.service.js.map