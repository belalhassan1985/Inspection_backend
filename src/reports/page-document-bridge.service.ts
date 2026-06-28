import { Injectable } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { buildFragments } from './report-fragments';
import type { ExperimentalPageDocumentModel } from './experimental-page-document-renderer';

/**
 * PageDocumentBridgeService — الجسر الإنتاجي (تجريبي فقط، خلف Feature Flag).
 *
 *   campaignId
 *     → ReportsService.getCampaignReportPayload   (كل منطق الأعمال: finalEvaluation/observation/visibility)
 *     → buildFragments                            (تسطيح عرضي بحت، بلا منطق أعمال)
 *     → PageDocument (ExperimentalPageDocumentModel)
 *
 * هذا الجسر لا يكرّر أي حساب: حسابات finalEvaluation و observation و visibility
 * تبقى مصدرها الوحيد getCampaignReportPayload ولا تُعاد هنا.
 *
 * ملاحظة نطاق Phase 7X: التقطيع الحقيقي للصفحات (Pagination) يعتمد على قياس DOM في
 * الواجهة وهو خارج نطاق هذه المرحلة. لذلك يُنتج الجسر صفحة واحدة تحوي كل الـ fragments،
 * ويتكفّل Puppeteer بالتدفّق. تحسين أمانة الترقيم متروك لمرحلة Pagination لاحقة.
 */
@Injectable()
export class PageDocumentBridgeService {
  constructor(private readonly reportsService: ReportsService) {}

  async buildPageDocumentFromCampaign(
    campaignId: string,
  ): Promise<ExperimentalPageDocumentModel> {
    // إعادة استخدام مسار البيانات الرسمي كما هو (بلا تعديل وبلا نسخ منطق الأعمال).
    const payload = await this.reportsService.getCampaignReportPayload(campaignId);

    // تسطيح عرضي عبر نفس منطق مصمّم الواجهة (المنقول إلى report-fragments.ts).
    const fragments = buildFragments(payload);

    return {
      source: 'designer',
      layout: {
        pageSize: 'A4',
        widthMm: 210,
        heightMm: 297,
        marginsMm: { top: 20, right: 15, bottom: 20, left: 15 },
      },
      fragments,
      // صفحة واحدة تحوي كل الـ fragments (لا Pagination في هذه المرحلة).
      pages: [{ pageNumber: 1, fragments }],
    };
  }
}
