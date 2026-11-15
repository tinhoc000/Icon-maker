import { encodeIco, encodePng, encodeSvg } from './encode';
import { makeIcon } from './icon';
import { applyMask } from './mask';
import { dedupe, outputName, zipName } from './naming';
import type { Mask, OutputFile, Pixels, Rect, Settings } from './types';
import { buildZip, type Failure } from './zip';

export interface PictureData {
  name: string;
  original: Pixels;
  mask: Mask | null;
  crop: Rect | null;
}

const ICO_SOURCE_SIZE = 256;
const enc = new TextEncoder();

/** One plain-language line describing what the current settings will do. */
export function summarize(s: Settings, hasHeic: boolean): string {
  const parts = [hasHeic ? 'convert HEIC' : 'convert'];
  if (s.removeBackground) parts.push('remove background');
  if (s.makeIcon) parts.push(`make a ${s.size} px icon`);
  const formats = s.formats.map((f) => f.toUpperCase());
  const list = formats.length > 1 ? `${formats.slice(0, -1).join(', ')} and ${formats[formats.length - 1]}` : formats[0];
  parts.push(`save as ${list}`);
  return `This will: ${parts.join(', ')}.`;
}

/** Produces every output file for one picture. Throws NothingLeftError when an icon has nothing to show. */
export function renderOutputs(pic: PictureData, s: Settings): OutputFile[] {
  let base = pic.original;
  if (s.removeBackground) {
    if (!pic.mask) throw new Error('Background has not been removed from this picture yet');
    base = applyMask(pic.original, pic.mask);
  }

  if (!s.makeIcon) {
    const kind = s.removeBackground ? 'cutout' : 'plain';
    return [{ name: outputName(pic.name, kind), data: encodePng(base), mime: 'image/png' }];
  }

  const opts = { paddingPct: s.paddingPct, crop: pic.crop };
  const icon = makeIcon(base, { ...opts, size: s.size });
  const out: OutputFile[] = [];
  let png: Uint8Array | null = null;
  const iconPng = () => (png ??= encodePng(icon));

  if (s.formats.includes('png')) {
    out.push({ name: outputName(pic.name, 'icon-png', s.size), data: iconPng(), mime: 'image/png' });
  }
  if (s.formats.includes('ico')) {
    const source = s.size === ICO_SOURCE_SIZE ? icon : makeIcon(base, { ...opts, size: ICO_SOURCE_SIZE });
    out.push({ name: outputName(pic.name, 'icon-ico'), data: encodeIco(source), mime: 'image/x-icon' });
  }
  if (s.formats.includes('svg')) {
    out.push({
      name: outputName(pic.name, 'icon-svg', s.size),
      data: enc.encode(encodeSvg(iconPng(), s.size)),
      mime: 'image/svg+xml',
    });
  }
  return out;
}

/** Renders every picture and bundles the results. Pictures that fail are reported, not fatal. */
export function buildDownloadAll(
  pics: PictureData[],
  s: Settings,
  date: Date,
): { zip: Uint8Array; name: string; failures: Failure[] } {
  const files: OutputFile[] = [];
  const failures: Failure[] = [];
  for (const pic of pics) {
    try {
      files.push(...renderOutputs(pic, s));
    } catch (err) {
      failures.push({ picture: pic.name, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  const unique = dedupe(files.map((f) => f.name));
  const renamed = files.map((f, i) => ({ ...f, name: unique[i]! }));
  return { zip: buildZip(renamed, failures), name: zipName(date), failures };
}
