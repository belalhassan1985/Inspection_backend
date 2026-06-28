# ReportDocumentV1 Contracts

Phase 40A adds contract and registry skeletons only. Nothing in this directory is imported by the current Designer, export bridge, PDF renderer, Word exporter, API endpoints, Prisma, or database code.

The legacy report pipeline remains the only official production path. Every feature flag declared here is disabled by default, including the legacy fallback definition requested for the future rollout.

The project does not currently have a shared TypeScript workspace package. This directory is therefore mirrored temporarily at `frontend/src/contracts/report-document-v1`. Both copies must remain contract-identical until a shared package is introduced in a separately approved phase.
