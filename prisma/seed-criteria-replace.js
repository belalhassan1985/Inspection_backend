"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const fs = require("fs");
const path = require("path");
const prisma = new client_1.PrismaClient();
const IMPORT_DIR = path.join(__dirname, 'imports', 'criteria');
function parseCsv(text) {
    const lines = text.replace(/\r\n/g, '\n').split('\n').filter(Boolean);
    const headers = parseCsvLine(lines[0]);
    const rows = lines.slice(1).map(line => parseCsvLine(line));
    return { headers, rows };
}
function parseCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                current += '"';
                i++;
            }
            else {
                inQuotes = !inQuotes;
            }
        }
        else if (ch === ',' && !inQuotes) {
            result.push(current);
            current = '';
        }
        else {
            current += ch;
        }
    }
    result.push(current);
    return result;
}
function parseTableSchema(raw, lineNum) {
    if (!raw || raw.trim() === '' || raw.trim().toLowerCase() === 'null')
        return null;
    let parsed;
    try {
        parsed = JSON.parse(raw);
        return parsed;
    }
    catch {
        const fixed = raw
            .replace(/'/g, '"')
            .replace(/""/g, '"');
        try {
            parsed = JSON.parse(fixed);
            console.log(`  ⚠️ Fixed JSON in criteria_details.csv line ${lineNum}`);
            return parsed;
        }
        catch {
            console.error(`  ❌ Cannot parse JSON in criteria_details.csv line ${lineNum}: ${raw.substring(0, 80)}...`);
            return null;
        }
    }
}
function toBool(v) {
    return v === 't' || v === 'true' || v === '1';
}
function toDecimal(v) {
    if (!v || v.trim() === '')
        return null;
    return v.trim();
}
function toDate(v) {
    if (!v || v.trim() === '')
        return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
}
function toInt(v) {
    if (!v || v.trim() === '')
        return null;
    const n = parseInt(v, 10);
    return isNaN(n) ? null : n;
}
function loadCsv(filename) {
    const filePath = path.join(IMPORT_DIR, filename);
    const text = fs.readFileSync(filePath, 'utf-8');
    const { headers, rows: rawRows } = parseCsv(text);
    const rows = rawRows.map(r => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = r[i] ?? ''; });
        return obj;
    });
    console.log(`  📄 ${filename}: ${rows.length} rows`);
    return { headers, rows };
}
async function main() {
    console.log('═══════════════════════════════════════');
    console.log('  SEED: Criteria Fresh Start');
    console.log('═══════════════════════════════════════');
    console.log('\n📥 Loading CSV files...');
    const csvEot = loadCsv('evaluation_option_types.csv');
    const csvTemplates = loadCsv('criteria_templates.csv');
    const csvPrimary = loadCsv('primary_criteria.csv');
    const csvSecondary = loadCsv('secondary_criteria.csv');
    const csvDetails = loadCsv('criteria_details.csv');
    const csvOptions = loadCsv('criteria_options.csv');
    const csvTemplateItems = loadCsv('criteria_template_items.csv');
    console.log('\n🔍 Verifying FK references...');
    const eotIds = new Set(csvEot.rows.map(r => parseInt(r.id)));
    const templateIds = new Set(csvTemplates.rows.map(r => r.id));
    const primaryIds = new Set(csvPrimary.rows.map(r => parseInt(r.id)));
    const secondaryIds = new Set(csvSecondary.rows.map(r => parseInt(r.id)));
    const detailIds = new Set(csvDetails.rows.map(r => parseInt(r.id)));
    let fkErrors = 0;
    for (const r of csvSecondary.rows) {
        if (!primaryIds.has(parseInt(r.primary_id))) {
            console.log(`  ❌ secondary_criteria: primary_id=${r.primary_id} not found in primary_criteria`);
            fkErrors++;
        }
    }
    for (const r of csvDetails.rows) {
        if (!secondaryIds.has(parseInt(r.secondary_id))) {
            console.log(`  ❌ criteria_details: secondary_id=${r.secondary_id} not found in secondary_criteria`);
            fkErrors++;
        }
    }
    for (const r of csvOptions.rows) {
        if (!detailIds.has(parseInt(r.detail_id))) {
            console.log(`  ❌ criteria_options: detail_id=${r.detail_id} not found in criteria_details`);
            fkErrors++;
        }
        if (r.option_type_id && r.option_type_id.trim() !== '') {
            const otId = parseInt(r.option_type_id);
            if (!eotIds.has(otId)) {
                console.log(`  ❌ criteria_options: option_type_id=${otId} not found in evaluation_option_types`);
                fkErrors++;
            }
        }
    }
    for (const r of csvTemplateItems.rows) {
        if (!templateIds.has(r.template_id)) {
            console.log(`  ❌ criteria_template_items: template_id=${r.template_id} not found in criteria_templates`);
            fkErrors++;
        }
        if (!primaryIds.has(parseInt(r.primary_id))) {
            console.log(`  ❌ criteria_template_items: primary_id=${r.primary_id} not found in primary_criteria`);
            fkErrors++;
        }
    }
    if (fkErrors > 0) {
        console.log(`\n❌ Found ${fkErrors} FK errors. Aborting.`);
        process.exit(1);
    }
    console.log('  ✅ All FK references valid');
    console.log('\n📊 Counting existing records...');
    const countsBefore = {};
    for (const [table, model] of Object.entries(MODEL_MAP)) {
        countsBefore[table] = await prisma[model].count();
        console.log(`  ${table}: ${countsBefore[table]}`);
    }
    console.log('\n🔄 Starting transaction...');
    await prisma.$transaction(async (tx) => {
        console.log('  Disconnecting campaigns from templates...');
        await tx.$executeRawUnsafe(`UPDATE campaigns SET template_id = NULL`);
        console.log('  Deleting inspection data...');
        await tx.inspectionSelectedOption.deleteMany();
        await tx.inspectionGrade.deleteMany();
        await tx.inspection.deleteMany();
        await tx.reportPresentation.deleteMany();
        console.log('  Deleting old criteria data...');
        await tx.criteriaOption.deleteMany();
        await tx.criteriaDetail.deleteMany();
        await tx.secondaryCriteria.deleteMany();
        await tx.criteriaTemplateItem.deleteMany();
        await tx.primaryCriteria.deleteMany();
        await tx.criteriaTemplate.deleteMany();
        await tx.evaluationOptionType.deleteMany();
        console.log('  Inserting evaluation_option_types...');
        for (const r of csvEot.rows) {
            await tx.evaluationOptionType.create({
                data: {
                    id: parseInt(r.id),
                    code: r.code,
                    nameAr: r.name_ar,
                    nameEn: r.name_en || null,
                    color: r.color || null,
                    icon: r.icon || null,
                    sortOrder: parseInt(r.sort_order),
                    affectsScore: toBool(r.affects_score),
                    scoreMultiplier: toDecimal(r.score_multiplier),
                    isActive: toBool(r.is_active),
                    createdAt: toDate(r.created_at),
                    updatedAt: toDate(r.updated_at),
                },
            });
        }
        console.log('  Inserting criteria_templates...');
        for (const r of csvTemplates.rows) {
            await tx.criteriaTemplate.create({
                data: {
                    id: r.id,
                    name: r.name,
                    description: r.description || null,
                    isDefault: toBool(r.is_default),
                    isActive: toBool(r.is_active),
                    createdAt: toDate(r.created_at),
                    updatedAt: toDate(r.updated_at),
                },
            });
        }
        console.log('  Inserting primary_criteria...');
        for (const r of csvPrimary.rows) {
            await tx.primaryCriteria.create({
                data: {
                    id: parseInt(r.id),
                    title: r.title,
                    maxGrade: toDecimal(r.max_grade),
                    sortOrder: parseInt(r.sort_order),
                },
            });
        }
        console.log('  Inserting secondary_criteria...');
        for (const r of csvSecondary.rows) {
            await tx.secondaryCriteria.create({
                data: {
                    id: parseInt(r.id),
                    primaryId: parseInt(r.primary_id),
                    title: r.title,
                    maxGrade: toDecimal(r.max_grade),
                    sortOrder: parseInt(r.sort_order),
                },
            });
        }
        console.log('  Inserting criteria_details...');
        let fixedLines = 0;
        for (let i = 0; i < csvDetails.rows.length; i++) {
            const r = csvDetails.rows[i];
            const csvLine = i + 2;
            const tableSchema = parseTableSchema(r.table_schema || null, csvLine);
            if (tableSchema && r.table_schema && r.table_schema.includes("'"))
                fixedLines++;
            await tx.criteriaDetail.create({
                data: {
                    id: parseInt(r.id),
                    secondaryId: parseInt(r.secondary_id),
                    detailText: r.detail_text,
                    maxGrade: toDecimal(r.max_grade),
                    inputType: r.input_type || 'single',
                    tableSchema: tableSchema,
                    sortOrder: r.sort_order ? parseInt(r.sort_order) : 0,
                },
            });
        }
        console.log('  Inserting criteria_options...');
        for (const r of csvOptions.rows) {
            await tx.criteriaOption.create({
                data: {
                    id: parseInt(r.id),
                    detailId: parseInt(r.detail_id),
                    optionText: r.option_text,
                    type: r.type,
                    optionTypeId: toInt(r.option_type_id),
                    scoreValue: toDecimal(r.score_value),
                },
            });
        }
        console.log('  Inserting criteria_template_items...');
        for (const r of csvTemplateItems.rows) {
            await tx.criteriaTemplateItem.create({
                data: {
                    id: r.id,
                    templateId: r.template_id,
                    primaryId: parseInt(r.primary_id),
                    sortOrder: parseInt(r.sort_order),
                },
            });
        }
        console.log('  ✅ Transaction completed successfully');
    }, {
        maxWait: 60000,
        timeout: 120000,
    });
    console.log('\n🔍 Verifying imported data...');
    const countsAfter = {};
    for (const [table, model] of Object.entries(MODEL_MAP)) {
        countsAfter[table] = await prisma[model].count();
        const diff = countsAfter[table] - (countsBefore[table] || 0);
        const status = countsAfter[table] > 0 ? '✅' : '❌';
        console.log(`  ${status} ${table}: ${countsAfter[table]} records (Δ${diff >= 0 ? '+' : ''}${diff})`);
    }
    const defaultTemplate = await prisma.criteriaTemplate.findFirst({ where: { isDefault: true } });
    console.log(`\n📛 Default template: ${defaultTemplate?.name ?? 'NONE'} (${defaultTemplate?.id ?? 'N/A'})`);
    const campaignCount = await prisma.campaign.count();
    const campaignWithTemplate = await prisma.campaign.count({ where: { templateId: { not: null } } });
    console.log(`\n📋 Campaigns: ${campaignCount} total, ${campaignWithTemplate} with template_id`);
    console.log('\n═══════════════════════════════════════');
    console.log('  SEED COMPLETE');
    console.log('═══════════════════════════════════════');
}
const MODEL_MAP = {
    evaluation_option_types: 'EvaluationOptionType',
    criteria_templates: 'CriteriaTemplate',
    primary_criteria: 'PrimaryCriteria',
    secondary_criteria: 'SecondaryCriteria',
    criteria_details: 'CriteriaDetail',
    criteria_options: 'CriteriaOption',
    criteria_template_items: 'CriteriaTemplateItem',
    inspections: 'Inspection',
    inspection_grades: 'InspectionGrade',
    inspection_selected_options: 'InspectionSelectedOption',
    report_presentations: 'ReportPresentation',
};
main().catch(err => {
    console.error('\n❌ Seed failed:', err);
    prisma.$disconnect();
    process.exit(1);
}).finally(() => {
    prisma.$disconnect();
});
//# sourceMappingURL=seed-criteria-replace.js.map