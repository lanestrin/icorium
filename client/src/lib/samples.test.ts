import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SAMPLE_FILES } from './samples';

describe('bundled samples', () => {
  it('holds every sample CSV by name, exactly as it is on disk', () => {
    const dir = path.resolve(import.meta.dirname, '../../../sample-data');
    const onDisk = readdirSync(dir).filter((name) => name.endsWith('.csv')).sort();
    expect(SAMPLE_FILES.map((f) => f.name).sort()).toEqual(onDisk);
    expect(onDisk).toHaveLength(5);
    for (const { name, text } of SAMPLE_FILES) expect(text).toBe(readFileSync(path.join(dir, name), 'utf8'));
  });
});
