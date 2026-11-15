import { strToU8, zipSync, type Zippable } from 'fflate';
import type { OutputFile } from './types';

export interface Failure {
  picture: string;
  reason: string;
}

/** Bundles outputs into a ZIP. Pictures that failed are listed in NOT-INCLUDED.txt. */
export function buildZip(files: OutputFile[], failures: Failure[]): Uint8Array {
  const entries: Zippable = {};
  // PNG data is already compressed, so store rather than deflate again.
  for (const f of files) entries[f.name] = [f.data, { level: 0 }];
  if (failures.length > 0) {
    const lines = ['These pictures could not be included:', '', ...failures.map((f) => `${f.picture}: ${f.reason}`)];
    entries['NOT-INCLUDED.txt'] = strToU8(lines.join('\r\n') + '\r\n');
  }
  return zipSync(entries);
}
