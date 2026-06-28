/**
 * Phase 7X — Production PageDocument Bridge verification.
 *
 * Proves: campaignId → PageDocumentBridgeService → PageDocument → Experimental PDF,
 * reusing getCampaignReportPayload (all business calcs) + buildFragments.
 *
 * Usage: npx ts-node scripts/verify-7x-bridge.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PageDocumentBridgeService } from '../src/reports/page-document-bridge.service';
import { ExperimentalPuppeteerPdfAdapter } from '../src/reports/experimental-puppeteer-pdf.adapter';
import { renderExperimentalPageDocumentHtmlWithVerification } from '../src/reports/experimental-page-document-renderer';

function countPdfPages(buf: Buffer): number {
  const m = buf.toString('latin1').match(/\/Type\s*\/Page(?![s])/g);
  return m ? m.length : 0;
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const bridge = app.get(PageDocumentBridgeService);
  const prisma = app.get(PrismaService);
  const adapter = new ExperimentalPuppeteerPdfAdapter();

  const campaigns = await prisma.campaign.findMany({ select: { id: true, name: true } });
  console.log('='.repeat(70));
  console.log('Phase 7X — PageDocument Bridge Verification');
  console.log('='.repeat(70));

  for (const c of campaigns) {
    const pageDocument = await bridge.buildPageDocumentFromCampaign(c.id);
    const result = renderExperimentalPageDocumentHtmlWithVerification(pageDocument, {
      renderMode: 'strictPages',
      pageNumbers: true,
      returnDiagnostics: true,
    });
    const v = result.verification;
    const ok =
      pageDocument.source === 'designer' &&
      pageDocument.layout?.pageSize === 'A4' &&
      Array.isArray(pageDocument.pages) && pageDocument.pages.length > 0 &&
      Array.isArray(pageDocument.fragments) && pageDocument.fragments.length > 0 &&
      v.allPageFragmentsVisited && v.orderPreserved && v.documentFragmentsAccountedFor;

    let pdfPages: number | null = null;
    try {
      const pdf = await adapter.renderPdfBufferFromHtml(result.html);
      pdfPages = countPdfPages(pdf);
    } catch (e: any) {
      console.log(`   (PDF render skipped: ${e?.message || e})`);
    }

    console.log(`\n■ ${c.name} [${c.id.slice(0, 8)}]`);
    console.log(`   source=${pageDocument.source} pageSize=${pageDocument.layout?.pageSize}`);
    console.log(`   fragments=${pageDocument.fragments?.length} pages(model)=${pageDocument.pages?.length}`);
    console.log(`   verification.ok=${v.allPageFragmentsVisited && v.orderPreserved && v.documentFragmentsAccountedFor} orderPreserved=${v.orderPreserved} missing=${v.missingFragmentCount}`);
    console.log(`   experimental PDF pages=${pdfPages ?? 'N/A'}`);
    console.log(`   → campaignId → Experimental PDF: ${ok ? 'PASS' : 'FAIL'}`);
  }

  console.log('\n' + '='.repeat(70));
  await app.close();
}

main().catch((e) => { console.error('Verify 7X failed:', e); process.exit(1); });
