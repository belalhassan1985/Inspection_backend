# Phase 44D Semantic Mapping Stability Audit

Decision: **GO**

Subjects: 8 (3 real campaigns, 5 synthetic fixtures)
Repeated renders per subject: 5
Total renders: 40
Total fragments: 2043
Stable mappings: 2043
Unstable mappings: 0
Overall stability: 100%
Minimum mapping coverage: 100%
Repeated renders deterministic: PASS

## Stability by Subject

| Subject | Source | Fragments | Stable | Unstable | Stability | Minimum coverage |
|---|---|---:|---:|---:|---:|---:|
| المجر | real-campaign | 12 | 12 | 0 | 100% | 100% |
| لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب | real-campaign | 891 | 891 | 0 | 100% | 100% |
| لجنة تفتيش المنطقة الامنية الثالثة /داقوق | real-campaign | 715 | 715 | 0 | 100% | 100% |
| Repeated identical text and merged DOM blocks | synthetic-fixture | 67 | 67 | 0 | 100% | 100% |
| Repeated summary and detailed table rows | synthetic-fixture | 55 | 55 | 0 | 100% | 100% |
| Long Arabic paragraphs | synthetic-fixture | 31 | 31 | 0 | 100% | 100% |
| Short sparse sections | synthetic-fixture | 21 | 21 | 0 | 100% | 100% |
| Many findings and recommendations | synthetic-fixture | 251 | 251 | 0 | 100% | 100% |

## Stability by Fragment Kind

| Kind | Total | Stable | Unstable | Stability |
|---|---:|---:|---:|---:|
| appendicesTitle | 1 | 1 | 0 | 100% |
| appendixParagraph | 3 | 3 | 0 | 100% |
| appendixTitle | 1 | 1 | 0 | 100% |
| assignment | 8 | 8 | 0 | 100% |
| committee | 8 | 8 | 0 | 100% |
| finalEvaluation | 8 | 8 | 0 | 100% |
| findingGroupTitle | 37 | 37 | 0 | 100% |
| findingItem | 756 | 756 | 0 | 100% |
| noteCategoryTitle | 28 | 28 | 0 | 100% |
| noteItem | 643 | 643 | 0 | 100% |
| officialNotesTitle | 7 | 7 | 0 | 100% |
| purpose | 8 | 8 | 0 | 100% |
| recommendationGroupTitle | 6 | 6 | 0 | 100% |
| recommendationItem | 92 | 92 | 0 | 100% |
| recommendationsTitle | 8 | 8 | 0 | 100% |
| reportHeader | 8 | 8 | 0 | 100% |
| reportTitle | 8 | 8 | 0 | 100% |
| sectionNarrative | 1 | 1 | 0 | 100% |
| sectionTitle | 17 | 17 | 0 | 100% |
| signatures | 8 | 8 | 0 | 100% |
| subsectionNarrative | 1 | 1 | 0 | 100% |
| subsectionTitle | 37 | 37 | 0 | 100% |
| tableHeader | 27 | 27 | 0 | 100% |
| tableRow | 287 | 287 | 0 | 100% |
| tableTitle | 27 | 27 | 0 | 100% |
| visitDate | 8 | 8 | 0 | 100% |

## Top Instability Causes

- None.

## Stable Examples

- reportHeader `report:header` -> DOM 2 via exact-text
- reportTitle `report:title` -> DOM 6 via exact-text
- assignment `introduction:assignment` -> DOM 8 via exact-text
- committee `introduction:committee` -> DOM 12 via normalized-arabic-text
- purpose `introduction:purpose` -> DOM 28 via exact-text
- visitDate `introduction:visit-date` -> DOM 30 via exact-text
- tableTitle `table:summary:title` -> DOM 33 via kind-specific
- tableHeader `table:summary:header` -> DOM 34 via kind-specific
- sectionTitle `inspection-details:title` -> DOM 45 via ordered-nearest
- recommendationsTitle `recommendations:title` -> DOM 58 via kind-specific

## Unstable Examples

- None.

## Stress Cases Covered

- repeated identical text: Repeated identical text and merged DOM blocks
- merged DOM blocks: Repeated identical text and merged DOM blocks
- repeated table rows: Repeated summary and detailed table rows
- long Arabic paragraphs: Long Arabic paragraphs
- short sparse sections: Short sparse sections
- many findings under one subsection: Many findings and recommendations
- many recommendations under one authority: Many findings and recommendations

## Recommendation

GO for the next shadow research phase. Ambiguous and shared mappings were stable across repeated renders. Pagination reconstruction remains explicitly out of scope.
