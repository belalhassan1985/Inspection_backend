const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // 1. Create a new primary criteria that is NOT in the default template
  const newPrimary = await prisma.primaryCriteria.create({
    data: {
      title: 'ج. تجربة العزل للمحاور',
      maxGrade: 100
    }
  });
  console.log(`Created new PrimaryCriteria: ${newPrimary.title} (ID: ${newPrimary.id})`);

  // 2. Find a campaign with the default template (which is 'أسس الأمن المناطقي المطور')
  const campaign = await prisma.campaign.findFirst({
    where: {
      template: {
        name: 'أسس الأمن المناطقي المطور'
      }
    }
  });

  if (!campaign) {
    console.log('No campaign found with template أسس الأمن المناطقي المطور');
    await prisma.primaryCriteria.delete({ where: { id: newPrimary.id } });
    return;
  }

  console.log(`Testing with Campaign: ${campaign.name} (ID: ${campaign.id})`);

  // 3. Simulate getCriteriaTemplate
  const getCriteriaTemplate = async (campaignId) => {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        template: {
          include: {
            items: {
              orderBy: { sortOrder: 'asc' },
              include: {
                primary: true
              }
            }
          }
        }
      }
    });

    const tpl = campaign?.template;
    if (tpl?.isDefault) {
      const currentCount = await prisma.primaryCriteria.count();
      const linkedCount = await prisma.criteriaTemplateItem.count({
        where: { templateId: tpl.id },
      });
      if (currentCount !== linkedCount) {
        // Look at this! It syncs the default template by deleting and adding ALL primaries!
        console.log(`  [Sync Triggered] currentCount (${currentCount}) !== linkedCount (${linkedCount})`);
      }
    }

    if (campaign?.template?.items?.length) {
      return campaign.template.items.map((item) => item.primary);
    }

    return prisma.primaryCriteria.findMany();
  };

  const results = await getCriteriaTemplate(campaign.id);
  console.log('Results returned by API:');
  results.forEach(p => {
    console.log(`  - ${p.title} (ID: ${p.id})`);
  });

  const containsNewPrimary = results.some(p => p.id === newPrimary.id);
  console.log(`Does it contain the new primary? ${containsNewPrimary ? 'YES (Filter failed)' : 'NO (Filter works)'}`);

  // Cleanup
  // Delete template item if sync linked it
  if (campaign.templateId) {
    await prisma.criteriaTemplateItem.deleteMany({
      where: {
        templateId: campaign.templateId,
        primaryId: newPrimary.id
      }
    });
  }
  await prisma.primaryCriteria.delete({ where: { id: newPrimary.id } });
  console.log('Cleaned up new primary criteria.');
}

main().catch(err => {
  console.error(err);
}).finally(() => {
  prisma.$disconnect();
});
