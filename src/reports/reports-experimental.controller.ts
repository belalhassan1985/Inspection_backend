import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  NotFoundException,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { RolesGuard } from '../auth/roles.guard';
import {
  type ExperimentalPageDocumentModel,
  type ExperimentalPdfStyleOptions,
  renderExperimentalPageDocumentHtmlWithVerification,
} from './experimental-page-document-renderer';
import { ExperimentalPuppeteerPdfAdapter } from './experimental-puppeteer-pdf.adapter';
import { PageDocumentBridgeService } from './page-document-bridge.service';

type ExperimentalPdfRenderMode = 'strictPages' | 'flow';

type ExperimentalPdfRequest = {
  campaignId?: string;
  pageDocument?: ExperimentalPageDocumentModel;
  options?: {
    includeDiagnostics?: boolean;
    renderMode?: ExperimentalPdfRenderMode;
    pageNumbers?: boolean;
    returnHtmlPreview?: boolean;
    returnDiagnostics?: boolean;
    style?: ExperimentalPdfStyleOptions;
  };
};

const MAX_EXPERIMENTAL_REQUEST_BYTES = 5 * 1024 * 1024;

@ApiTags('Reports Engine - Experimental')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('reports/experimental')
export class ReportsExperimentalController {
  constructor(
    private readonly experimentalPdfAdapter: ExperimentalPuppeteerPdfAdapter,
    private readonly pageDocumentBridge: PageDocumentBridgeService,
  ) {}

  @Post('page-document/pdf')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Experimental PageDocumentModel PDF generation',
  })
  async createExperimentalPageDocumentPdf(
    @Body() body: ExperimentalPdfRequest,
    @Res() res: Response,
  ): Promise<void> {
    if (process.env.EXPERIMENTAL_PAGE_DOCUMENT_PDF !== 'true') {
      throw new NotFoundException('Experimental PDF endpoint is disabled');
    }

    this.validateRequestSize(body);

    // Production bridge (flag-gated, experimental path only): when a campaignId
    // is supplied without an explicit pageDocument, build the PageDocument from
    // the campaign via the official data pipeline (getCampaignReportPayload) +
    // buildFragments. The existing client-supplied pageDocument path is kept.
    let pageDocument = body?.pageDocument;
    if (
      !pageDocument &&
      typeof body?.campaignId === 'string' &&
      body.campaignId.trim()
    ) {
      pageDocument = await this.pageDocumentBridge.buildPageDocumentFromCampaign(
        body.campaignId.trim(),
      );
    }

    if (!pageDocument || typeof pageDocument !== 'object') {
      throw new BadRequestException('pageDocument or campaignId is required');
    }

    if (pageDocument.source !== 'designer') {
      throw new BadRequestException('pageDocument.source must be designer');
    }

    if (pageDocument.layout?.pageSize !== 'A4') {
      throw new BadRequestException('pageDocument.layout.pageSize must be A4');
    }

    if (!Array.isArray(pageDocument.pages) || pageDocument.pages.length === 0) {
      throw new BadRequestException('pageDocument.pages must be a non-empty array');
    }

    if (!Array.isArray(pageDocument.fragments)) {
      throw new BadRequestException('pageDocument.fragments must be an array');
    }

    const renderMode = body.options?.renderMode ?? 'strictPages';
    if (renderMode !== 'strictPages' && renderMode !== 'flow') {
      throw new BadRequestException('options.renderMode must be strictPages or flow');
    }

    const renderResult = renderExperimentalPageDocumentHtmlWithVerification(pageDocument, {
      includeDiagnostics: body.options?.includeDiagnostics,
      renderMode,
      pageNumbers: body.options?.pageNumbers,
      returnHtmlPreview: body.options?.returnHtmlPreview,
      returnDiagnostics: body.options?.returnDiagnostics,
      style: body.options?.style,
    });
    const { html, verification, fragmentMapping } = renderResult;

    if (body.options?.returnDiagnostics) {
      res.json({
        ok: true,
        experimental: true,
        diagnosticsOnly: true,
        renderMode,
        verification,
        fragmentMapping,
      });
      return;
    }

    const pdfBuffer = await this.experimentalPdfAdapter.renderPdfBufferFromHtml(html);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename=experimental_page_document.pdf',
      'Content-Length': pdfBuffer.length.toString(),
      'X-Experimental-PDF': 'true',
      'X-Experimental-Render-Mode': renderMode,
      'X-Experimental-Pages': pageDocument.pages.length.toString(),
      'X-Experimental-Fragments': pageDocument.fragments.length.toString(),
      'X-Experimental-HTML-Length': Buffer.byteLength(html, 'utf8').toString(),
      'X-Experimental-Verification-Ok': (
        verification.allPageFragmentsVisited &&
        verification.orderPreserved &&
        verification.documentFragmentsAccountedFor
      ).toString(),
      'X-Experimental-Verification-Pages': verification.pageCount.toString(),
      'X-Experimental-Verification-Document-Fragments':
        verification.documentFragmentCount.toString(),
      'X-Experimental-Verification-Page-Fragments':
        verification.pageFragmentCount.toString(),
      'X-Experimental-Verification-Visited-Fragments':
        verification.visitedFragmentCount.toString(),
      'X-Experimental-Verification-Order-Preserved':
        verification.orderPreserved.toString(),
      'X-Experimental-Verification-Missing-Fragments':
        verification.missingFragmentCount.toString(),
      'X-Experimental-Fragment-Kinds-Count':
        fragmentMapping.kinds.length.toString(),
      'X-Experimental-Fragment-Supported-Kinds-Count':
        fragmentMapping.supportedKinds.length.toString(),
      'X-Experimental-Fragment-Unsupported-Kinds-Count':
        fragmentMapping.unsupportedKinds.length.toString(),
      'X-Experimental-Fragments-Without-Kind':
        fragmentMapping.fragmentsWithoutKind.toString(),
      'X-Experimental-Fragments-Without-Id':
        fragmentMapping.fragmentsWithoutId.toString(),
    });

    res.end(pdfBuffer);
  }

  private validateRequestSize(body: unknown): void {
    const requestBytes = Buffer.byteLength(JSON.stringify(body ?? {}), 'utf8');
    if (requestBytes > MAX_EXPERIMENTAL_REQUEST_BYTES) {
      throw new BadRequestException('Experimental PDF request is too large');
    }
  }
}
