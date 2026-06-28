# Phase 44F Shadow PDF Page-Position Oracle Research

Decision: **NO-GO**

Campaigns tested: 3
Total PDF renders: 9
Total fragments: 1618
Assigned fragments: 1264
Unassigned fragments: 354
Multi-page fragments: 19
Ambiguous fragments: 1569
Assignment coverage: 78.12%
Repeated runs deterministic: PASS
Table rows reliable: PASS
Finding items reliable: PASS

## Campaign Results

| Campaign | PDF pages | Fragments | Assigned | Unassigned | Multi-page | Ambiguous | Coverage | Deterministic |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| المجر | 2 | 12 | 9 | 3 | 0 | 4 | 75% | PASS |
| لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب | 32 | 891 | 547 | 344 | 13 | 879 | 61.39% | PASS |
| لجنة تفتيش المنطقة الامنية الثالثة /داقوق | 25 | 715 | 708 | 7 | 6 | 686 | 99.02% | PASS |

## Coverage by Kind

| Kind | Total | Assigned | Unassigned | Multi-page | Ambiguous | Coverage | Avg confidence |
|---|---:|---:|---:|---:|---:|---:|---:|
| assignment | 3 | 2 | 1 | 0 | 1 | 66.67% | 0.613 |
| committee | 3 | 3 | 0 | 0 | 1 | 100% | 0.953 |
| finalEvaluation | 3 | 1 | 2 | 0 | 2 | 33.33% | 0.287 |
| findingGroupTitle | 32 | 32 | 0 | 0 | 32 | 100% | 0.78 |
| findingItem | 602 | 602 | 0 | 10 | 601 | 100% | 0.828 |
| noteCategoryTitle | 8 | 4 | 4 | 0 | 5 | 50% | 0.45 |
| noteItem | 600 | 276 | 324 | 9 | 599 | 46% | 0.395 |
| officialNotesTitle | 2 | 1 | 1 | 0 | 2 | 50% | 0.43 |
| purpose | 3 | 3 | 0 | 0 | 2 | 100% | 0.887 |
| recommendationGroupTitle | 5 | 0 | 5 | 0 | 5 | 0% | 0 |
| recommendationItem | 12 | 1 | 11 | 0 | 11 | 8.33% | 0.068 |
| recommendationsTitle | 3 | 0 | 3 | 0 | 3 | 0% | 0 |
| reportHeader | 3 | 3 | 0 | 0 | 0 | 100% | 0.98 |
| reportTitle | 3 | 3 | 0 | 0 | 0 | 100% | 0.86 |
| sectionTitle | 7 | 7 | 0 | 0 | 2 | 100% | 0.911 |
| signatures | 3 | 3 | 0 | 0 | 0 | 100% | 0.98 |
| subsectionTitle | 32 | 32 | 0 | 0 | 23 | 100% | 0.872 |
| tableHeader | 21 | 21 | 0 | 0 | 19 | 100% | 0.858 |
| tableRow | 249 | 249 | 0 | 0 | 241 | 100% | 0.838 |
| tableTitle | 21 | 21 | 0 | 0 | 17 | 100% | 0.856 |
| visitDate | 3 | 0 | 3 | 0 | 3 | 0% | 0 |

## Successful Examples

- المجر: reportHeader `report:header` -> page 1 via exact-page-text (0.98)
- المجر: assignment `introduction:assignment` -> page 1 via exact-page-text (0.98)
- المجر: committee `introduction:committee` -> page 1 via exact-page-text (0.98)
- المجر: purpose `introduction:purpose` -> page 1 via ordered-occurrence (0.9)
- المجر: sectionTitle `inspection-details:title` -> page 2 via exact-page-text (0.98)
- المجر: signatures `signatures` -> page 2 via exact-page-text (0.98)
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: reportHeader `report:header` -> page 1 via exact-page-text (0.98)
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: committee `introduction:committee` -> page 1 via ordered-occurrence (0.9)
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: tableRow `table:summary:row:col-1782555751349-0.07015915466193112` -> page 2 via ordered-occurrence (0.9)
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: tableRow `table:summary:row:col-1782555751349-0.3515005388354995` -> page 2 via ordered-occurrence (0.9)
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: tableRow `table:summary:row:col-1782555751349-0.7369744724792096` -> page 2 via ordered-occurrence (0.9)
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: tableRow `table:summary:row:col-1782555751349-0.9289510290225638` -> page 2 via ordered-occurrence (0.9)
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: tableRow `table:summary:row:col-1782555751349-0.9458883568885468` -> page 2 via ordered-occurrence (0.9)
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: tableRow `table:summary:row:col-1782555751349-0.8666082332784348` -> page 2 via ordered-occurrence (0.9)
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: tableRow `table:summary:row:col-1782555751349-0.9257596447154592` -> page 2 via ordered-occurrence (0.9)

