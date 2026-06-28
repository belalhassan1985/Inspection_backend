import { readFileSync } from 'fs';
import { join } from 'path';
import { buildFragments } from '../../report-fragments';
import { auditReportDocumentV1Parity } from '../parity-audit';
import { ReportDocumentV1Builder } from '../report-document-v1.builder';

const fixture = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'appendices-parity.fixture.json'), 'utf8'));

describe('ReportDocumentV1 appendices shadow parity', () => {
  it('preserves visible appendix titles, paragraphs, values, and order', () => {
    const legacy = buildFragments(fixture);
    const document = new ReportDocumentV1Builder().build(fixture, {
      campaignId: 'appendices-parity-fixture',
      generatedAt: '2026-06-27T00:00:00.000Z',
    });
    const audit = auditReportDocumentV1Parity(legacy, document, fixture);

    expect(audit.appendicesCoverage).toEqual({
      fixturePresent: true,
      sourceAppendices: 2,
      v1AppendicesTitles: 1,
      v1AppendixTitles: 2,
      sourceParagraphs: 5,
      v1Paragraphs: 5,
      missingAppendixPaths: [],
      duplicateAppendixPaths: [],
      paragraphCountMismatches: [],
      textMismatches: [],
      orderStable: true,
    });
    expect(audit.mapping.filter((entry) => entry.category === 'appendices' && entry.status === 'missing-in-v1')).toHaveLength(0);
    expect(new Set(document.fragmentOrder).size).toBe(document.fragmentOrder.length);
    expect(document.fragmentOrder.filter((id) => document.fragments[id].kind === 'appendixParagraph')).toHaveLength(5);
    expect(document.fragmentOrder.filter((id) => document.fragments[id].sourceRef.sourcePath === '$.appendices[2]')).toHaveLength(0);
    expect(document.fragmentOrder.filter((id) => !document.capabilities.fragmentKinds[document.fragments[id].kind])).toHaveLength(0);
  });
});
