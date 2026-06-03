const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const primaries = await prisma.primaryCriteria.findMany({
    include: {
      secondaryCriteria: {
        include: {
          details: true
        }
      }
    }
  });

  console.log('=== HIERARCHY ===');
  primaries.forEach(p => {
    console.log(`Primary ID: ${p.id}, Title: ${p.title}, MaxGrade: ${p.maxGrade}`);
    p.secondaryCriteria.forEach(sec => {
      console.log(`  Secondary ID: ${sec.id}, Title: ${sec.title}, MaxGrade: ${sec.maxGrade}`);
      console.log(`    Details Count: ${sec.details.length}`);
      sec.details.slice(0, 3).forEach(d => {
        console.log(`      - Detail ID: ${d.id}, Text: ${d.detailText}, InputType: ${d.inputType}`);
      });
      if (sec.details.length > 3) {
        console.log(`      ... and ${sec.details.length - 3} more`);
      }
    });
  });
}

main().catch(err => {
  console.error(err);
}).finally(() => {
  prisma.$disconnect();
});
