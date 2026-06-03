const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Find a campaign or create a temporary campaign linked to 'اسس الافواج' (ID: '39c52ea8-15af-4204-8858-45a1d61e3191')
  const template = await prisma.criteriaTemplate.findFirst({
    where: { name: 'اسس الافواج' }
  });

  if (!template) {
    console.log('Template اسس الافواج not found');
    return;
  }

  const campaign = await prisma.campaign.create({
    data: {
      name: 'حملة تجريبية لأسس الأفواج',
      type: 'regular',
      assignmentText: 'تجربة',
      assignmentReference: '12345-test',
      assignmentDate: new Date(),
      startDate: new Date(),
      templateId: template.id
    }
  });

  console.log(`Created Campaign: ${campaign.name} (ID: ${campaign.id}) with Template: ${template.name}`);

  // Now, simulate the getCriteriaTemplate call
  const fetchedCampaign = await prisma.campaign.findUnique({
    where: { id: campaign.id },
    include: {
      template: {
        include: {
          items: {
            orderBy: { sortOrder: 'asc' },
            include: {
              primary: {
                include: {
                  secondaryCriteria: {
                    include: {
                      details: {
                        include: { options: true }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  });

  console.log(`Fetched Campaign Template Items Count: ${fetchedCampaign?.template?.items?.length}`);
  if (fetchedCampaign?.template?.items) {
    fetchedCampaign.template.items.forEach(item => {
      console.log(`  - Primary Criteria: ${item.primary.title} (ID: ${item.primary.id})`);
    });
  }

  // Cleanup
  await prisma.campaign.delete({ where: { id: campaign.id } });
  console.log('Deleted temporary campaign');
}

main().catch(err => {
  console.error(err);
}).finally(() => {
  prisma.$disconnect();
});
