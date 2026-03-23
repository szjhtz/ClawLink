/**
 * Upgrade Cleanup
 * Detects version changes and force-cleans all caches, settings, and data
 * to prevent stale config (e.g. old server URLs) from persisting across upgrades.
 */
import { app, session } from 'electron';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync, readdirSync } from 'fs';
import { logger } from './logger';

const VERSION_FILE = 'last-version';

/**
 * Check if the app version has changed since the last run.
 * If so, wipe all user data / caches so the new version starts fresh.
 * Returns true if a cleanup was performed.
 */
export function performUpgradeCleanupIfNeeded(): boolean {
  const currentVersion = app.getVersion();
  const userData = app.getPath('userData');
  const versionFilePath = join(userData, VERSION_FILE);

  // Read previously recorded version
  let lastVersion: string | null = null;
  try {
    if (existsSync(versionFilePath)) {
      lastVersion = readFileSync(versionFilePath, 'utf-8').trim();
    }
  } catch {
    // Treat read failure as "no previous version"
  }

  if (lastVersion === currentVersion) {
    return false;
  }

  logger.info(
    `Version change detected: ${lastVersion ?? '(fresh install)'} → ${currentVersion}. Cleaning caches...`
  );

  // ── 1. Remove Electron userData contents (settings, localStorage, IndexedDB, etc.)
  //    but preserve the directory itself so we can write the version file back.
  try {
    const entries = readdirSafe(userData);
    for (const entry of entries) {
      if (entry === VERSION_FILE) continue; // don't delete the file we're about to write
      const entryPath = join(userData, entry);
      try {
        rmSync(entryPath, { recursive: true, force: true });
      } catch (err) {
        logger.warn(`Failed to remove ${entryPath}:`, err);
      }
    }
  } catch (err) {
    logger.warn('Failed to enumerate userData directory:', err);
  }

  // ── 2. Remove ClawLink config (~/.clawlink)
  // Note: ~/.openclaw is intentionally preserved (user's OpenClaw config & skills).
  removeDirSafe(join(homedir(), '.clawlink'));

  // ── 4. Write current version marker
  try {
    mkdirSync(userData, { recursive: true });
    writeFileSync(versionFilePath, currentVersion, 'utf-8');
  } catch (err) {
    logger.warn('Failed to write version file:', err);
  }

  logger.info('Upgrade cleanup completed.');
  return true;
}

/**
 * Clear Chromium session storage (cookies, cache, localStorage, etc.)
 * Must be called after app is ready.
 */
export async function clearSessionStorage(): Promise<void> {
  try {
    await session.defaultSession.clearStorageData();
    await session.defaultSession.clearCache();
    logger.info('Chromium session storage cleared.');
  } catch (err) {
    logger.warn('Failed to clear session storage:', err);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function readdirSafe(dir: string): string[] {
  try {
    return readdirSync(dir) as string[];
  } catch {
    return [];
  }
}

function removeDirSafe(dir: string): void {
  try {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
      logger.info(`Removed: ${dir}`);
    }
  } catch (err) {
    logger.warn(`Failed to remove ${dir}:`, err);
  }
}
