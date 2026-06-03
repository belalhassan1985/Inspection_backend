const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const primaryId = 6;
  const primary = await prisma.primaryCriteria.findUnique({
    where: { id: primaryId },
    include: {
      secondaryCriteria: {
        orderBy: { id: 'asc' }
      }
    }
  });

  if (!primary) {
    console.log(`Primary Criteria with ID ${primaryId} not found`);
    return;
  }

  console.log(`Primary: ${primary.title}`);
  primary.secondaryCriteria.forEach(sec => {
    console.log(`  - Secondary ID: ${sec.id}, Title: ${sec.title}, MaxGrade: ${sec.maxGrade}`);
  });
}

main().catch(err => {
  console.error(err);
}).finally(() => {
  prisma.$disconnect();
});
