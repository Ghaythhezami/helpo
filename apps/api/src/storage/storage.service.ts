import { Injectable, Logger } from "@nestjs/common";

export interface StoredFile {
  key: string;
  url: string;
}

/**
 * Keeps the teacher's original upload ONLY when BLOB_READ_WRITE_TOKEN is set (Vercel Blob). Without the token nothing
 * but the clean text (and the sha256 for the cache) is stored. There is no S3 and no local-disk storage.
 * Key layout: lessons/{lessonId}/source.{ext}.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  get enabled(): boolean {
    return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  }

  static keyFor(lessonId: string, ext: string): string {
    return `lessons/${lessonId}/source.${ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin"}`;
  }

  /** Returns null when storage is off or the upload fails: a missing copy of the original never blocks a lesson. */
  async put(key: string, buffer: Buffer): Promise<StoredFile | null> {
    if (!this.enabled) return null;
    try {
      const { put } = await import("@vercel/blob");
      const blob = await put(key, buffer, { access: "public", addRandomSuffix: true });
      return { key, url: blob.url };
    } catch (e) {
      this.logger.warn(`Original was not stored: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }
}
