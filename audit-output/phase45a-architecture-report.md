# Phase 45A — Official Print Review Architecture

## 1. Product Vision

### 1.1 The User

An inspection officer preparing an official report for submission to هيئة تفتيش قوى الأمن الداخلي senior leadership.

### 1.2 The Requirement

Before signing off, the officer must **verify every page** of the final document exactly as it will be produced. This means confirming:

- Where every page **starts**
- Where every page **ends**
- Whether a section **moved to the next page**
- Whether a table **split correctly across pages**
- Whether signatures **remain on the final page**
- Whether page breaks occur at **expected positions**

Approximate pagination (calibration models, DOM-only reconstruction, PDF-text oracle) has proven insufficient. The only reliable source of truth is the **official PDF rendering pipeline itself**.

### 1.3 The Workflow

```
┌─────────────────────────────────────────────────────────────────────┐
│                     OFFICIAL PRINT REVIEW WORKFLOW                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐     ┌──────────────────┐     ┌──────────────┐     │
│  │              │     │                  │     │              │     │
│  │   DESIGNER   │────>│  OFFICIAL PRINT  │────>│   OFFICIAL   │     │
│  │              │     │     REVIEW       │     │     PDF      │     │
│  │  Editing     │     │                  │     │              │     │
│  │  Workspace   │<────│  Verification    │     │  Final       │     │
│  │              │     │  Workspace       │     │  Export      │     │
│  │              │     │                  │     │              │     │
│  └──────────────┘     └──────────────────┘     └──────────────┘     │
│         │                      │                      │             │
│         │  Edits content       │  Reviews pages        │  Downloads │
│         │  Adjusts layout      │  Confirms or          │  signed    │
│         │  Adds overrides      │  returns to editing   │  PDF       │
│         │                      │                      │             │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.4 Three Roles, One Pipeline

| Stage | Role | Action | Rendering |
|-------|------|--------|-----------|
| Designer | Editing workspace | Modify content, layout, style | CSS-based A4 canvas simulation |
| Official Print Review | Verification workspace | Inspect page starts/ends, confirm | **Official PDF pipeline** |
| Official PDF | Final document | Download for signing | Official PDF pipeline |

**Critical rule**: Designer may use approximate rendering (CSS canvas).  
**Official Print Review must use the exact same rendering engine as Official PDF.**

There must never be two rendering engines for the review+export path.

## 2. Current Pipeline (Official PDF)

```
Client                          Backend
  │                                │
  │  GET /reports/campaign/:id/pdf │
  │───────────────────────────────>│
  │                                │
  │        1. getCampaignReportPayload(id)
  │           └─ Prisma queries → payload object
  │                                │
  │        2. generateHtmlFromPayload(payload)
  │           └─ ~1000-line HTML builder
  │              └─ Single monolithic HTML string
  │                                │
  │        3. puppeteer.launch()
  │           └─ new browser instance
  │           └─ page.setContent(html)
  │           └─ page.pdf({ format: A4, margins, header/footer })
  │                                │
  │        4. return Buffer (in-memory)
  │                                │
  │  Content-Disposition: attachment │
  │  ← PDF binary stream           │
  │                                │
