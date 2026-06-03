const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const campaigns = await prisma.campaign.findMany({
    include: {
      template: {
        include: {
          items: {
            include: {
              primary: true
            }
          }
        }
      }
    }
  });

  console.log('=== CAMPAIGNS ===');
  campaigns.forEach(c => {
    console.log(`Campaign: ${c.name} (ID: ${c.id})`);
    console.log(`  Template: ${c.template ? c.template.name : 'NONE'} (ID: ${c.templateId})`);
    if (c.template) {
      console.log(`  Items Count: ${c.template.items.length}`);
      c.template.items.forEach(item => {
        console.log(`    - Primary Criteria ID: ${item.primaryId}, Title: ${item.primary.title}`);
      });
    }
  });

  const templates = await prisma.criteriaTemplate.findMany({
    include: {
      items: {
        include: {
          primary: true
        }
      }
    }
  });

  console.log('\n=== CRITERIA TEMPLATES ===');
  templates.forEach(t => {
    console.log(`Template: ${t.name} (ID: ${t.id}, Default: ${t.isDefault})`);
    console.log(`  Items Count: ${t.items.length}`);
    t.items.forEach(item => {
      console.log(`    - Primary: ${item.primary.title} (ID: ${item.primaryId})`);
    });
  });
}

main().catch(err => {
  console.error(err);
}).finally(() => {
  prisma.$disconnect();
});
