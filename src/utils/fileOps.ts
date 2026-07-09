import {
  writeFile,
  rename,
  unlink,
  rm,
  mkdir,
  readFile,
  stat,
} from "fs/promises";
import { join, dirname } from "path";
import { mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { StatsJson } from "@/types/sitemap";
import { StorageError } from "@/types/errors";
import { logger } from "@/utils/logger";

/**
 * Write file atomically using write-to-temp-then-rename pattern.
 * This ensures the file is either fully written or not written at all.
 */
export async function atomicWriteFile(
  filePath: string,
  content: string | Buffer,
): Promise<void> {
  const tempDir = await mkdtemp(join(tmpdir(), "sitemap-"));
  const tempFile = join(tempDir, "temp-write");

  try {
    await mkdir(dirname(filePath), { recursive: true });

    await writeFile(tempFile, content, { flag: "w" });

    await rename(tempFile, filePath);

    logger.debug("Atomic file write completed", "fileOps", { filePath });
  } catch (error) {
    await unlink(tempFile).catch(() => {});

    throw new StorageError(
      `Failed to write file: ${filePath}`,
      filePath,
      { operation: "atomicWrite" },
      error instanceof Error ? error : undefined,
    );
  } finally {
    await rm(tempDir, { recursive: true }).catch(() => {});
  }
}

/**
 * Read file with error handling
 */
export async function safeReadFile(filePath: string): Promise<string | null> {
  try {
    const content = await readFile(filePath, "utf-8");
    return content;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw new StorageError(
      `Failed to read file: ${filePath}`,
      filePath,
      { operation: "read" },
      error instanceof Error ? error : undefined,
    );
  }
}

/**
 * Check if file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Write stats JSON atomically with validation
 */
export async function atomicWriteStats(
  filePath: string,
  stats: StatsJson,
): Promise<void> {
  validateStatsJson(stats);

  const content = JSON.stringify(stats, null, 2);
  await atomicWriteFile(filePath, content);

  logger.info("Stats written atomically", "fileOps", { filePath });
}

/**
 * Validate StatsJson structure
 */
function validateStatsJson(stats: StatsJson): void {
  const required = [
    "websiteUrl",
    "timestamp",
    "duration",
    "statistics",
    "crawlDepth",
    "robotsTxt",
    "errors",
  ];

  for (const field of required) {
    if (!(field in stats)) {
      throw new StorageError(
        `Invalid stats: missing required field "${field}"`,
        undefined,
        { operation: "validateStats" },
      );
    }
  }

  if (!stats.statistics?.existingSitemap || !stats.statistics?.crawling) {
    throw new StorageError(
      "Invalid stats: missing statistics subsections",
      undefined,
      { operation: "validateStats" },
    );
  }
}

/**
 * Write sitemap XML file atomically
 */
export async function writeSitemapFile(
  filePath: string,
  content: string,
): Promise<void> {
  if (!content.startsWith("<?xml")) {
    throw new StorageError(
      "Invalid XML content: must start with <?xml declaration",
      filePath,
      { operation: "writeSitemap" },
    );
  }

  await atomicWriteFile(filePath, content);
  logger.info("Sitemap file written", "fileOps", { filePath });
}

/**
 * Write gzipped sitemap file atomically
 */
export async function writeGzippedSitemap(
  filePath: string,
  content: Buffer,
): Promise<void> {
  if (!filePath.endsWith(".gz")) {
    throw new StorageError(
      "Invalid gzipped file path: must end with .gz",
      filePath,
      { operation: "writeGzippedSitemap" },
    );
  }

  await atomicWriteFile(filePath, content);
  logger.info("Gzipped sitemap file written", "fileOps", { filePath });
}

/**
 * Create directory recursively if it doesn't exist
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    await mkdir(dirPath, { recursive: true });
  } catch (error) {
    throw new StorageError(
      `Failed to create directory: ${dirPath}`,
      dirPath,
      { operation: "ensureDirectory" },
      error instanceof Error ? error : undefined,
    );
  }
}

/**
 * Safe file delete (no error if file doesn't exist)
 */
export async function safeDeleteFile(filePath: string): Promise<boolean> {
  try {
    await unlink(filePath);
    logger.debug("File deleted", "fileOps", { filePath });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw new StorageError(
      `Failed to delete file: ${filePath}`,
      filePath,
      { operation: "delete" },
      error instanceof Error ? error : undefined,
    );
  }
}
