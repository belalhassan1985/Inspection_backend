# Phase 44C Semantic Identity Mapping Report

Decision: **GO**

Total V1 fragments: 1618
Matched fragments: 1618
Unmatched fragments: 0
Ambiguous matches: 821
Shared DOM mappings: 867
Match coverage: 100%
Minimum campaign coverage: 100%
Deterministic repeated mapping: PASS

## Campaign Coverage

| Campaign | V1 fragments | DOM blocks | Matched | Unmatched | Ambiguous | Coverage |
|---|---:|---:|---:|---:|---:|---:|
| المجر | 12 | 81 | 12 | 0 | 1 | 100% |
| لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب | 891 | 2154 | 891 | 0 | 480 | 100% |
| لجنة تفتيش المنطقة الامنية الثالثة /داقوق | 715 | 1659 | 715 | 0 | 340 | 100% |

## Coverage by Kind

| Kind | Total | Matched | Unmatched | Ambiguous | Coverage |
|---|---:|---:|---:|---:|---:|
| assignment | 3 | 3 | 0 | 0 | 100% |
| committee | 3 | 3 | 0 | 3 | 100% |
| finalEvaluation | 3 | 3 | 0 | 0 | 100% |
| findingGroupTitle | 32 | 32 | 0 | 0 | 100% |
| findingItem | 602 | 602 | 0 | 4 | 100% |
| noteCategoryTitle | 8 | 8 | 0 | 8 | 100% |
| noteItem | 600 | 600 | 0 | 600 | 100% |
| officialNotesTitle | 2 | 2 | 0 | 0 | 100% |
| purpose | 3 | 3 | 0 | 0 | 100% |
| recommendationGroupTitle | 5 | 5 | 0 | 5 | 100% |
| recommendationItem | 12 | 12 | 0 | 12 | 100% |
| recommendationsTitle | 3 | 3 | 0 | 0 | 100% |
| reportHeader | 3 | 3 | 0 | 0 | 100% |
| reportTitle | 3 | 3 | 0 | 0 | 100% |
| sectionTitle | 7 | 7 | 0 | 4 | 100% |
| signatures | 3 | 3 | 0 | 0 | 100% |
| subsectionTitle | 32 | 32 | 0 | 32 | 100% |
| tableHeader | 21 | 21 | 0 | 16 | 100% |
| tableRow | 249 | 249 | 0 | 126 | 100% |
| tableTitle | 21 | 21 | 0 | 11 | 100% |
| visitDate | 3 | 3 | 0 | 0 | 100% |

## Successful Examples

- reportHeader `report:header` -> DOM 2 via exact-text (1): جمهورية العراق وزارة الداخلية هيئة تفتيش قوى الامن الداخلي
- reportTitle `report:title` -> DOM 6 via exact-text (1): تقرير تفتيش المنطقة الأمنية (المجر) لقيادة شرطة محافظة (قيادة شرطة محافظة ميسان)
- assignment `introduction:assignment` -> DOM 8 via exact-text (1): بناء
- committee `introduction:committee` -> DOM 12 via normalized-arabic-text (0.98): اللواء المفتش حسام جميل عباس رئيـس اللجنة
- purpose `introduction:purpose` -> DOM 28 via exact-text (1): الغاية
- visitDate `introduction:visit-date` -> DOM 30 via exact-text (1): للفترة مـــــــــــــن تـــــــــــــــــاريخ ١٨‏/٦‏/٢٠٢٦ لغـــــــــــــــــــاية ١٠‏/١٠‏/٢٠٢٦.
- tableHeader `table:summary:header` -> DOM 34 via kind-specific (0.96): ت المنصب الرتبة الاسم الكامل الرقم الإحصائي تاريخ إشغال المنصب نوع الإشغال التحصيل الدراسي
- recommendationsTitle `recommendations:title` -> DOM 58 via kind-specific (0.98): ٨. التوصيات
- signatures `signatures` -> DOM 62 via kind-specific (0.97): اصادق اصوليا وزيـــــــر الداخلية ٢٠٢٦/ / اللواء المفتش حسام جميل عباس رئيس اللجنة ٢٠٢٦/ / الفريق ال
- reportHeader `report:header` -> DOM 2 via exact-text (1): جمهورية العراق وزارة الداخلية هيئة تفتيش قوى الامن الداخلي

## Failed Examples

- None.

## Limitations

- Multiple V1 fragments may intentionally share one official DOM block when the renderer merges content.
- A match proves semantic identity only. It does not prove printed-page placement.
- Parent-anchor matches identify structural fragments that have no independent official DOM box.
- Ambiguous repeated text is resolved by deterministic order, but remains reported as ambiguous.
- No pagination boundaries were estimated or reconstructed.

## Recommendation for Phase 44D

Proceed with a shadow-only stability audit of this semantic map across repeated renders and targeted difficult fixtures. Do not reconstruct pagination yet.
