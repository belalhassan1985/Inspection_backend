const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
    const pres = await prisma.reportPresentation.findMany({ take: 1 });
    if (pres.length > 0) {
        console.log('Presentation found, campaignId:', pres[0].campaignId);
        const payload = typeof pres[0].payload === 'string' ? JSON.parse(pres[0].payload) : pres[0].payload;
        const sections = payload.sections || [];
        for (const sec of sections) {
            const subs = sec.subsections || [];
            for (const sub of subs) {
                const tables = sub.detailedTables || [];
                for (const t of tables) {
                    if (t.title && t.title.indexOf('\u0627\u0644\u0645\u0648\u0627\u0642\u0641') !== -1) {
                        console.log('FOUND in saved presentation!');
                        console.log('  Title:', t.title.substring(0, 120));
                        console.log('  Title bytes:', Array.from(t.title.substring(0, 10)).map(c => 'U+' + c.charCodeAt(0).toString(16).toUpperCase()).join(' '));
                    }
                }
            }
        }
    } else {
        console.log('No presentations found');
    }
    await prisma.$disconnect();
})().catch(e => { console.error(e.message); });
