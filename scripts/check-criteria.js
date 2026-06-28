"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const p = new client_1.PrismaClient();
async function main() {
    console.log('═══════════════════════════════════════');
    console.log('  CRITERIA HEALTH CHECK');
    console.log('═══════════════════════════════════════');
    const rows = [
        { table: 'evaluation_option_types', model: 'EvaluationOptionType', expected: null },
        { table: 'criteria_templates', model: 'CriteriaTemplate', expected: null },
        { table: 'primary_criteria', model: 'PrimaryCriteria', expected: null },
        { table: 'secondary_criteria', model: 'SecondaryCriteria', expected: null },
        { table: 'criteria_details', model: 'CriteriaDetail', expected: null },
        { table: 'criteria_options', model: 'CriteriaOption', expected: null },
        { table: 'criteria_template_items', model: 'CriteriaTemplateItem', expected: null },
        { table: 'inspections', model: 'Inspection', expected: 0 },
        { table: 'inspection_grades', model: 'InspectionGrade', expected: 0 },
        { table: 'inspection_selected_options', model: 'InspectionSelectedOption', expected: 0 },
        { table: 'report_presentations', model: 'ReportPresentation', expected: 0 },
    ];
    let allOk = true;
    for (const { table, model, expected } of rows) {
        const count = await p[model].count();
        const status = expected !== null && count !== expected ? '❌' : '✅';
        if (status === '❌')
            allOk = false;
        const exp = expected !== null ? ` (expected ${expected})` : '';
        console.log(`  ${status} ${table}: ${count}${exp}`);
    }
    console.log('\n--- FK Integrity ---');
    const templates = await p.criteriaTemplate.count();
    const primaries = await p.primaryCriteria.count();
    const secondaries = await p.secondaryCriteria.count();
    const details = await p.criteriaDetail.count();
    const options = await p.criteriaOption.count();
    const items = await p.criteriaTemplateItem.count();
    const eot = await p.evaluationOptionType.count();
    console.log(`  ${templates > 0 ? '✅' : '❌'} criteria_templates: ${templates}`);
    console.log(`  ${primaries > 0 ? '✅' : '❌'} primary_criteria: ${primaries}`);
    console.log(`  ${secondaries > 0 ? '✅' : '❌'} secondary_criteria: ${secondaries}`);
    console.log(`  ${details > 0 ? '✅' : '❌'} criteria_details: ${details}`);
    console.log(`  ${options > 0 ? '✅' : '❌'} criteria_options: ${options}`);
    console.log(`  ${items > 0 ? '✅' : '❌'} criteria_template_items: ${items}`);
    console.log(`  ${eot > 0 ? '✅' : '❌'} evaluation_option_types: ${eot}`);
    const def = await p.criteriaTemplate.findFirst({ where: { isDefault: true } });
    console.log(`\n  ${def ? '✅' : '❌'} Default template: ${def?.name ?? 'NONE'}`);
    const allItems = await p.criteriaTemplateItem.findMany({ include: { primary: true } });
    const badItems = allItems.filter(i => !i.primary);
    console.log(`  ${badItems.length === 0 ? '✅' : '❌'} template_items with invalid primary_id: ${badItems.length}`);
    console.log('\n═══════════════════════════════════════');
    console.log(allOk ? '  ✅ ALL CHECKS PASSED' : '  ❌ SOME CHECKS FAILED');
    console.log('═══════════════════════════════════════');
    await p.$disconnect();
}
main().catch(e => { console.error(e); p.$disconnect(); process.exit(1); });
//# sourceMappingURL=check-criteria.js.map