```

**Key characteristics:**
- No browser pooling (new Chrome per request)
- HTML is monolithic (`generateHtmlFromPayload`)
- PDF served as attachment (download), never inline
- Designer overrides arrive via `POST /reports/campaign/:id/pdf` with modified body payload
- Override bridge runs client-side (`officialExportOverrideBridge.ts`)

## 3. Proposed Architecture — Official Print Review

### 3.1 Principle

The Official Print Review is **not a PDF viewer**.  
It is a **verification workspace** that uses the official PDF rendering pipeline to produce a review artifact, then presents page-by-page information to the officer for inspection and confirmation.

### 3.2 High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          DESIGNER (Browser)                             │
│                                                                         │
│  ┌───────────────────────────────────────────┐                          │
│  │  Editing Surface                          │                          │
│  │  - Text edits    - Style changes          │                          │
│  │  - Spacers       - Page breaks            │                          │
│  │  - Reordering    - Visibility             │                          │
│  └──────────────┬────────────────────────────┘                          │
│                 │ officialExportOverrideBridge.ts                        │
│                 ▼                                                        │
│  ┌───────────────────────────────────────────┐                          │
│  │  Modified Payload                          │                          │
│  │  { title, sections, formatting, ... }      │                          │
│  └──────────────┬────────────────────────────┘                          │
│                 │                                                       │
│         "Review" button                        "Export" button          │
│                 │                                                       │
│                 ▼                                                       │
│  ┌───────────────────────────────────────────┐                          │
│  │  Official Print Review (modal)            │                          │
│  │                                           │                          │
│  │  ┌─────────────────────────────────────┐  │                          │
│  │  │  Page 14 of 28                      │  │  Page-by-page review    │
│  │  │                                     │  │  using artifact from    │
│  │  │  Page starts with:                  │  │  official pipeline      │
│  │  │    "التوصيات"                       │  │                          │
│  │  │                                     │  │  Artifact types:         │
│  │  │  (rendered page content)            │  │  - PDF (embedded)        │
│  │  │                                     │  │  - Page images (PNG)     │
│  │  │  Page ends with:                    │  │  - HTML fragments        │
│  │  │    "...المالية"                     │  │                          │
│  │  │                                     │  │                          │
│  │  │  [◀ Prev]  14 / 28  [Next ▶]       │  │                          │
│  │  └─────────────────────────────────────┘  │                          │
│  │                                           │                          │
│  │  [✗ Section N split across pages 10-11]  │  Warnings                 │
│  │  [✓ Signatures on final page]             │                          │
│  │                                           │                          │
│  │  [Return to Editing]    [✓ Confirm & Export]│                       │
│  └───────────────────────────────────────────┘                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Review Artifact Options

| Option | Off the shelf | Pixel-perfect | Page-text extraction | Performance |
|--------|:-------------:|:-------------:|:--------------------:|:-----------:|
| **A. PDF (inline)** | ✓ PDF.js / iframe | ✓ Same `page.pdf()` | ✓ `pdf-text` extraction | Medium |
| **B. Page images (PNG)** | — screenshot lib | ✓ Same `page.screenshot()` | ✗ OCR needed | Slow |
| **C. HTML fragments** | — custom build | ✗ Different rendering | ✓ Built-in text | Fast |
| **D. PDF + metadata blob** | ✓ Both above | ✓ Same `page.pdf()` | ✓ Pipeline output | Medium |

**Recommendation: Option D — PDF + Metadata Blob**

Generate the PDF via the official pipeline, then extract page-boundary metadata as a companion blob (JSON). The frontend renders the PDF in an embedded viewer and overlays the metadata (page-start/end text, structural warnings).

The metadata extraction is a **new pipeline stage** that runs after PDF generation, not a separate rendering. It parses the PDF text layer (already embedded by Puppeteer) and maps text to page boundaries.

### 3.4 Override Compatibility

The review endpoint accepts the **same payload body** as `POST /reports/campaign/:campaignId/pdf`. This means the existing `officialExportOverrideBridge.ts` — which produces the Designer-modified payload — works **without any changes**.

```
officialExportOverrideBridge.ts
  │
  ├── payload → POST /reports/campaign/:id/review   (review)
  │                    ↓
  │              PDF + metadata blob
  │
  └── payload → POST /reports/campaign/:id/pdf       (export)
                       ↓
                 Official PDF (attachment)
