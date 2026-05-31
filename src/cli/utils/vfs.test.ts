import { describe, expect, it } from 'bun:test';
import { buildCodumentVfsUri, parseCodumentVfsUri, tryParseCodumentVfsUri } from './vfs';

describe('Codument VFS URI parser', () => {
  it('parses supported URI schemes and logical segments', () => {
    const uri = parseCodumentVfsUri('spec://resource.skill-tool/requirement/save/suite/valid/case/save-new');

    expect(uri.scheme).toBe('spec');
    expect(uri.authority).toBe('resource.skill-tool');
    expect(uri.segments).toEqual([
      'resource.skill-tool',
      'requirement',
      'save',
      'suite',
      'valid',
      'case',
      'save-new',
    ]);
  });

  it('parses query and fragment without treating them as physical paths', () => {
    const uri = parseCodumentVfsUri('knowledge://main-docs/domain/order?weak=true#summary');

    expect(uri.scheme).toBe('knowledge');
    expect(uri.query).toEqual({ weak: 'true' });
    expect(uri.fragment).toBe('summary');
  });

  it('rejects malformed or unsupported URI schemes', () => {
    expect(() => parseCodumentVfsUri('file://codument/specs/a.xml')).toThrow('Unsupported');
    expect(() => parseCodumentVfsUri('spec:/broken')).toThrow('Invalid');
    expect(tryParseCodumentVfsUri('http://example.com')).toBeNull();
  });

  it('builds round-trippable logical URIs', () => {
    const raw = buildCodumentVfsUri('decision', ['architecture', 'xml-specs'], { durable: 'true' });
    expect(raw).toBe('decision://architecture/xml-specs?durable=true');
    expect(parseCodumentVfsUri(raw).segments).toEqual(['architecture', 'xml-specs']);
  });
});
