import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url));

function typeScriptFilesIn(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...typeScriptFilesIn(full));
    } else if (entry.name.endsWith('.ts')) {
      found.push(full);
    }
  }
  return found;
}

/** Every `from '...'` / `import '...'` specifier in a source file. */
function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const pattern = /(?:from|import)\s*['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const specifier = match[1];
    if (specifier !== undefined) {
      specifiers.push(specifier);
    }
  }
  return specifiers;
}

describe('module boundaries', () => {
  const coreFiles = typeScriptFilesIn(join(SRC_DIR, 'core'));

  it('has core modules to check', () => {
    expect(coreFiles.length).toBeGreaterThan(0);
  });

  it.each(['core', 'config', 'game', 'ui'])('has a %s area', (area) => {
    expect(readdirSync(join(SRC_DIR, area)).length).toBeGreaterThan(0);
  });

  it('never imports a rendering engine, game or ui from core', () => {
    const violations: string[] = [];
    for (const file of coreFiles) {
      for (const specifier of importSpecifiers(readFileSync(file, 'utf8'))) {
        const forbidden =
          specifier.startsWith('@babylonjs/') ||
          /(^|\/)(game|ui)(\/|$)/.test(specifier);
        if (forbidden) {
          violations.push(`${file.slice(SRC_DIR.length + 1)} imports "${specifier}"`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
