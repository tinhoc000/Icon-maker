import type { OutputFile } from '../core/types';

export type DeliverResult = 'shared' | 'downloaded' | 'cancelled';

export interface DeliverDeps {
  nav: { canShare?: (data: { files: File[] }) => boolean; share?: (data: { files: File[] }) => Promise<void> };
  download: (file: File) => void;
  /** Use the system share sheet when it can take the files. */
  preferShare: boolean;
}

/** True on iPhone and iPad, where the share sheet is the way to reach Files and Photos. */
export function shouldShare(env: { userAgent?: string; maxTouchPoints?: number }): boolean {
  const ua = env.userAgent ?? '';
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  // iPadOS identifies as a Mac, but a Mac has no touch screen.
  return /Macintosh/.test(ua) && (env.maxTouchPoints ?? 0) > 1;
}

function downloadViaLink(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function defaults(): DeliverDeps {
  return {
    nav: navigator as DeliverDeps['nav'],
    download: downloadViaLink,
    preferShare: shouldShare(navigator),
  };
}

/**
 * Hands finished files to the person: the share sheet on iPhone/iPad when it can take
 * them, otherwise ordinary downloads. Cancelling the share sheet is not an error.
 */
export async function deliver(files: OutputFile[], deps: DeliverDeps = defaults()): Promise<DeliverResult> {
  const list = files.map((f) => new File([f.data as BlobPart], f.name, { type: f.mime }));

  if (deps.preferShare && deps.nav.share && deps.nav.canShare?.({ files: list })) {
    try {
      await deps.nav.share({ files: list });
      return 'shared';
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return 'cancelled';
      // Anything else (for example the browser refusing a share after a long wait): download instead.
    }
  }

  for (const file of list) deps.download(file);
  return 'downloaded';
}
