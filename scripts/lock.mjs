// Checks downloaded model pieces against the hashes committed in scripts/models.lock.json,
// so the build never ships code that a changed download host slipped in.

/** Throws unless the chunk is in the lock with the same SHA-256. */
export function checkChunk(lock, name, hash) {
  const expected = lock.chunks[name];
  if (!expected) {
    throw new Error(
      `Model file ${name} is not in scripts/models.lock.json. If you upgraded the library on purpose, review the change and run: npm run models:lock`,
    );
  }
  if (expected !== hash) {
    throw new Error(`Model file ${name} does not match scripts/models.lock.json (the download changed)`);
  }
}
