const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getCriteriaTemplate(campaignId) {
  if (campaignId) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
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
                          include: { options: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const tpl = campaign?.template;
    if (tpl?.isDefault) {
      const currentCount = await prisma.primaryCriteria.count();
      const linkedCount = await prisma.criteriaTemplateItem.count({
        where: { templateId: tpl.id },
      });
      if (currentCount !== linkedCount) {
        await prisma.criteriaTemplateItem.deleteMany({
          where: { templateId: tpl.id },
        });
        const allPrimaries = await prisma.primaryCriteria.findMany({
          orderBy: { id: 'asc' },
        });
        if (allPrimaries.length > 0) {
          await prisma.criteriaTemplateItem.createMany({
            data: allPrimaries.map((p, i) => ({
              templateId: tpl.id,
              primaryId: p.id,
              sortOrder: i,
            })),
          });
        }
        const refreshed = await prisma.campaign.findUnique({
          where: { id: campaignId },
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
                              include: { options: true },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        });
        if (refreshed?.template?.items?.length) {
          return refreshed.template.items.map((item) => item.primary);
        }
      }
    }

    if (campaign?.template?.items?.length) {
      return campaign.template.items.map((item) => item.primary);
    }
  }

  return prisma.primaryCriteria.findMany({
    include: {
      secondaryCriteria: {
        include: {
          details: {
            include: {
              options: true,
            },
          },
        },
      },
    },
  });
}

async function main() {
  const campaigns = await prisma.campaign.findMany();
  for (const c of campaigns) {
    const template = await getCriteriaTemplate(c.id);
    console.log(`Campaign: ${c.name} (${c.id})`);
    console.log(`  Template returned: ${template.map(p => `${p.title} (ID: ${p.id})`).join(', ')}`);
  }
}

main().catch(err => {
  console.error(err);
}).finally(() => {
  prisma.$disconnect();
});
