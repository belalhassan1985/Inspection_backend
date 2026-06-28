const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
    const campaigns = await prisma.campaign.findMany({ take: 5, select: { id: true, name: true, type: true } });
    console.log('Campaigns:', JSON.stringify(campaigns, null, 2));
    const inspCount = await prisma.inspection.count();
    const gradeCount = await prisma.inspectionGrade.count();
    const presCount = await prisma.reportPresentation.count();
    console.log('Inspections:', inspCount, 'Grades:', gradeCount, 'Presentations:', presCount);
    const details = await prisma.criteriaDetail.findMany({
        where: { detailText: { contains: '\u0627\u0644\u0645\u0648\u0627\u0642\u0641' } },
        take: 5,
        select: { id: true, detailText: true }
    });
    console.log('Criteria details with المواقف:');
    details.forEach(d => {
        console.log('  [' + d.id + '] "' + d.detailText.substring(0, 100) + '"');
        for (let i = 0; i < d.detailText.length && i < 5; i++) {
            console.log('    char ' + i + ': U+' + d.detailText.charCodeAt(i).toString(16).toUpperCase());
        }
    });
    await prisma.$disconnect();
})().catch(e => { console.error(e.message); process.exit(1); });
