# Phase 44E Shadow Pagination Reconstruction Research

Decision: **NO-GO**

Campaigns tested: 3
Repeated runs per campaign: 3
All page-count deltas within 1: FAIL
All campaigns at least 95% confidently assigned: FAIL
Repeated runs deterministic: PASS

## Campaign Results

| Campaign | PDF pages | Reconstructed pages | Delta | Fragments | Confident | Confident % | Crossing | Shared DOM | Ambiguous page | Print-risk |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| المجر | 2 | 2 | 0 | 12 | 12 | 100% | 0 | 0 | 0 | 3 |
| لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب | 32 | 30 | -2 | 891 | 445 | 49.94% | 446 | 480 | 446 | 556 |
| لجنة تفتيش المنطقة الامنية الثالثة /داقوق | 25 | 24 | -1 | 715 | 357 | 49.93% | 358 | 387 | 358 | 438 |

## Accuracy Observations

- DOM geometry and semantic mapping were collected before PDF generation from the same Puppeteer page.
- Estimated pages use A4 printable height and observed positions only; no calibrated fragment capacities are used.
- Existing manual page-break positions start new measured segments.
- PDF page count is actual output truth, but per-fragment PDF page positions remain unobserved.

## Failure Examples

- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: tableTitle `table:summary:title`, estimated 1-3, confidence 0.393; Mapped DOM block crosses an estimated A4 content boundary. Chromium may fragment or repeat table structures during printing.
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: tableHeader `table:summary:header`, estimated 1-2, confidence 0.41; Mapped DOM block crosses an estimated A4 content boundary. Chromium may fragment or repeat table structures during printing.
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: tableRow `table:summary:row:col-1782555166386-0.5012366359543339`, estimated 2-3, confidence 0.423; Mapped DOM block crosses an estimated A4 content boundary. Chromium may fragment or repeat table structures during printing.
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: sectionTitle `section:pri-5:title`, estimated 3-18, confidence 0.344; Mapped DOM block crosses an estimated A4 content boundary. Multiple V1 fragments share this DOM block. Semantic mapping had multiple deterministic candidates. CSS keep/break behavior may move the grouped heading during printing.
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: subsectionTitle `subsection:sec-21:title`, estimated 3-18, confidence 0.344; Mapped DOM block crosses an estimated A4 content boundary. Multiple V1 fragments share this DOM block. Semantic mapping had multiple deterministic candidates. CSS keep/break behavior may move the grouped heading during printing.
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: tableRow `subsection:sec-21:officer:rank`, estimated 3-18, confidence 0.362; Mapped DOM block crosses an estimated A4 content boundary. Multiple V1 fragments share this DOM block. Semantic mapping had multiple deterministic candidates. Chromium may fragment or repeat table structures during printing.
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: tableRow `subsection:sec-21:officer:fullName`, estimated 3-18, confidence 0.362; Mapped DOM block crosses an estimated A4 content boundary. Multiple V1 fragments share this DOM block. Semantic mapping had multiple deterministic candidates. Chromium may fragment or repeat table structures during printing.
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: tableRow `subsection:sec-21:officer:statisticalNumber`, estimated 3-18, confidence 0.362; Mapped DOM block crosses an estimated A4 content boundary. Multiple V1 fragments share this DOM block. Semantic mapping had multiple deterministic candidates. Chromium may fragment or repeat table structures during printing.
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: tableRow `subsection:sec-21:officer:joinedDate`, estimated 3-18, confidence 0.362; Mapped DOM block crosses an estimated A4 content boundary. Multiple V1 fragments share this DOM block. Semantic mapping had multiple deterministic candidates. Chromium may fragment or repeat table structures during printing.
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: tableRow `subsection:sec-21:officer:positionName`, estimated 3-18, confidence 0.362; Mapped DOM block crosses an estimated A4 content boundary. Multiple V1 fragments share this DOM block. Semantic mapping had multiple deterministic candidates. Chromium may fragment or repeat table structures during printing.
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: tableRow `subsection:sec-21:officer:education`, estimated 3-18, confidence 0.362; Mapped DOM block crosses an estimated A4 content boundary. Multiple V1 fragments share this DOM block. Semantic mapping had multiple deterministic candidates. Chromium may fragment or repeat table structures during printing.
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: findingGroupTitle `subsection:sec-21:findings:general:title`, estimated 3-18, confidence 0.345; Mapped DOM block crosses an estimated A4 content boundary. Multiple V1 fragments share this DOM block. CSS keep/break behavior may move the grouped heading during printing.
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: subsectionTitle `subsection:sec-25:title`, estimated 4-5, confidence 0.344; Mapped DOM block crosses an estimated A4 content boundary. Multiple V1 fragments share this DOM block. Semantic mapping had multiple deterministic candidates. CSS keep/break behavior may move the grouped heading during printing.
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: tableRow `subsection:sec-25:officer:rank`, estimated 4-5, confidence 0.362; Mapped DOM block crosses an estimated A4 content boundary. Multiple V1 fragments share this DOM block. Semantic mapping had multiple deterministic candidates. Chromium may fragment or repeat table structures during printing.
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: tableRow `subsection:sec-25:officer:fullName`, estimated 4-5, confidence 0.362; Mapped DOM block crosses an estimated A4 content boundary. Multiple V1 fragments share this DOM block. Semantic mapping had multiple deterministic candidates. Chromium may fragment or repeat table structures during printing.
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: tableRow `subsection:sec-25:officer:statisticalNumber`, estimated 4-5, confidence 0.345; Mapped DOM block crosses an estimated A4 content boundary. Multiple V1 fragments share this DOM block. Chromium may fragment or repeat table structures during printing.
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: tableRow `subsection:sec-25:officer:joinedDate`, estimated 4-5, confidence 0.362; Mapped DOM block crosses an estimated A4 content boundary. Multiple V1 fragments share this DOM block. Semantic mapping had multiple deterministic candidates. Chromium may fragment or repeat table structures during printing.
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: tableRow `subsection:sec-25:officer:positionName`, estimated 4-5, confidence 0.362; Mapped DOM block crosses an estimated A4 content boundary. Multiple V1 fragments share this DOM block. Semantic mapping had multiple deterministic candidates. Chromium may fragment or repeat table structures during printing.
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: findingGroupTitle `subsection:sec-25:findings:general:title`, estimated 4-5, confidence 0.345; Mapped DOM block crosses an estimated A4 content boundary. Multiple V1 fragments share this DOM block. CSS keep/break behavior may move the grouped heading during printing.
- لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب: subsectionTitle `subsection:sec-26:title`, estimated 5-6, confidence 0.344; Mapped DOM block crosses an estimated A4 content boundary. Multiple V1 fragments share this DOM block. Semantic mapping had multiple deterministic candidates. CSS keep/break behavior may move the grouped heading during printing.

## Explicit Limitations

- getBoundingClientRect() exposes continuous DOM geometry, not Chromium print fragmentation.
- Blocks crossing estimated boundaries cannot be assigned to one page confidently.
- Shared DOM mappings are reported even when all linked fragments receive the same estimated page.
- Table rows, table headers, and grouped headings remain print-fragmentation risks.
- Matching reconstructed page count does not prove every fragment is on the same page in the PDF.

## Recommendation for Phase 44F

NO-GO for using DOM-only assignments. Phase 44F should research a PDF page-position oracle or another way to observe Chromium print fragmentation, without production integration.
