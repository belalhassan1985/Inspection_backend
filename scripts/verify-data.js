"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const p = new client_1.PrismaClient();
async function main() {
    console.log('=== Data Verification ===\n');
    const primary = await p.primaryCriteria.findMany({ orderBy: { id: 'asc' } });
    console.log('Primary Criteria:');
    primary.forEach(c => console.log(`  [${c.id}] ${c.title} - ${c.maxGrade}`));
    const secondary = await p.secondaryCriteria.findMany({ orderBy: { id: 'asc' }, take: 5 });
    console.log('\nSecondary Criteria (first 5):');
    secondary.forEach(c => console.log(`  [${c.id}] primary=${c.primaryId} ${c.title} - ${c.maxGrade}`));
    const allDetails = await p.criteriaDetail.findMany({ take: 600 });
    const detailsWithSchema = allDetails.filter(d => d.tableSchema !== null).slice(0, 3);
    console.log('\nDetails with table_schema (first 3):');
    detailsWithSchema.forEach(c => console.log(`  [${c.id}] type=${c.inputType} schema=${JSON.stringify(c.tableSchema).substring(0, 80)}...`));
    const templates = await p.criteriaTemplate.findMany({ orderBy: { isDefault: 'desc' } });
    console.log('\nTemplates:');
    templates.forEach(t => console.log(`  [${t.id.substring(0, 8)}...] ${t.name} default=${t.isDefault} active=${t.isActive}`));
    const items = await p.criteriaTemplateItem.findMany();
    console.log('\nTemplate Items:');
    items.forEach(i => console.log(`  template=${i.templateId.substring(0, 8)}... primary=${i.primaryId} order=${i.sortOrder}`));
    const eot = await p.evaluationOptionType.findMany({ orderBy: { id: 'asc' } });
    console.log('\nEvaluation Option Types:');
    eot.forEach(e => console.log(`  [${e.id}] ${e.code} - ${e.nameAr} (${e.nameEn})`));
    const campaigns = await p.campaign.findMany({ take: 3, orderBy: { createdAt: 'desc' } });
    console.log('\nCampaigns (last 3):');
    campaigns.forEach(c => console.log(`  [${c.id.substring(0, 8)}...] ${c.name} template_id=${c.templateId}`));
    const insp = await p.inspection.count();
    const grades = await p.inspectionGrade.count();
    const selOpts = await p.inspectionSelectedOption.count();
    const rp = await p.reportPresentation.count();
    console.log(`\nInspections: ${insp} | Grades: ${grades} | SelectedOptions: ${selOpts} | Reports: ${rp}`);
    await p.$disconnect();
}
main().catch(e => { console.error(e); p.$disconnect(); });
//# sourceMappingURL=verify-data.js.map