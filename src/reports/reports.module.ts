import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { ReportsExperimentalController } from './reports-experimental.controller';
import { ExperimentalPuppeteerPdfAdapter } from './experimental-puppeteer-pdf.adapter';
import { PageDocumentBridgeService } from './page-document-bridge.service';

@Module({
  providers: [
    ReportsService,
    ExperimentalPuppeteerPdfAdapter,
    PageDocumentBridgeService,
  ],
  controllers: [ReportsController, ReportsExperimentalController],
  exports: [ReportsService],
})
export class ReportsModule {}
