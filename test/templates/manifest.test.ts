import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { TEMPLATE_FILES } from '../../src/templates/manifest';

/**
 * Guards src/templates/manifest.ts against staleness: the manifest is auto-generated
 * by scripts/gen-template-manifest.ts and must list every deployable file under
 * src/templates/. If someone adds a template file but forgets to regenerate, the
 * file silently never deploys via `codument init` / `upgrade-workspace`. This test
 * fails loudly in that case.
 *
 * The walk below mirrors gen-template-manifest.ts exactly: recursive, files only,
 * excluding the manifest itself, relative paths with forward-slash separators.
 */

const TEMPLATES_DIR = path.join(__dirname, '..', '..', 'src', 'templates');
const SELF = 'manifest.ts';

function walk(dir: string, base: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full, base));
    } else if (entry.isFile() && entry.name !== SELF) {
      out.push(path.relative(base, full).split(path.sep).join('/'));
    }
  }
  return out;
}

describe('src/templates/manifest.ts in sync with disk', () => {
  it('ships modeling enabled by default', () => {
    const modelingTemplate = fs.readFileSync(
      path.join(TEMPLATES_DIR, 'codument', 'config', 'modeling.xml'),
      'utf-8',
    );

    expect(modelingTemplate).toContain('<Modeling version="1" enabled="true">');
  });

  it('embeds exactly the files under src/templates/ (run `bun run scripts/gen-template-manifest.ts` if this fails)', () => {
    const onDisk = new Set(walk(TEMPLATES_DIR, TEMPLATES_DIR));
    const inManifest = new Set(TEMPLATE_FILES.map((f) => f.path));

    // Report both directions so a failure names exactly which files drifted.
    const missingFromManifest = [...onDisk].filter((p) => !inManifest.has(p)).sort();
    const extraInManifest = [...inManifest].filter((p) => !onDisk.has(p)).sort();

    expect({ missingFromManifest, extraInManifest }).toEqual({
      missingFromManifest: [],
      extraInManifest: [],
    });
  });

  it('has unique paths and non-empty embedded content', () => {
    const paths = TEMPLATE_FILES.map((f) => f.path);
    expect(paths.length).toBe(new Set(paths).size);
    for (const f of TEMPLATE_FILES) {
      expect(typeof f.content).toBe('string');
      expect(f.content.length).toBeGreaterThan(0);
    }
  });
});
