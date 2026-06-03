const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== Seed: إنشاء القالب الافتراضي وربط الحملات ===\n');

  // 1. إنشاء أو إيجاد القالب الافتراضي
  let defaultTemplate = await prisma.criteriaTemplate.findFirst({
    where: { isDefault: true },
  });

  if (!defaultTemplate) {
    defaultTemplate = await prisma.criteriaTemplate.create({
      data: {
        name: 'القالب الافتراضي الموحد',
        description: 'يشمل جميع أسس التفتيش المعيارية الحالية',
        isDefault: true,
      },
    });
    console.log(`[+] تم إنشاء القالب الافتراضي: ${defaultTemplate.name} (${defaultTemplate.id})`);
  } else {
    console.log(`[*] القالب الافتراضي موجود مسبقاً: ${defaultTemplate.name} (${defaultTemplate.id})`);
  }

  // 2. ربط جميع PrimaryCriteria الحالية بالقالب
  const allPrimaries = await prisma.primaryCriteria.findMany({
    orderBy: { id: 'asc' },
  });
  console.log(`\n[+] عدد المحاور الرئيسية الموجودة: ${allPrimaries.length}`);

  let linkedCount = 0;
  for (let i = 0; i < allPrimaries.length; i++) {
    const p = allPrimaries[i];
    const existing = await prisma.criteriaTemplateItem.findUnique({
      where: {
        templateId_primaryId: {
          templateId: defaultTemplate.id,
          primaryId: p.id,
        },
      },
    });
    if (!existing) {
      await prisma.criteriaTemplateItem.create({
        data: {
          templateId: defaultTemplate.id,
          primaryId: p.id,
          sortOrder: i,
        },
      });
      linkedCount++;
    }
  }
  console.log(`[+] تم ربط ${linkedCount} محوراً جديداً بالقالب الافتراضي`);
  console.log(`[*] إجمالي المحاور في القالب: ${allPrimaries.length}`);

  // 3. ربط جميع الحملات التي لا تملك قالباً
  const campaignsWithoutTemplate = await prisma.campaign.findMany({
    where: { templateId: null },
  });
  console.log(`\n[+] عدد الحملات بدون قالب: ${campaignsWithoutTemplate.length}`);

  if (campaignsWithoutTemplate.length > 0) {
    await prisma.campaign.updateMany({
      where: { templateId: null },
      data: { templateId: defaultTemplate.id },
    });
    console.log(`[+] تم ربط ${campaignsWithoutTemplate.length} حملة بالقالب الافتراضي`);
  }

  // 4. التحقق
  const campaignsWithTemplate = await prisma.campaign.findMany({
    where: { templateId: { not: null } },
    select: { id: true, name: true, templateId: true },
  });
  console.log(`\n=== التقرير النهائي ===`);
  console.log(`[✓] القالب الافتراضي: ${defaultTemplate.name}`);
  console.log(`[✓] عدد المحاور في القالب: ${allPrimaries.length}`);
  console.log(`[✓] عدد الحملات المرتبطة: ${campaignsWithTemplate.length}`);
  console.log(`[✓] عدد الحملات بدون قالب: ${campaignsWithoutTemplate.length - Math.min(campaignsWithoutTemplate.length, campaignsWithoutTemplate.length)}`);

  const totalCampaigns = await prisma.campaign.count();
  console.log(`[✓] إجمالي الحملات في النظام: ${totalCampaigns}`);
}

main()
  .then(() => {
    console.log('\n=== اكتملت عملية البذر بنجاح ===');
    process.exit(0);
  })
  .catch((err) => {
    console.error('فشلت عملية البذر:', err);
    process.exit(1);
  });