```

**Zero bridge changes required.**

### 3.5 Session-Safe Review Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        OFFICIAL PRINT REVIEW LIFECYCLE                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  STAGE 1: DESIGNER (Editing)                                     │   │
│  │                                                                  │   │
│  │  User opens campaign → loads Designer                           │   │
│  │  User edits text, styles, spacing, breaks                        │   │
│  │  Override bridge builds modified payload in background           │   │
│  │  Canvas shows approximate A4 layout (CSS simulation)            │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│                            User clicks "Review"                         │
│                                    │                                     │
│                                    ▼                                    │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  STAGE 2: OFFICIAL PRINT REVIEW (Verification)                   │   │
│  │                                                                  │   │
│  │  Payload → POST /reports/campaign/:id/review                    │   │
│  │  Backend:                                                        │   │
│  │    1. generateHtmlFromPayload(payload)  ← same as official      │   │
│  │    2. puppeteerPool.use() → page.pdf()  ← same as official     │   │
│  │    3. Extract page-boundary metadata from PDF                   │   │
│  │    4. Return: { pdf: Buffer, metadata: { pages: [...] } }       │   │
│  │                                                                  │   │
│  │  Frontend:                                                       │   │
│  │    1. Render PDF in embedded viewer                              │   │
│  │    2. Overlay page-start/end text on each page                  │   │
│  │    3. Show warnings: table splits, orphaned lines, etc.         │   │
│  │    4. User navigates pages (Previous/Next)                      │   │
│  │                                                                  │   │
│  │  User actions:                                                   │   │
│  │    • "Return to Editing" → back to Stage 1                      │   │
│  │    • "Regenerate Review" → refresh from current edits           │   │
│  │    • "Confirm & Export" → proceed to Stage 3                    │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│           │                    │                    │                    │
│           ▼                    ▼                    ▼                    │
│     Return to Edit      Regenerate Review     Confirm & Export          │
│           │                    │                    │                    │
│           ▼                    ▼                    ▼                    │
│     ┌──────────┐        ┌──────────┐        ┌──────────────┐           │
│     │ Stage 1  │        │ Stage 2  │        │  Stage 3     │           │
│     │ Designer │        │ Review   │        │  Official    │           │
│     │ (editing)│        │ (refresh)│        │  Export      │           │
│     └──────────┘        └──────────┘        └──────┬───────┘           │
│                                                     │                   │
│                                                     ▼                   │
│                                          ┌────────────────────────┐    │
│                                          │  POST /:id/pdf          │    │
│                                          │  Same payload           │    │
│                                          │  Same rendering         │    │
│                                          │  → attachment download  │    │
│                                          └────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.6 Key Safety Guarantees

| Stage | Rendering | Guarantee |
|-------|-----------|-----------|
| Designer (Edit) | CSS canvas (A4PageCanvas) | Fast iteration, approximate layout |
| Official Print Review | `generateHtmlFromPayload` + `page.pdf()` | **Pixel-identical to Official PDF** |
| Official Export | `generateHtmlFromPayload` + `page.pdf()` | Same code path as Review |

**The Review and Export paths are byte-for-byte identical** (modulo PDF timestamp metadata). If the officer confirms in Review, the Export will produce the exact same document.

## 4. Required Code Changes

### 4.1 New Files (Shadow POC — Phase 45B)

| File | Purpose | Notes |
|------|---------|-------|
| `backend/scripts/phase45b-review-poc.ts` | CLI proof-of-concept | Standalone script, not production code |
| `backend/src/reports/review.service.ts` | Review orchestration | New production service (Phase 45C) |
| `backend/src/reports/review-cache.service.ts` | Review artifact cache | In-memory, keyed by payload hash |

### 4.2 Minimal Modifications to Existing Files

| File | Change | Risk |
|------|--------|------|
| `reports.controller.ts` | Add `POST /campaign/:campaignId/review` | Low — new endpoint, doesn't touch existing ones |
| `reports.service.ts` | Extract browser launch into PuppeteerPoolService (Phase 45C) | Medium — refactors existing Puppeteer usage. Shadow POC can launch its own browser without modifying the service. |
| `reports.module.ts` | Add `ReviewService` + `ReviewCacheService` to providers | Low |

### 4.3 Frontend Changes (Phase 45C+)

| File | Change |
|------|--------|
| New: `frontend/src/components/designer/OfficialPrintReview.tsx` | Review workflow modal |
| New: `frontend/src/hooks/useOfficialPrintReview.ts` | Review request + cache logic |
| New: `frontend/src/components/designer/PageStartEndOverlay.tsx` | Metadata overlay on PDF viewer |
| Modify: `frontend/src/components/designer/DesignerToolbar.tsx` | Add "Review" button (between edit and export) |

### 4.4 Zero Changes

- `officialExportOverrideBridge.ts` — **unchanged**, same payload flows to review and export
- `generateHtmlFromPayload()` — **untouched**, shared by all paths
- `getCampaignReportPayload()` — **untouched**
- Database schema — **unchanged**
- Feature flags — **none added**
- Word export — **unchanged**
- PagePlanV1 — **unchanged**

## 5. Data Flow Diagram

```
┌─────────────────┐    ┌──────────────────┐    ┌────────────────────┐
│  Database        │    │  ReportsService   │    │  ReportsController │
│  (PostgreSQL)    │    │                   │    │                    │
│                  │    │  getCampaign       │    │  GET  /:id/pdf     │
│  campaign        │───>│  ReportPayload()   │    │  POST /:id/pdf     │
│  sections        │    │         │          │    │  → existing        │
│  findings        │    │         ▼          │    │                    │
│  ...             │    │  generateHtmlFrom  │    │  POST /:id/review  │
└─────────────────┘    │  Payload(payload)   │    │  → NEW             │
                       │         │          │    └─────────┬──────────┘
                       │         │          │              │
                       │         ▼          │              │
                       │  ┌──────────────┐  │              │
                       │  │  HTML String  │  │              │
                       │  └──────┬───────┘  │              │
                       │         │          │              │
                       │         ▼          │              │
                       │  ┌──────────────┐  │              │
                       │  │  Puppeteer    │  │              │
                       │  │  page.pdf()   │  │              │
                       │  │  (A4, margins)│  │              │
                       │  └──────┬───────┘  │              │
                       │         │          │              │
                       │         ▼          │              │
                       │  ┌──────────────┐  │              │
                       │  │  PDF Buffer   │  │              │
                       │  └──────┬───────┘  │              │
                       │         │          │              │
                       └─────────┼──────────┘              │
                                 │                         │
                    ┌────────────┴─────────────┐           │
                    │                          │           │
                    ▼                          ▼           │
            ┌──────────────┐          ┌──────────────┐    │
            │  REVIEW       │          │  EXPORT       │    │
            │               │          │               │    │
            │  POST /review │          │  POST /pdf    │    │
            │               │          │               │    │
            │  1. PDF       │          │  1. PDF       │    │
            │  2. Metadata  │          │  2. attachment│    │
            │     extract   │          │               │    │
            │  3. Return    │          │  3. Download  │    │
            │     {pdf,meta}│          │               │    │
            │               │          │               │    │
            │  + caching    │          │  (unchanged)  │    │
            │  + pool       │          │               │    │
            └───────┬───────┘          └───────┬───────┘    │
                    │                          │            │
                    ▼                          ▼            │
            ┌──────────────┐          ┌──────────────┐    │
            │  Review       │          │  Browser      │    │
            │  Workspace    │          │  Download     │    │
            │  (modal)      │          │               │    │
            │               │          │               │    │
            │  Page X of Y  │          │               │    │
            │  Start/end    │          │               │    │
            │  Warnings     │          │               │    │
            │  Confirm btn  │          │               │    │
            └──────────────┘          └──────────────┘    │
