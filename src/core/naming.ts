import {
  DEFAULT_SETTINGS,
  PADDING_CHOICES,
  SIZE_MAX,
  SIZE_MIN,
  type Format,
  type Settings,
} from './types';

export type OutputKind = 'plain' | 'cutout' | 'icon-png' | 'icon-ico' | 'icon-svg';

const ILLEGAL = /[<>:"/\|?*\u0000-\u001f]/g;

function stem(source: string): string {
  const dot = source.lastIndexOf('.');
  const base = dot >= 0 ? source.slice(0, dot) : source;
  const cleaned = base.replace(ILLEGAL, '_').trim();
  return /[^_.\s]/.test(cleaned) ? cleaned : 'image';
}

export function outputName(source: string, kind: OutputKind, size?: number): string {
  const s = stem(source);
  switch (kind) {
    case 'plain':
      return `${s}.png`;
    case 'cutout':
      return `${s}-cutout.png`;
    case 'icon-png':
      return `${s}-icon-${size}.png`;
    case 'icon-ico':
      return `${s}-icon.ico`;
    case 'icon-svg':
      return `${s}-icon-${size}.svg`;
  }
}

/** Makes names unique (ignoring case) by adding -2, -3 … before the extension. */
export function dedupe(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    let candidate = name;
    const dot = name.lastIndexOf('.');
    const base = dot >= 0 ? name.slice(0, dot) : name;
    const ext = dot >= 0 ? name.slice(dot) : '';
    for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${base}-${n}${ext}`;
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

export function zipName(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `icons-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}.zip`;
}

const FORMAT_ORDER: Format[] = ['png', 'ico', 'svg'];

export function normalizeSettings(s: Settings): Settings {
  const size = Number.isFinite(s.size)
    ? Math.min(SIZE_MAX, Math.max(SIZE_MIN, Math.round(s.size)))
    : DEFAULT_SETTINGS.size;
  const paddingPct = (PADDING_CHOICES as readonly number[]).includes(s.paddingPct)
    ? s.paddingPct
    : DEFAULT_SETTINGS.paddingPct;
  let formats = FORMAT_ORDER.filter((f) => s.formats.includes(f) && (s.makeIcon || f === 'png'));
  if (formats.length === 0) formats = ['png'];
  return { removeBackground: !!s.removeBackground, makeIcon: !!s.makeIcon, size, paddingPct, formats };
}
