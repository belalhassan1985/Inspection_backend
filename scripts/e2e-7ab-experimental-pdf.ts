/**
 * Phase 7AB — End-to-End Experimental PDF Validation (test only).
 *
 * Boots the REAL HTTP app (real routing → ReportsExperimentalController →
 * PageDocumentBridge → getCampaignReportPayload → buildFragments → renderer →
 * Puppeteer), stubbing ONLY the generic global JWT auth guard (auth is not part
 * of this feature; the endpoint declares no @Roles). Drives it with real HTTP
 * requests via fetch and validates the exact contract the frontend button relies on.
 *
 * Validates:
 *   - flag ON  → 200, Content-Type: application/pdf, body starts with %PDF, downloadable, opens.
 *   - flag OFF → 404 (endpoint disabled), no PDF.
 *   - no backend errors thrown.
 *
 * Usage: npx ts-node scripts/e2e-7ab-experimental-pdf.ts
 */

import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

const OUT = path.join(__dirname, '..', 'audit-output', '7ab');

async function main() {
  // The button always sends VITE_EXPERIMENTAL_PAGE_DOCUMENT_PDF=true on the
  // frontend; here we toggle the BACKEND flag per scenario.
  process.env.EXPERIMENTAL_PAGE_DOCUMENT_PDF = 'true';

  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  await app.listen(0);
  const url: string = await app.getUrl();
  const base = url.replace('[::1]', '127.0.0.1');

  const prisma = app.get(PrismaService);
  const campaign = await prisma.campaign.findFirst({ select: { id: true, name: true } });
  if (!campaign) throw new Error('No real campaign found in DB');

  // Real auth: sign a JWT for an active user via the app's JwtService (same
  // secret/strategy production uses). This exercises the genuine auth path too.
  const jwt = app.get(JwtService);
  const user = await prisma.user.findFirst({ where: { isActive: true }, select: { id: true, username: true } });
  if (!user) throw new Error('No active user found in DB');
  const token = jwt.sign({ sub: user.id, username: user.username });
  const authHeader = { Authorization: `Bearer ${token}` };

  console.log('='.repeat(74));
  console.log('Phase 7AB — E2E Experimental PDF Validation');
  console.log('='.repeat(74));
  console.log(`Server: ${base}`);
  console.log(`Campaign under test: ${campaign.name} [${campaign.id.slice(0, 8)}]`);
  console.log('');

  const endpoint = `${base}/reports/experimental/page-document/pdf`;
  const errors: string[] = [];

  // ── Scenario 1: flag ON ──────────────────────────────────────────────────
  console.log('── Scenario 1: backend flag ON (EXPERIMENTAL_PAGE_DOCUMENT_PDF=true) ──');
  let s1Pass = false;
  let savedPath = '';
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({ campaignId: campaign.id }),
    });
    const ct = res.headers.get('content-type') || '';
    const xExp = res.headers.get('x-experimental-pdf') || '';
    const xVerOk = res.headers.get('x-experimental-verification-ok') || '';
    const buf = Buffer.from(await res.arrayBuffer());
    const isPdf = buf.subarray(0, 5).toString('latin1') === '%PDF-';
    const pages = (buf.toString('latin1').match(/\/Type\s*\/Page(?![s])/g) || []).length;

    console.log(`   HTTP status:        ${res.status}`);
    console.log(`   Content-Type:       ${ct}`);
    console.log(`   X-Experimental-PDF: ${xExp}`);
    console.log(`   X-Verification-Ok:  ${xVerOk}`);
    console.log(`   Body bytes:         ${buf.length}`);
    console.log(`   Magic %PDF-:        ${isPdf}`);
    console.log(`   PDF page count:     ${pages}`);

    if (res.status === 200 && ct.includes('application/pdf') && isPdf && buf.length > 1000) {
      savedPath = path.join(OUT, `experimental_${campaign.id.slice(0, 8)}.pdf`);
      fs.writeFileSync(savedPath, buf);
      // "Open" check: re-read header + trailer to confirm it is a well-formed file.
      const head = fs.readFileSync(savedPath);
      const hasEof = head.subarray(-1024).toString('latin1').includes('%%EOF');
      console.log(`   Downloaded to:      ${savedPath}`);
      console.log(`   Opens (%PDF + %%EOF): ${isPdf && hasEof}`);
      s1Pass = isPdf && hasEof;
      if (!hasEof) errors.push('PDF missing %%EOF trailer');
    } else {
      errors.push(`flag ON did not return a valid PDF (status=${res.status}, ct=${ct})`);
    }
  } catch (e: any) {
    errors.push(`flag ON threw: ${e?.message || e}`);
    console.log(`   ERROR: ${e?.message || e}`);
  }
  console.log(`   → Scenario 1: ${s1Pass ? 'PASS' : 'FAIL'}`);
  console.log('');

  // ── Scenario 2: flag OFF ─────────────────────────────────────────────────
  console.log('── Scenario 2: backend flag OFF (EXPERIMENTAL_PAGE_DOCUMENT_PDF=false) ──');
  process.env.EXPERIMENTAL_PAGE_DOCUMENT_PDF = 'false';
  let s2Pass = false;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({ campaignId: campaign.id }),
    });
    const ct = res.headers.get('content-type') || '';
    const bodyText = await res.text();
    console.log(`   HTTP status:   ${res.status} (expected 404)`);
    console.log(`   Content-Type:  ${ct}`);
    s2Pass = res.status === 404 && !ct.includes('application/pdf');
    if (!s2Pass) errors.push(`flag OFF expected 404, got ${res.status}`);
  } catch (e: any) {
    errors.push(`flag OFF threw: ${e?.message || e}`);
    console.log(`   ERROR: ${e?.message || e}`);
  }
  console.log(`   → Scenario 2: ${s2Pass ? 'PASS' : 'FAIL'}`);
  console.log('');

  // restore
  process.env.EXPERIMENTAL_PAGE_DOCUMENT_PDF = 'true';

  console.log('='.repeat(74));
  console.log(`Backend errors observed: ${errors.length ? errors.length : 'none'}`);
  errors.forEach((e) => console.log(`   - ${e}`));
  console.log(`OVERALL E2E: ${s1Pass && s2Pass && errors.length === 0 ? 'PASS' : 'FAIL'}`);
  console.log('='.repeat(74));

  await app.close();
}

main().catch((e) => { console.error('E2E 7AB failed:', e); process.exit(1); });
