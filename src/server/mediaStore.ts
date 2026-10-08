/**
 * OZIZ — Media Asset Storage Engine
 * Saves client-uploaded defect and repair photos to disk with SHA-256 deduplication
 * and provides static serving URLs.
 */

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

export const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export interface SavedMediaResult {
  url: string;
  sha256: string;
  cid: string;
  sizeBytes: number;
}

/**
 * Saves a base64 image string to disk if not already saved.
 * Returns public URL path, sha256, and IPFS-style CID.
 */
export function saveMediaAsset(imageBase64OrUrl: string): SavedMediaResult {
  // If it's already an external HTTP URL or relative /uploads URL, compute or preserve
  if (imageBase64OrUrl.startsWith('http://') || imageBase64OrUrl.startsWith('https://') || imageBase64OrUrl.startsWith('/uploads/')) {
    const hash = createHash('sha256').update(imageBase64OrUrl).digest('hex');
    return {
      url: imageBase64OrUrl,
      sha256: hash,
      cid: `bafybeig${hash.slice(0, 46)}`,
      sizeBytes: imageBase64OrUrl.length,
    };
  }

  // Strip possible data URI header (e.g. "data:image/jpeg;base64,")
  const base64Clean = imageBase64OrUrl.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64Clean, 'base64');
  const hash = createHash('sha256').update(buffer).digest('hex');
  const cid = `bafybeig${hash.slice(0, 46)}`;

  // Deterministic filename based on content SHA-256 (automatic deduplication)
  const filename = `${hash.slice(0, 24)}.jpg`;
  const filePath = path.join(UPLOAD_DIR, filename);

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, buffer);
  }

  return {
    url: `/uploads/${filename}`,
    sha256: hash,
    cid,
    sizeBytes: buffer.length,
  };
}

/**
 * Returns statistics about the uploads directory
 */
export function getUploadsStats() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    return { count: 0, totalSizeBytes: 0 };
  }
  const files = fs.readdirSync(UPLOAD_DIR);
  let totalSize = 0;
  for (const f of files) {
    try {
      const stat = fs.statSync(path.join(UPLOAD_DIR, f));
      totalSize += stat.size;
    } catch {
      // Ignore transient errors
    }
  }
  return {
    count: files.length,
    totalSizeBytes: totalSize,
  };
}
