import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const TABLE_MODEL_MAP: Record<string, string> = {
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

async function backup() {
  const backupDir = fs.readdirSync(
    path.join(__dirname, '..', 'backups')
  )
    .filter(d => d.startsWith('criteria-fresh-start-'))
    .sort()
    .reverse()[0];

  const fullPath = path.join(__dirname, '..', 'backups', backupDir);
  console.log(`Backup directory: ${fullPath}`);

  for (const [table, modelName] of Object.entries(TABLE_MODEL_MAP)) {
    try {
      const records = await (prisma as any)[modelName].findMany();
      const filePath = path.join(fullPath, `${table}.json`);
      fs.writeFileSync(filePath, JSON.stringify(records, null, 2), 'utf-8');
      console.log(`  ✅ ${table}: ${records.length} records → ${path.basename(filePath)}`);
    } catch (err) {
      console.log(`  ❌ ${table}: ERROR - ${err instanceof Error ? err.message : err}`);
    }
  }

  await prisma.$disconnect();
}

backup().catch(err => {
  console.error('Backup failed:', err);
  prisma.$disconnect();
  process.exit(1);
});