```

## 6. Review Metadata Specification

The review endpoint returns a PDF + a metadata JSON blob describing page boundaries:

```typescript
// POST /reports/campaign/:id/review
// Response (multipart or JSON with base64 PDF):

interface ReviewResponse {
  pdf: Buffer;                    // The generated PDF (same as export)
  metadata: {
    pageCount: number;
    generationTimeMs: number;
    pages: ReviewPage[];
    warnings: ReviewWarning[];
  };
}

interface ReviewPage {
  pageNumber: number;
  startsWith: string;             // First ~100 chars of page text
  endsWith: string;               // Last ~100 chars of page text
  containsSections: string[];     // Section IDs on this page
  hasTableSplit: boolean;         // Whether a table continues from prev page
  isOrphanStart: boolean;         // Section starts with <3 lines at page bottom
}

interface ReviewWarning {
  type: 'table-split' | 'orphan-section-start' | 'signature-not-final' | 'section-across-3plus-pages';
  page: number;
  message: string;
}
```

**Metadata extraction method**: Parse the PDF's text content layer (already embedded by Puppeteer's `page.pdf()`). Each page's text is extracted using a PDF text parser (e.g., `pdf-parse` or custom `/Page` → `/Contents` stream parsing). No second render pass needed.

## 7. Performance Considerations

### 7.1 Puppeteer Cold Start

| Operation | Time (25-page report) | Notes |
|-----------|----------------------|-------|
| Browser launch | 800–1200ms | New Chromium process |
| HTML generation | 200–500ms | `generateHtmlFromPayload` string building |
| Page setContent | 500–1500ms | DOM parsing, font loading, layout |
| PDF rendering | 1000–3000ms | Puppeteer page.pdf() |
| Metadata extraction | 200–500ms | PDF text parse |
| **Total (cold)** | **2700–6700ms** | Without pooling |
| **Total (warm pool)** | **1900–5500ms** | With pooled browser |

### 7.2 Pool Sizing

| Configuration | Memory | Concurrent Requests | Recommended |
|---------------|--------|-------------------|-------------|
| 1 browser, 2 pages | ~200MB | 2 | Dev/staging |
| 2 browsers, 4 pages | ~400MB | 4 | Production |
| 4 browsers, 8 pages | ~800MB | 8 | Overkill |

### 7.3 Caching

| Strategy | Hit Rate | Recommended |
|----------|----------|-------------|
| In-memory Map (TTL 5min) | Moderate | Yes — Phase 45B |
| Redis (TTL configurable) | High | Future |

Cache key: `sha256(JSON.stringify(payload))` — changes when any edit is made.

### 7.4 Large Report Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| 35-page PDF = 2-5MB | Slow load | Stream PDF; show loading skeleton |
| Puppeteer OOM | Server crash | Pool kill-switch at 500kB HTML size |
| Cache bloat from edits | Memory leak | TTL + max 100 cache entries |
| Concurrent review + export | Pool exhaustion | Queue/priority system |

## 8. Security Considerations

| Concern | Mitigation |
|---------|------------|
| Review PDF access | Require auth token (same as existing endpoints) |
| Payload injection | Same validation as `POST /:id/pdf` — already sanitized |
| Cache poisoning | Cache keyed by payload hash. TLS protects transport. |
| Chrome sandbox | `--no-sandbox` already in use (existing, not new) |
| Font loading | Google Fonts CSS import — same as existing PDF |

## 9. UX Proposal — Official Print Review Screen

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Designer                                                    [Export]  │
│                                              [Review]  ▼  [▼]          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Report Content (editing canvas)                                │   │
│  │                                                                  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │  Official Print Review                                     [X]     │ │
│  │  ┌─────────────────────────────────────────────────────────────┐   │ │
│  │  │  ┌──────────────────────────────────────────────────────┐   │   │ │
│  │  │  │  Page 14 of 28                                      │   │   │ │
│  │  │  │                                                      │   │   │ │
│  │  │  │  (PDF rendered content)                              │   │   │ │
│  │  │  │                                                      │   │   │ │
│  │  │  │                                                      │   │   │ │
│  │  │  └──────────────────────────────────────────────────────┘   │   │ │
│  │  │                                                              │   │ │
│  │  │  ┌──────────────────────────────────────────────────────┐   │   │ │
│  │  │  │  Page starts with: "التوصيات"                        │   │   │ │
│  │  │  │  Page ends with:   "...المالية"                      │   │   │ │
│  │  │  │                                                      │   │   │ │
│  │  │  │  Sections on this page: التوصيات > وزارة المالية     │   │   │ │
│  │  │  │                                                      │   │   │ │
│  │  │  │  ⚠ Table "جداول المؤشرات" split across pages 13-14  │   │   │ │
│  │  │  │                                                      │   │   │ │
│  │  │  │  [◀ Prev]          14 / 28          [Next ▶]        │   │   │ │
│  │  │  └──────────────────────────────────────────────────────┘   │   │ │
│  │  └─────────────────────────────────────────────────────────────┘   │ │
│  │                                                                     │ │
│  │  [Return to Editing]              [✓ Confirm & Export]              │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

### 9.1 Review Screen Elements

| Element | Purpose |
|---------|---------|
| Page thumbnail / rendered content | Visual verification of layout |
| Page X of Y | Current position in document |
| Page starts with | First text on page (verify no content loss) |
| Page ends with | Last text on page (verify no truncation) |
| Sections on this page | Which sections appear (verify section continuity) |
| Warnings | Auto-detected issues (table splits, orphans) |
| Previous / Next | Navigate all pages |
| Return to Editing | Go back to Designer, keep edits |
| Confirm & Export | Approve and download official PDF |

### 9.2 Warning Types

| Warning | Condition | Severity |
|---------|-----------|----------|
| Table split across pages | Table rows span a page break | Info |
| Section starts at page bottom | <3 lines of section at page bottom | Warning |
| Section across 3+ pages | Section spans 3 or more pages | Info |
| Signatures not on final page | Signatures section is NOT on the last page | Critical |
| Orphaned heading | Section title at page bottom, content on next page | Warning |

## 10. Risks and Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| 1 | Review PDF differs from export PDF | Low | Critical | Same code path guarantees identity. Parity test in Phase 45B. |
| 2 | Puppeteer pool memory leak | Medium | High | Pool with max concurrency, auto-restart, memory monitoring. |
| 3 | Slow first review (cold start) | High | Medium | Show loading state. Pool pre-warms on server start. |
| 4 | Override bridge produces invalid payload | Low | High | Same validation as export. Same error handling. |
| 5 | Cached review shows stale content | Medium | Medium | Cache keyed by payload hash. TTL limits window. |
| 6 | PDF text extraction misses Arabic text | Medium | Medium | Puppeteer embeds text layer. Test with Arabic in Phase 45B. |
| 7 | Page boundary metadata is wrong | Medium | High | Phase 45B validates metadata against known page structure. |

## 11. Phase 45B — Shadow Proof-of-Concept Plan

### 11.1 Objective

Build a backend CLI script that demonstrates the complete Official Print Review pipeline end-to-end, using the **exact same code path** as the official PDF.

### 11.2 Script Specification

**File**: `backend/scripts/phase45b-review-poc.ts`

```
npx ts-node scripts/phase45b-review-poc.ts <campaignId> [--overrides overrides.json]
```

**Output**: `audit-output/phase45b/`

```
audit-output/phase45b/
├── review.pdf              # Generated PDF (same as official)
├── review-metadata.json    # Page-by-page metadata
│   ├── pageCount: 28
│   ├── pages: [
│   │   { pageNumber: 1, startsWith: "جمهورية العراق...", endsWith: "...المالية", hasTableSplit: false }
│   │   ...
│   │ ]
│   └── warnings: [
│       { type: 'table-split', page: 13, message: '...' }
│   ]
├── official.pdf            # Official PDF from GET /:id/pdf
├── comparison.json         # Byte-level comparison results
└── summary.md              # Human-readable report
```

### 11.3 Implementation Steps

1. **Accept campaign ID** and optional override JSON path
2. **Fetch payload** via `getCampaignReportPayload(campaignId)`
3. **Apply overrides** (if `--overrides` flag provided, merge from JSON file)
4. **Generate HTML** via `generateHtmlFromPayload(payload)` — **same as official**
5. **Launch Puppeteer** — same options as official (A4, margins, header/footer)
6. **Render PDF** via `page.pdf()` — same options
7. **Extract page metadata** — parse PDF text layer, build page-boundary info
8. **Identify warnings** — table splits, orphan sections, etc.
9. **Fetch official PDF** from running dev server at `GET /reports/campaign/:id/pdf`
10. **Compare** — byte-level comparison (excluding PDF timestamps)
11. **Write all outputs** to `audit-output/phase45b/`

### 11.4 Acceptance Criteria

| Criteria | Method |
|----------|--------|
| Review PDF matches official PDF byte-for-byte | sha256 (excluding PDF metadata timestamps) |
| Page count matches official PDF | Same count |
| Page-start text correctly extracted | Manually verify first/last ~100 chars per page |
| Warnings correctly detected | Cross-check with known table splits in fixture reports |
| Works with override payload | Pass Designer-style override JSON, verify differences reflected |
| Generation time < 5 seconds (warm) | `console.time` measurement |
| Zero production code changes | `git diff --stat` shows only the new script file |

### 11.5 Files Required for Phase 45B

| File | Why |
|------|-----|
| `reports.service.ts` lines 2597–2635 | `generateCampaignReportPdf` — the exact Puppeteer config to replicate |
| `reports.service.ts` lines 1444–2439 | `generateHtmlFromPayload` — the HTML generator |
| `reports.controller.ts` lines 69–109 | Existing PDF endpoints (reference for response format) |
| `officialExportOverrideBridge.ts` | Override payload structure (for `--overrides` flag) |
| Phase 44F oracle scripts | PDF text extraction patterns (reuse for metadata extraction) |

## 12. Recommendation

**Adopt the Official Print Review architecture and proceed with Phase 45B.**

The architecture is minimal-risk because:

1. **Review and Export share 100% rendering code** — pixel identity guaranteed
2. **Override bridge requires zero changes** — same payload flows to both
3. **No database, flag, or schema modifications**
4. **Phase 45B POC proves correctness before production code changes**
5. **The product vision is a workflow stage, not a viewer component** — correct framing for the user need

The new production code needed is:
1. `ReviewService` — orchestrates HTML → PDF → metadata
2. `ReviewCacheService` — in-memory cache for review artifacts
3. `POST /campaign/:id/review` endpoint
4. `OfficialPrintReview.tsx` — React review workflow component
5. Puppeteer pool (shared, benefits both review and export)
