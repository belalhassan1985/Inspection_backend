/**
 * report-fragments — تسطيح payload التقرير إلى Fragment[] (Single flattening logic, backend).
 *
 * هذا هو نظير buildFragments الخاص بمصمّم التقارير في الواجهة
 * (frontend/src/utils/reportFragments.ts). نُقل حرفياً بنفس الترتيب والمنطق،
 * مع تغيير وحيد: استيراد دوال الترقيم من نظير الواجهة الخلفي
 * (src/utils/reportNumbering) بدل نسخة الواجهة.
 *
 * مهم — هذا الملف لا يحتوي أي منطق أعمال:
 *   - لا يحسب finalEvaluation ولا observation ولا visibility.
 *   - يستهلك payload الجاهز القادم من ReportsService.getCampaignReportPayload فقط.
 * كل تلك الحسابات تبقى مصدرها الوحيد ReportsService (لا تُنسخ هنا).
 *
 * يبقى استخدامه محصوراً بالمسار التجريبي خلف EXPERIMENTAL_PAGE_DOCUMENT_PDF=true.
 */

import {
  getLevel1Number,
  getLevel2ArabicLetter,
  getLevel3Ordinal,
  getLevel4Number,
  getLevel5ArabicLetter,
  DEFAULT_FORMATTING_CONFIG,
} from '../utils/reportNumbering';

export type FragmentKind =
  | 'reportHeader'
  | 'reportTitle'
  | 'assignment'
  | 'committee'
  | 'purpose'
  | 'visitDate'
  | 'summaryTables'
  | 'sectionTitle'
  | 'subsectionTitle'
  | 'narrative'
  | 'inspectionDetailItem'
  | 'inspectionDetailsTitle'
  | 'detailedTables'
  | 'findingListTitle'
  | 'findingListItem'
  | 'manualFindingListTitle'
  | 'manualFindingListItem'
  | 'officialNotesTitle'
  | 'notesCategoryTitle'
  | 'noteItem'
  | 'recommendationsTitle'
  | 'recommendationAuthorityTitle'
  | 'recommendationItem'
  | 'appendicesTitle'
  | 'appendixTitle'
  | 'appendixParagraph'
  | 'vertical_spacer'
  | 'finalEvaluation'
  | 'signatures';

export type Fragment = {
  id: string;
  kind: FragmentKind;
  title: string;
  atomicity: 'atomic' | 'splittable';
  keepWithNext?: boolean;
  keepTogether?: boolean;
  data: any;
};

const LIST_TYPES = ['positives', 'negatives', 'impediments', 'obstacles'] as const;
type ListType = (typeof LIST_TYPES)[number];

const LIST_COLORS: Record<ListType, string> = {
  positives: '#1a5235',
  negatives: '#742a2a',
  impediments: '#7b341e',
  obstacles: '#5a3e2b',
};

const SEC_TITLES: Record<ListType, string> = {
  positives: 'الإيجابيات وعوامل القوة العامة:',
  negatives: 'السلبيات ونقاط التقصير العامة:',
  impediments: 'المعوقات العامة:',
  obstacles: 'المعاضل العامة:',
};

const SUB_TITLES: Record<ListType, string> = {
  positives: 'الإيجابيات وعوامل القوة المرصودة:',
  negatives: 'السلبيات ونقاط التقصير الإداري والتنظيمي:',
  impediments: 'المعوقات ونقص الدعم اللوجستي والبشري:',
  obstacles: 'المعاضل والمشاكل الهيكلية الحرجة (تتطلب تدخل المراجع):',
};

const MANUAL_TITLES: Record<ListType, string> = {
  positives: 'الإيجابيات ورصد كفاءة الأداء:',
  negatives: 'السلبيات ونقاط الضعف المرصودة:',
  impediments: 'المعوقات التي تواجه العمل:',
  obstacles: 'المعاضل التي واجهت الأداء الميداني:',
};

const OFFICIAL_NOTE_TITLES: Record<ListType, string> = {
  positives: 'الإيجابيات',
  negatives: 'السلبيات',
  impediments: 'المعوقات',
  obstacles: 'المعاضل',
};

const showFlag = (type: ListType): string =>
  `show${type.charAt(0).toUpperCase()}${type.slice(1)}`;