## Ambiguous or Failing Examples

- المجر: purpose `introduction:purpose` -> 1; The same normalized signature occurs more than once; ordered occurrence selected the primary page.
- المجر: visitDate `introduction:visit-date` -> unassigned; No deterministic text or semantic page anchor was found.
- المجر: recommendationsTitle `recommendations:title` -> unassigned; No deterministic text or semantic page anchor was found.
- المجر: finalEvaluation `final-evaluation` -> unassigned; No deterministic text or semantic page anchor was found.
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: assignment `introduction:assignment` -> unassigned; No deterministic text or semantic page anchor was found.
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: committee `introduction:committee` -> 1; The same normalized signature occurs more than once; ordered occurrence selected the primary page.
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: visitDate `introduction:visit-date` -> unassigned; No deterministic text or semantic page anchor was found.
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: tableHeader `table:summary:header` -> 2; Relaxed Arabic normalization matched multiple pages; order selected the primary page.
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: tableRow `table:summary:row:col-1782555751349-0.07015915466193112` -> 2; The same normalized signature occurs more than once; ordered occurrence selected the primary page.
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: tableRow `table:summary:row:col-1782555751349-0.3515005388354995` -> 2; The same normalized signature occurs more than once; ordered occurrence selected the primary page.
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: tableRow `table:summary:row:col-1782555751349-0.7369744724792096` -> 2; The same normalized signature occurs more than once; ordered occurrence selected the primary page.
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: tableRow `table:summary:row:col-1782555751349-0.9289510290225638` -> 2; The same normalized signature occurs more than once; ordered occurrence selected the primary page.
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: tableRow `table:summary:row:col-1782555751349-0.9458883568885468` -> 2; The same normalized signature occurs more than once; ordered occurrence selected the primary page.
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: tableRow `table:summary:row:col-1782555751349-0.8666082332784348` -> 2; The same normalized signature occurs more than once; ordered occurrence selected the primary page.
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: tableRow `table:summary:row:col-1782555751349-0.9257596447154592` -> 2; The same normalized signature occurs more than once; ordered occurrence selected the primary page.
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: tableRow `table:summary:row:col-1782555751349-0.5789001756753143` -> 2; The same normalized signature occurs more than once; ordered occurrence selected the primary page.
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: tableRow `table:summary:row:col-1782555751349-0.7475071882668445` -> 2; The same normalized signature occurs more than once; ordered occurrence selected the primary page.
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: tableRow `table:summary:row:col-1782555751349-0.3173479411412903` -> 2; The same normalized signature occurs more than once; ordered occurrence selected the primary page.
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: tableRow `table:summary:row:col-1782555751349-0.08210825705540725` -> 2; The same normalized signature occurs more than once; ordered occurrence selected the primary page.
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: tableRow `table:summary:row:col-1782555751349-0.10419253938883077` -> 2; The same normalized signature occurs more than once; ordered occurrence selected the primary page.

## Reliability Findings

- Text was extracted directly from each generated PDF page through content streams and embedded ToUnicode maps.
- No OCR, renderer markers, or production modifications were used.
- Repeated signatures are resolved with ordered occurrence counters and semantic page regions.
- Long fragments use first, middle, and final text anchors and may report multiple pages.
- Structural fragments without independent text may inherit a stable parent page at reduced confidence.

## Recommendation for Phase 44G

NO-GO for downstream page planning. Improve PDF text disambiguation for the failing fragment kinds without adding renderer markers or production dependencies.
