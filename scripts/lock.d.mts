export interface ModelLock {
  version: string;
  chunks: Record<string, string>;
}
export function checkChunk(lock: ModelLock, name: string, hash: string): void;
