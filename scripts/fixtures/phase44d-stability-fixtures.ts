const BASE_SIGNATURES = {
  showMinisterSign: true,
  ministerTitle: 'اصادق اصوليا',
  ministerName: 'وزير الداخلية',
  ministerDate: '٢٠٢٦/  /  ',
  leaderRank: 'لواء',
  leaderName: 'رئيس اللجنة الاختباري',
  leaderRole: 'رئيس اللجنة',
  leaderDate: '٢٠٢٦/  /  ',
  memberRank: 'عميد',
  memberName: 'عضو اللجنة الاختباري',
  memberRole: 'عضو اللجنة',
  memberDate: '٢٠٢٦/  /  ',
};

const basePayload = (id: string, title: string): any => ({
  id,
  title,
  targetEntityName: 'جهة اختبارية',
  formationNumber: '٤٤د',
  startDate: '2026-06-01',
  startDateText: '١/٦/٢٠٢٦',
  assignmentText: 'تنفيذ اختبار ثبات المطابقة الدلالية.',
  assignmentReference: '٤٤د',
  assignmentDate: '2026-06-01',
  committeeMembers: [
    'اللواء الاختباري الأول رئيس اللجنة',
    'العميد الاختباري الثاني عضو اللجنة',
  ],
  purposeText: 'التحقق من ثبات ربط الشظايا بعناصر المستند الرسمي.',
  durationText: 'للفترة من ١/٦/٢٠٢٦ لغاية ٣٠/٦/٢٠٢٦.',
  positions: [],
  sections: [],
  recommendations: [],
  appendices: [],
  finalEvaluation: { statement: 'التقييم النهائي للاختبار مستقر.' },
  signatures: BASE_SIGNATURES,
  isEducation: true,
});

const manualNotes = (items: string[]): any => ({
  id: 'manual-notes',
  title: 'الملاحظات',
  visible: true,
  isManual: true,
  positivesList: items,
  negativesList: [],
  impedimentsList: [],
  obstaclesList: [],
});

const repeatedIdenticalText = (): any => {
  const payload = basePayload('stress-repeated-text', 'اختبار النص العربي المتكرر');
  const repeated = 'نص عربي متكرر يجب أن يحتفظ بهويته حسب الترتيب المحدد.';
  payload.sections = [{
    id: 'repeated-section',
    title: 'قسم التكرار',
    visible: true,
    isEmpty: false,
    subsections: [{
      id: 'repeated-subsection',
      title: 'فرع التكرار',
      visible: true,
      officerInfo: {
        rank: 'مقدم',
        fullName: 'ضابط الدمج الاختباري',
        positionName: 'فرع التكرار',
        statisticalNumber: '٤٤٤',
        education: 'بكالوريوس',
        joinedDate: '١/٦/٢٠٢٦',
        positionStatus: 'أصالة',
      },
      findings: Array.from({ length: 24 }, () => repeated),
    }],
  }, manualNotes(Array.from({ length: 12 }, () => repeated))];
  payload.appendices = [{
    id: 'merged-appendix',
    symbol: 'أ',
    visible: true,
    text: `${repeated}\n\n${repeated}\n\n${repeated}`,
  }];
  return payload;
};

const repeatedTableRows = (): any => {
  const payload = basePayload('stress-repeated-table', 'اختبار صفوف الجداول المتكررة');
  payload.positions = Array.from({ length: 12 }, (_, index) => ({
    positionName: 'منصب متكرر',
    rank: 'رائد',
    positionHolder: 'اسم متكرر',
    statisticalNumber: `٥${index % 2}`,
    joinedDate: '١/٦/٢٠٢٦',
    positionStatus: 'أصالة',
    education: 'بكالوريوس',
  }));
  const repeatedRow = { category: 'ضباط', nominal: 10, actual: 8, increase: 0, deficit: 2, percentage: '80' };
  payload.sections = [{
    id: 'table-section',
    title: 'قسم الجداول',
    visible: true,
    isEmpty: false,
    subsections: [{
      id: 'table-subsection',
      title: 'فرع الجدول التفصيلي',
      visible: true,
      findings: ['تم فحص الجدول التفصيلي.'],
      detailedTables: [{
        detailId: 'stress-table',
        title: 'جدول تفصيلي متكرر',
        entityName: 'جهة اختبارية',
        schema: [
          { key: 'category', label: 'الفئة', role: 'label' },
          { key: 'nominal', label: 'الملاك', role: 'nominal' },
          { key: 'actual', label: 'الموجود', role: 'actual' },
          { key: 'deficit', label: 'النقص', role: 'deficit' },
          { key: 'percentage', label: 'النسبة', role: 'percentage' },
        ],
        rows: Array.from({ length: 20 }, () => ({ ...repeatedRow })),
      }],
    }],
  }, manualNotes([])];
  return payload;
};

