import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Non-recursive: return absolute paths of files in `dir` matching `re`. */
export function glob(dir: string, re: RegExp): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isFile() && re.test(d.name))
      .map((d) => join(dir, d.name))
      .sort();
  } catch {
    return [];
  }
}