const hasItems = (list: unknown): list is any[] =>
  Array.isArray(list) && list.length > 0;

const splitAppendixParagraphs = (text: unknown): string[] => {
  if (typeof text !== 'string') return [''];
  const parts = text.split(/\r?\n\s*\r?\n/);
  return parts.length > 0 ? parts : [text];
};

const buildOfficerInfoItems = (officerInfo: any): string[] => {
  if (!officerInfo) return [];
  const items = [
    `الرتبة والاسم الكامل / ${officerInfo.rank} ${officerInfo.fullName}.`,
    `الرقم الإحصائي/ (${officerInfo.statisticalNumber}).`,
    `تاريخ استلام المنصب/ ${officerInfo.joinedDate} (${officerInfo.positionStatus}).`,
  ];
  if (officerInfo.education && officerInfo.education !== '—') {
    items.push(`التحصيل الدراسي/ ${officerInfo.education}.`);
  }
  return items;
};

export const buildFragments = (payload: any): Fragment[] => {
  if (!payload) return [];
  const fc = payload.formatting || DEFAULT_FORMATTING_CONFIG;
  const frags: Fragment[] = [];

  frags.push({
    id: 'frag-report-header',
    kind: 'reportHeader',
    title: 'رأس التقرير',
    atomicity: 'atomic',
    data: {
      startDateText: payload.startDateText,
      startDate: payload.startDate,
      formationNumber: payload.formationNumber,
    },
  });

  frags.push({
    id: 'frag-report-title',
    kind: 'reportTitle',
    title: 'عنوان التقرير',
    atomicity: 'atomic',
    keepWithNext: true,
    data: { title: payload.title || '' },
  });

  if (payload.assignmentText) {
    frags.push({
      id: 'frag-assignment',
      kind: 'assignment',
      title: 'التكليف',
      atomicity: 'atomic',
      data: { number: getLevel1Number(1, fc), assignmentText: payload.assignmentText },
    });
  }

  if (Array.isArray(payload.committeeMembers) && payload.committeeMembers.length > 0) {
    frags.push({
      id: 'frag-committee',
      kind: 'committee',
      title: 'التأليف',
      atomicity: 'atomic',
      data: { number: getLevel1Number(2, fc), committeeMembers: payload.committeeMembers },
    });
  }

  if (payload.purposeText) {
    frags.push({
      id: 'frag-purpose',
      kind: 'purpose',
      title: 'الغاية',
      atomicity: 'atomic',
      data: { number: getLevel1Number(3, fc), purposeText: payload.purposeText },
    });
  }

  if (payload.durationText) {
    frags.push({
      id: 'frag-visit-date',
      kind: 'visitDate',
      title: 'تاريخ التفتيش',
      atomicity: 'atomic',
      data: { number: getLevel1Number(4, fc), durationText: payload.durationText },
    });
  }

  if (Array.isArray(payload.positions)) {
    frags.push({
      id: 'frag-summary-tables',
      kind: 'summaryTables',
      title: 'جدول المدراء والآمرين وشاغلي المناصب الأساسية',
      atomicity: 'atomic',
      data: { number: getLevel1Number(5, fc), positions: payload.positions },
    });
  }

  frags.push({
    id: 'frag-inspection-details-title',
    kind: 'sectionTitle',
    title: 'تفاصيل التفتيش',
    atomicity: 'atomic',
    keepWithNext: true,
    data: { number: getLevel1Number(6, fc), title: 'تفاصيل التفتيش' },
  });

  let level2 = 1;
  const sections = Array.isArray(payload.sections) ? payload.sections : [];

  sections.forEach((sec: any, si: number) => {
    if (sec?.visible === false) return;
    if (sec?.isManual) return;

    const secNumber = sec.numbering || getLevel2ArabicLetter(level2++, fc);
    frags.push({
      id: `sec-${si}-title`,
      kind: 'sectionTitle',
      title: sec.title || 'قسم رئيسي',
      atomicity: 'atomic',
      keepWithNext: true,
      data: { number: secNumber, title: sec.title || '' },
    });

    if (sec.narrativeText) {
      frags.push({
        id: `sec-${si}-narrative`,
        kind: 'narrative',
        title: `سرد القسم: ${sec.title || ''}`,
        atomicity: 'atomic',
        data: { text: sec.narrativeText, variant: 'section', formattingConfig: fc },
      });
    }

    if (sec.isManual) {
      let manualCounter = 1;
      LIST_TYPES.forEach((type) => {
        const list = sec[`${type}List`];
        if (sec[showFlag(type)] && hasItems(list)) {
          frags.push({
            id: `sec-${si}-manual-${type}-title`,
            kind: 'manualFindingListTitle',
            title: MANUAL_TITLES[type],
            atomicity: 'atomic',
            keepWithNext: true,
            data: {
              number: getLevel2ArabicLetter(manualCounter++, fc),
              titleText: MANUAL_TITLES[type],
              color: LIST_COLORS[type],
              formattingConfig: fc,
            },
          });

          list.forEach((text: string, itemIdx: number) => {
            frags.push({
              id: `sec-${si}-manual-${type}-item-${itemIdx}`,
              kind: 'manualFindingListItem',
              title: MANUAL_TITLES[type],
              atomicity: 'atomic',
              data: {
                number: getLevel3Ordinal(itemIdx + 1, fc),
                text,
                color: LIST_COLORS[type],
                formattingConfig: fc,
              },
            });
          });
        }
      });
    } else {
      let secListCounter = 1;
      LIST_TYPES.forEach((type) => {
        const list = sec[`${type}List`];
        if (sec[showFlag(type)] && hasItems(list)) {
          frags.push({
            id: `sec-${si}-list-${type}-title`,
            kind: 'findingListTitle',
            title: SEC_TITLES[type],
            atomicity: 'atomic',
            keepWithNext: true,
            data: {
              number: getLevel4Number(secListCounter++, fc),
              titleText: SEC_TITLES[type],
              color: LIST_COLORS[type],
              fontSize: '13.5px',
              formattingConfig: fc,
            },
          });

          list.forEach((text: string, itemIdx: number) => {
            frags.push({
              id: `sec-${si}-list-${type}-item-${itemIdx}`,
              kind: 'findingListItem',
              title: SEC_TITLES[type],
              atomicity: 'atomic',
              data: {
                number: getLevel5ArabicLetter(itemIdx + 1, fc),
                text,
                color: LIST_COLORS[type],
                fontSize: '13.5px',
                formattingConfig: fc,
              },
            });
          });
        }
      });

      const subs = Array.isArray(sec.subsections) ? sec.subsections : [];
      subs.forEach((sub: any, sj: number) => {
        if (sub?.visible === false) return;

        const subNumber = sub.numbering || getLevel3Ordinal(sj + 1, fc);
        frags.push({
          id: `sec-${si}-sub-${sj}-title`,
          kind: 'subsectionTitle',
          title: sub.title || 'قسم فرعي',
          atomicity: 'atomic',
          keepWithNext: true,
          data: { number: subNumber, title: sub.title || '' },
        });

        const officerItems = buildOfficerInfoItems(sub.officerInfo);
        officerItems.forEach((text, itemIdx) => {
          frags.push({
            id: `sec-${si}-sub-${sj}-officer-${itemIdx}`,
            kind: 'inspectionDetailItem',
            title: `تفاصيل: ${sub.title || ''}`,
            atomicity: 'atomic',
            data: { number: itemIdx + 1, text, formattingConfig: fc },
          });
        });

        const baseIdx = sub.officerInfo
          ? (sub.officerInfo.education && sub.officerInfo.education !== '—' ? 4 : 3)
          : 0;

        if (hasItems(sub.findings)) {
          sub.findings.forEach((text: string, itemIdx: number) => {
            frags.push({
              id: `sec-${si}-sub-${sj}-finding-${itemIdx}`,
              kind: 'inspectionDetailItem',
              title: `مكتشفات: ${sub.title || ''}`,
              atomicity: 'atomic',
              data: { number: baseIdx + itemIdx + 1, text, formattingConfig: fc },
            });
          });
        }

        if (sub.narrativeText) {
          frags.push({
            id: `sec-${si}-sub-${sj}-narrative`,
            kind: 'narrative',
            title: `سرد فرعي: ${sub.title || ''}`,
            atomicity: 'atomic',
            data: { text: sub.narrativeText, variant: 'subsection', formattingConfig: fc },
          });
        }

        let subListCounter = 1;
        if (sub.showDetails) {
          const detailsNumber = getLevel4Number(subListCounter++, fc);
          frags.push({
            id: `sec-${si}-sub-${sj}-details-title`,
            kind: 'inspectionDetailsTitle',
            title: 'الدرجات والملاحظات التفصيلية للبنود',
            atomicity: 'atomic',
            keepWithNext: true,
            data: {
              number: detailsNumber,
              titleText: 'الدرجات والملاحظات التفصيلية للبنود:',
              formattingConfig: fc,
            },
          });

          (Array.isArray(sub.detailsList) ? sub.detailsList : []).forEach((text: string, itemIdx: number) => {
            frags.push({
              id: `sec-${si}-sub-${sj}-details-${itemIdx}`,
              kind: 'inspectionDetailItem',
              title: 'ملاحظة تفصيلية',
              atomicity: 'atomic',
              data: { text, formattingConfig: fc, variant: 'detail' },
            });
          });
        }

        LIST_TYPES.forEach((type) => {
          const list = sub[`${type}List`];
          if (sub[showFlag(type)] && hasItems(list)) {
            const number = type === 'obstacles' ? undefined : getLevel4Number(subListCounter++, fc);
            frags.push({
              id: `sec-${si}-sub-${sj}-list-${type}-title`,
              kind: 'findingListTitle',
              title: SUB_TITLES[type],
              atomicity: 'atomic',
              keepWithNext: true,
              data: {
                number,
                titleText: SUB_TITLES[type],
                color: LIST_COLORS[type],
                fontSize: '13px',
                formattingConfig: fc,
              },
            });

            list.forEach((text: string, itemIdx: number) => {
              frags.push({
                id: `sec-${si}-sub-${sj}-list-${type}-item-${itemIdx}`,
                kind: 'findingListItem',
                title: SUB_TITLES[type],
                atomicity: 'atomic',
                data: {
                  number: getLevel5ArabicLetter(itemIdx + 1, fc),
                  text,
                  color: LIST_COLORS[type],
                  fontSize: '13px',
                  formattingConfig: fc,
                },
              });
            });
          }
        });

        if (hasItems(sub.detailedTables)) {
          frags.push({
            id: `sec-${si}-sub-${sj}-tables`,
            kind: 'detailedTables',
            title: `جداول تفصيلية: ${sub.title || ''}`,
            atomicity: 'atomic',
            data: { tables: sub.detailedTables, formattingConfig: fc },
          });
        }
      });
    }
  });

  const officialNotesSection = Array.isArray(payload.sections)
    ? payload.sections.find((sec: any) => sec?.id === 'manual-notes' || sec?.isManual)
    : null;

  frags.push({
    id: 'frag-official-notes-title',
    kind: 'officialNotesTitle',
    title: 'الملاحظات',
    atomicity: 'atomic',
    keepWithNext: true,
    data: { number: getLevel1Number(7, fc), formattingConfig: fc },
  });

  LIST_TYPES.forEach((type, idx) => {
    const list = officialNotesSection?.[`${type}List`] || [];
    frags.push({
      id: `frag-official-notes-${type}-title`,
      kind: 'notesCategoryTitle',
      title: OFFICIAL_NOTE_TITLES[type],
      atomicity: 'atomic',
      keepWithNext: true,
      data: {
        number: getLevel2ArabicLetter(idx + 1, fc),
        titleText: OFFICIAL_NOTE_TITLES[type],
        formattingConfig: fc,
      },
    });

    if (list.length > 0) {
      list.forEach((text: string, itemIdx: number) => {
        frags.push({
          id: `frag-official-notes-${type}-item-${itemIdx}`,
          kind: 'noteItem',
          title: OFFICIAL_NOTE_TITLES[type],
          atomicity: 'atomic',
          data: {
            number: getLevel3Ordinal(itemIdx + 1, fc),
            text,
            formattingConfig: fc,
          },
        });
      });
    } else {
      frags.push({
        id: `frag-official-notes-${type}-empty`,
        kind: 'noteItem',
        title: OFFICIAL_NOTE_TITLES[type],
        atomicity: 'atomic',
        data: {
          text: 'لا توجد ملاحظات ضمن هذا التصنيف.',
          isEmpty: true,
          formattingConfig: fc,
        },
      });
    }
  });

  const recommendations = Array.isArray(payload.recommendations) ? payload.recommendations : [];
  frags.push({
    id: 'frag-recommendations-title',
    kind: 'recommendationsTitle',
    title: 'التوصيات',
    atomicity: 'atomic',
    keepWithNext: true,
    data: { number: getLevel1Number(8, fc), formattingConfig: fc },
  });

  if (recommendations.length > 0) {
    recommendations.forEach((recGroup: any, grpIdx: number) => {
      if (!recGroup?.visible) return;

      frags.push({
        id: `frag-recommendations-group-${recGroup.id || grpIdx}-title`,
        kind: 'recommendationAuthorityTitle',
        title: recGroup.authority || 'جهة توصية',
        atomicity: 'atomic',
        keepWithNext: true,
        data: {
          number: getLevel2ArabicLetter(grpIdx + 1, fc),
          authority: recGroup.authority,
          formattingConfig: fc,
        },
      });

      if (Array.isArray(recGroup.recs) && recGroup.recs.length > 0) {
        recGroup.recs.forEach((rec: any, recIdx: number) => {
          frags.push({
            id: `frag-recommendations-group-${recGroup.id || grpIdx}-item-${rec.id || recIdx}`,
            kind: 'recommendationItem',
            title: recGroup.authority || 'توصية',
            atomicity: 'atomic',
            data: {
              number: getLevel3Ordinal(recIdx + 1, fc).replace('.', ':'),
              recommendation: rec,
              formattingConfig: fc,
            },
          });
        });
      } else {
        frags.push({
          id: `frag-recommendations-group-${recGroup.id || grpIdx}-empty`,
          kind: 'recommendationItem',
          title: recGroup.authority || 'توصية',
          atomicity: 'atomic',
          data: {
            isEmpty: true,
            text: 'لا توجد توصيات مدخلة تحت هذه الجهة.',
            formattingConfig: fc,
          },
        });
      }
    });
  } else {
    frags.push({
      id: 'frag-recommendations-empty',
      kind: 'recommendationItem',
      title: 'التوصيات',
      atomicity: 'atomic',
      data: {
        isSectionEmpty: true,
        text: 'لا توجد توصيات مدخلة.',
        formattingConfig: fc,
      },
    });
  }

  const appendices = Array.isArray(payload.appendices) ? payload.appendices : [];
  if (appendices.some((appendix: any) => appendix?.visible)) {
    frags.push({
      id: 'frag-appendices-title',
      kind: 'appendicesTitle',
      title: 'الملاحق',
      atomicity: 'atomic',
      keepWithNext: true,
      data: { number: getLevel1Number(9, fc), formattingConfig: fc },
    });

    appendices.forEach((appendix: any, appendixIdx: number) => {
      if (!appendix?.visible) return;

      frags.push({
        id: `frag-appendix-${appendix.id || appendixIdx}-title`,
        kind: 'appendixTitle',
        title: `ملحق (${appendix.symbol})`,
        atomicity: 'atomic',
        keepWithNext: true,
        data: {
          number: getLevel2ArabicLetter(appendixIdx + 1, fc),
          symbol: appendix.symbol,
          formattingConfig: fc,
        },
      });

      splitAppendixParagraphs(appendix.text).forEach((paragraph: string, paragraphIdx: number) => {
        frags.push({
          id: `frag-appendix-${appendix.id || appendixIdx}-paragraph-${paragraphIdx}`,
          kind: 'appendixParagraph',
          title: `نص ملحق (${appendix.symbol})`,
          atomicity: 'atomic',
          data: {
            text: paragraph,
            formattingConfig: fc,
          },
        });
      });
    });
  }

  frags.push({
    id: 'frag-final-evaluation',
    kind: 'finalEvaluation',
    title: 'التقييم النهائي',
    atomicity: 'atomic',
    data: {
      number: getLevel1Number(10, fc),
      finalEvaluation: payload.finalEvaluation,
      formattingConfig: fc,
    },
  });

  if (payload.signatures) {
    frags.push({
      id: 'frag-signatures',
      kind: 'signatures',
      title: 'التوقيعات',
      atomicity: 'atomic',
      keepTogether: true,
      data: { signatures: payload.signatures },
    });
  }

  return frags;
};
