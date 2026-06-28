# ReportDocumentV1 Shadow Builder

This Phase 40B code is isolated from the production report pipeline. It is not registered in `ReportsModule`, exposed by an endpoint, imported by `ReportsService`, or consumed by PDF, Word, Designer, Prisma, or database code.

`ReportDocumentV1Builder` accepts the payload shape returned by the existing `ReportsService.getCampaignReportPayload` source. `runReportDocumentV1Shadow` is disabled by default because it reads the `REPORT_DOCUMENT_V1_BUILD` contract flag, whose default remains `false`.

The optional reference input is intended for development-only comparisons with the legacy fragment builder. A manual caller may explicitly pass `enabled: true` for a one-off shadow report without changing application configuration or production behavior.
