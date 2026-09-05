import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Document storage.
 *
 * Files live on disk under `storage/documents/<documentId>/v<n><ext>` and the
 * database holds the metadata. That split keeps the SQLite file small and means
 * moving to S3 later is a change to this module alone — nothing else touches
 * paths or bytes.
 */

const here = dirname(fileURLToPath(import.meta.url))
export const STORAGE_ROOT = resolve(here, '../../storage')

function ensure(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

export interface StoredFile {
  storedPath: string
  fileName: string
  mimeType: string
  sizeBytes: number
  checksum: string
}

/**
 * Writes a version's bytes and returns what the database needs to record.
 * The checksum lets the UI prove a file has not changed since it was uploaded.
 */
export function writeVersion(
  documentId: string,
  version: number,
  fileName: string,
  mimeType: string,
  bytes: Buffer,
): StoredFile {
  const dir = join(STORAGE_ROOT, 'documents', documentId)
  ensure(dir)

  const ext = extname(fileName) || guessExtension(mimeType)
  const relative = join('documents', documentId, `v${version}${ext}`)
  const absolute = join(STORAGE_ROOT, relative)

  writeFileSync(absolute, bytes)

  return {
    storedPath: relative,
    fileName,
    mimeType,
    sizeBytes: bytes.byteLength,
    checksum: createHash('sha256').update(bytes).digest('hex'),
  }
}

/** Materialises generated text (a filled template) as a stored version. */
export function writeGenerated(documentId: string, version: number, name: string, body: string): StoredFile {
  return writeVersion(documentId, version, `${slug(name)}-v${version}.txt`, 'text/plain; charset=utf-8', Buffer.from(body, 'utf8'))
}

export function absolutePath(storedPath: string): string {
  const abs = join(STORAGE_ROOT, storedPath)
  // Refuse anything that escapes the storage root, however it was constructed.
  if (!abs.startsWith(STORAGE_ROOT)) throw new Error('Path traversal rejected')
  return abs
}

export function fileExists(storedPath: string | null): boolean {
  return !!storedPath && existsSync(absolutePath(storedPath))
}

export function readStream(storedPath: string) {
  return createReadStream(absolutePath(storedPath))
}

export function fileSize(storedPath: string): number {
  return statSync(absolutePath(storedPath)).size
}

export function removeDocument(documentId: string) {
  const dir = join(STORAGE_ROOT, 'documents', documentId)
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
}

export const newId = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function guessExtension(mime: string): string {
  const map: Record<string, string> = {
    'application/pdf': '.pdf',
    'text/plain': '.txt',
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  }
  return map[mime.split(';')[0].trim()] ?? '.bin'
}

/** Fills {{placeholders}} in a template body. Unknown keys are left visible. */
export function renderTemplate(body: string, values: Record<string, string>): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => values[key] ?? match)
}