const longArabicParagraphs = (): any => {
  const payload = basePayload('stress-long-arabic', 'اختبار الفقرات العربية الطويلة');
  const sentence = 'تتناول هذه الفقرة العربية الطويلة تفاصيل العمل الإداري والفني والميداني مع المحافظة على تسلسل واضح للمعلومات وتكرار منضبط للمصطلحات. ';
  payload.sections = [{
    id: 'long-section',
    title: 'قسم الفقرات الطويلة',
    visible: true,
    isEmpty: false,
    narrativeText: sentence.repeat(12),
    subsections: [{
      id: 'long-subsection',
      title: 'فرع السرد المطول',
      visible: true,
      narrativeText: sentence.repeat(16),
      findings: Array.from({ length: 8 }, (_, index) => `${index + 1} ${sentence.repeat(8)}`),
    }],
  }, manualNotes([sentence.repeat(6)])];
  return payload;
};

const shortSparseSections = (): any => {
  const payload = basePayload('stress-short-sparse', 'اختبار التقرير القصير');
  payload.sections = [{
    id: 'sparse-section',
    title: 'قسم قصير',
    visible: true,
    isEmpty: false,
    subsections: [{
      id: 'sparse-subsection',
      title: 'فرع قصير',
      visible: true,
      findings: ['ملاحظة قصيرة.'],
    }],
  }, manualNotes([])];
  return payload;
};

const denseFindingsAndRecommendations = (): any => {
  const payload = basePayload('stress-dense-content', 'اختبار كثافة المكتشفات والتوصيات');
  payload.sections = [{
    id: 'dense-section',
    title: 'قسم الكثافة',
    visible: true,
    isEmpty: false,
    subsections: [{
      id: 'dense-subsection',
      title: 'فرع المكتشفات الكثيفة',
      visible: true,
      findings: Array.from({ length: 120 }, (_, index) => `المكتشف الاختباري المتسلسل رقم ${index + 1} ضمن القسم الكثيف.`),
    }],
  }, manualNotes(Array.from({ length: 30 }, (_, index) => `الملاحظة الرسمية الاختبارية رقم ${index + 1}.`))];
  payload.recommendations = [{
    id: 'dense-authority',
    authority: 'جهة التوصيات الكثيفة',
    visible: true,
    recs: Array.from({ length: 80 }, (_, index) => ({
      id: `dense-rec-${index + 1}`,
      text: `التوصية الاختبارية المتسلسلة رقم ${index + 1} الموجهة إلى الجهة نفسها.`,
      children: [],
    })),
  }];
  return payload;
};

export type Phase44DStabilityFixture = {
  id: string;
  label: string;
  coveredCases: string[];
  payload: any;
};

export const PHASE_44D_STABILITY_FIXTURES: Phase44DStabilityFixture[] = [
  {
    id: 'repeated-identical-text',
    label: 'Repeated identical text and merged DOM blocks',
    coveredCases: ['repeated identical text', 'merged DOM blocks'],
    payload: repeatedIdenticalText(),
  },
  {
    id: 'repeated-table-rows',
    label: 'Repeated summary and detailed table rows',
    coveredCases: ['repeated table rows'],
    payload: repeatedTableRows(),
  },
  {
    id: 'long-arabic-paragraphs',
    label: 'Long Arabic paragraphs',
    coveredCases: ['long Arabic paragraphs'],
    payload: longArabicParagraphs(),
  },
  {
    id: 'short-sparse-sections',
    label: 'Short sparse sections',
    coveredCases: ['short sparse sections'],
    payload: shortSparseSections(),
  },
  {
    id: 'dense-findings-recommendations',
    label: 'Many findings and recommendations',
    coveredCases: ['many findings under one subsection', 'many recommendations under one authority'],
    payload: denseFindingsAndRecommendations(),
  },
];
