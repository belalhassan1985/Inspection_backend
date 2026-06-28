import { Injectable } from '@nestjs/common';
import puppeteer from 'puppeteer';

@Injectable()
export class ExperimentalPuppeteerPdfAdapter {
  async renderPdfBufferFromHtml(html: string): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready.then(() => undefined));

      const totalPages = await page.evaluate(() => {
        const A4_HEIGHT_PX = 297 * 3.7795275591;
        const marginTopPx = 10 * 3.7795275591;
        const contentHeightPx = Math.max(document.body.scrollHeight, 1);
        const pageContentHeightPx = A4_HEIGHT_PX - marginTopPx;
        return Math.ceil(contentHeightPx / pageContentHeightPx);
      });
      await page.evaluate((tp) => {
        const digits = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
        const el = document.getElementById('total-pages-value');
        if (el) {
          el.textContent = String(tp).split('').map(c => digits[parseInt(c)]).join('');
        }
      }, totalPages);

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<div style="width: 100%; text-align: center; font-size: 13px; font-weight: bold; font-family: Cairo, Times New Roman, serif; padding-top: 5mm;">سري</div>',
        margin: {
          top: '10mm',
          bottom: '0mm',
          left: '10mm',
          right: '10mm',
        },
      });

      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }
}
