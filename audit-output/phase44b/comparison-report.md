# Phase 44B DOM Measurement Comparison

Campaigns measured: 3
Semantic DOM measurements: 888
Height to actual PDF page-count correlation: 0.9997
Stable layouts: PASS
Fonts and images ready: PASS
A4 PDFs: PASS

## Results

| Campaign | V1 fragments | Semantic DOM blocks | DOM height mm | Actual PDF pages | DOM mm / actual page |
|---|---:|---:|---:|---:|---:|
| المجر | 12 | 43 | 486.3 | 2 | 243.15 |
| لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب | 891 | 470 | 7532.16 | 32 | 235.38 |
| لجنة تفتيش المنطقة الامنية الثالثة /داقوق | 715 | 375 | 6049.43 | 25 | 241.98 |

## Accuracy Observations

- Every measurement and PDF came from the same Puppeteer page and exact official HTML string.
- Bounding boxes are actual Chromium DOM geometry after fonts, images, and layout stabilization; page.pdf then invokes Chromium print layout.
- The comparison uses actual PDF page counts. It does not estimate or assign page breaks.
- Across the measured distributions, DOM height versus actual PDF page count correlation is 0.9997.

## Identified Limitations

- Official HTML has no ReportDocumentV1 fragment IDs, so measured semantic blocks cannot yet be mapped one-to-one to every V1 fragment.
- Some official containers merge multiple V1 fragments; tables also create nested and overlapping semantic boxes.
- DOM coordinates represent continuous layout. Chromium does not expose the final print-fragment page assignment through getBoundingClientRect().
- PDF page count validates aggregate correlation only; it does not identify the first and last fragment on each page.
- A future phase needs stable semantic identity mapping and a PDF page-position oracle before reconstructing pagination.

## Decision

GO for a shadow identity-mapping experiment. NO-GO for pagination reconstruction from DOM measurements alone.
