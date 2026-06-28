const { PrismaClient } = require('@prisma/client');
const XLSX = require('xlsx');

const prisma = new PrismaClient();

// ---------- Arabic name normalization (same as backend name-utils) ----------
const RANK_PREFIXES = [
  'اللواء المفتش', 'اللواءالمفتش', 'اللواء', 'الفريق', 'العقيد', 'المقدم',
  'العميد المفتش', 'العميد', 'الرائد', 'النقيب', 'الملازم', 'السيد',
].sort((a, b) => b.length - a.length);

const ARABIC_MAP = { 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ى': 'ي', 'ة': 'ه' };

function normalizeName(raw) {
  let s = raw.trim().replace(/\s+/g, ' ').replace(/["""']/g, '');
  return s.split('').map(c => ARABIC_MAP[c] || c).join('');
}

function extractRankAndName(raw) {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  for (const prefix of RANK_PREFIXES) {
    if (trimmed.startsWith(prefix)) {
      return { rankGuess: prefix, restName: trimmed.substring(prefix.length).trim() };
    }
  }
  return { rankGuess: null, restName: trimmed };
}

async function seed() {
  console.log('Reading Excel...');
  const wb = XLSX.readFile('../data/inspectors_groups_extracted.xlsx', { defVal: '' });
  const sheet = wb.Sheets['كل_المفتشين'];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  const headers = rows[0];
  const data = rows.slice(1).filter(r => r[4] && r[4].toString().trim()); // skip empty full_name

  console.log(`Loaded ${data.length} inspectors from Excel`);

  // Step 1: Create all unique groups
  const groupNames = [...new Set(data.map(r => r[0]?.toString().trim()).filter(Boolean))];
  console.log(`Creating ${groupNames.length} groups...`);

  const groupMap = {}; // name -> id

  for (const name of groupNames) {
    const code = name.match(/[\d]+/) ? name.match(/[\d]+/)[0] : null;
    const existing = await prisma.inspectionGroup.findFirst({ where: { name } });
    if (existing) {
      groupMap[name] = existing.id;
      console.log(`  Group exists: ${name.substring(0, 40)}... (id=${existing.id})`);
    } else {
      const g = await prisma.inspectionGroup.create({
        data: { name, code: code ? `GRP-${code}` : null, isActive: true },
      });
      groupMap[name] = g.id;
      console.log(`  Created group: ${name.substring(0, 40)}... (id=${g.id})`);
    }
  }

  // Step 2: Process each inspector
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let membershipCreated = 0;
  let membershipSkipped = 0;

  for (const row of data) {
    const groupName = row[0]?.toString().trim();
    const groupCodes = row[1]?.toString().trim();
    const displayOrder = parseInt(row[2]) || null;
    const rankName = row[3]?.toString().trim();
    const fullName = row[4]?.toString().trim();
    const assignmentNote = row[5]?.toString().trim();
    const department = row[7]?.toString().trim() || groupName;
    const phone = row[8]?.toString().trim();
    const notes = row[9]?.toString().trim();
    const isActive = row[10] === true || row[10] === 'true';

    if (!fullName || !groupName) continue;

    const normalized = normalizeName(fullName);
    const { rankGuess } = extractRankAndName(fullName);
    const groupId = groupMap[groupName];
    if (!groupId) {
      console.log(`  WARN: No group ID for ${groupName}`);
      continue;
    }

    // Find existing inspector by normalized name match
    const allInspectors = await prisma.inspector.findMany({ select: { id: true, fullName: true, rank: true, phone: true, notes: true, department: true } });
    let match = null;
    for (const insp of allInspectors) {
      const inspNorm = normalizeName(insp.fullName);
      if (inspNorm === normalized) {
        match = insp;
        break;
      }
    }

    let inspectorId;
    if (match) {
      // Update missing fields only
      inspectorId = match.id;
      const updateData = {};
      if (!match.rank && rankGuess) updateData.rank = rankGuess;
      if (!match.phone && phone) updateData.phone = phone;
      if (!match.department && department) updateData.department = department;
      if (!match.notes && notes) updateData.notes = notes;
      if (Object.keys(updateData).length > 0) {
        await prisma.inspector.update({ where: { id: match.id }, data: updateData });
        updated++;
      } else {
        skipped++;
      }
    } else {
      // Create new inspector
      const insp = await prisma.inspector.create({
        data: {
          fullName,
          rank: rankGuess || null,
          department: department || null,
          phone: phone || null,
          notes: notes || null,
          isActive,
        },
      });
      inspectorId = insp.id;
      created++;
    }

    // Create group membership
    const existingMembership = await prisma.inspectorGroupMember.findUnique({
      where: { inspectorId_groupId: { inspectorId, groupId } },
    });
    if (!existingMembership) {
      await prisma.inspectorGroupMember.create({
        data: {
          inspectorId,
          groupId,
          roleInGroup: rankGuess || null,
          isLeader: displayOrder === 1,
          memberOrder: displayOrder,
          sourceRawName: fullName,
        },
      });
      membershipCreated++;
    } else {
      membershipSkipped++;
    }
  }

  console.log('\n=== SEED RESULTS ===');
  console.log(`Inspectors created: ${created}`);
  console.log(`Inspectors updated: ${updated}`);
  console.log(`Inspectors skipped (no changes): ${skipped}`);
  console.log(`Memberships created: ${membershipCreated}`);
  console.log(`Memberships skipped (already exist): ${membershipSkipped}`);
  console.log(`Total groups: ${groupNames.length}`);

  await prisma.$disconnect();
}

seed().catch(err => {
  console.error('Seed failed:', err);
  prisma.$disconnect();
  process.exit(1);
});
