const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const primaries = await prisma.primaryCriteria.findMany();
  console.log('=== PRIMARY CRITERIA ===');
  primaries.forEach(p => {
    console.log(`- ID: ${p.id}, Title: ${p.title}, MaxGrade: ${p.maxGrade}`);
  });
}

main().catch(err => {
  console.error(err);
}).finally(() => {
  prisma.$disconnect();
});
