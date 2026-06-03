const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const positions = await prisma.entityPosition.findMany({
    include: { entity: true },
    take: 30
  });

  console.log("Entity Positions sample:");
  positions.forEach((pos, i) => {
    console.log(`${i+1}. Entity: ${pos.entity.name}`);
    console.log(`   Holder: ${pos.positionHolder}`);
    console.log(`   Name: ${pos.positionName}`);
    console.log(`   Status: ${pos.positionStatus}`);
    console.log(`   StatNo: ${pos.statisticalNumber}`);
    console.log(`   JoinedDate: ${pos.joinedDate}`);
  });
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
