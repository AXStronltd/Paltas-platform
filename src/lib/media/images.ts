/**
 * What may be accepted as a photograph of a property.
 *
 * Pure: no storage, no network, no clock. Every rule here is a decision about
 * bytes, which is the only way to test the ones that matter without a bucket.
 *
 * The rule that matters most is that a file's name and its declared type are
 * both claims made by whoever is uploading, and neither is evidence. A file
 * called `roof.jpg`, uploaded as `image/jpeg`, can contain HTML with a script
 * in it; served back from the platform's own origin it becomes stored
 * cross-site scripting on a page where people sign in and pay. So the bytes are
 * read, and only a handful of formats whose first few bytes are unambiguous are
 * allowed at all.
 *
 * SVG is refused on purpose. It is an image format that can carry script, and
 * there is no version of "a photograph of a house" that needs it.
 */

/** The formats a camera or a phone actually produces. */
export const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;
export type AcceptedType = typeof ACCEPTED[number];

/**
 * Ten megabytes. Large enough for a photograph straight off a phone, small
 * enough that a slow connection is not asked to carry a raw camera file.
 */
export const MAX_BYTES = 10 * 1024 * 1024;

/** Below this it is an icon, a tracking pixel, or a mistake — not a photograph. */
export const MIN_BYTES = 1024;

/** How many photographs one listing may carry. */
export const MAX_PER_LISTING = 12;

export interface Rejection {
  /** Said to the person uploading, so it has to be worth reading. */
  reason: string;
}

/**
 * What the first bytes of a file say it is, regardless of its name.
 *
 * Returns null for anything not recognised, which is the safe direction: an
 * unknown format is refused rather than passed through on the strength of its
 * extension.
 */
export function sniff(bytes: Uint8Array): AcceptedType | null {
  const at = (i: number) => bytes[i];
  const ascii = (start: number, text: string) =>
    [...text].every((c, i) => at(start + i) === c.charCodeAt(0));

  // JPEG: every variant begins FF D8 FF.
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "image/jpeg";

  // PNG: the eight-byte signature, which includes a CRLF/LF pair chosen to
  // detect exactly the kind of mangling a naive proxy does.
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (PNG.every((b, i) => at(i) === b)) return "image/png";

  // RIFF container: "RIFF" then four size bytes then the form type.
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "image/webp";

  // ISO base media: a box length, then "ftyp", then a brand. AVIF brands begin
  // "avi" — avif, avis — and are checked rather than the whole set, because a
  // "mif1" brand can be a still image sequence we have no reason to accept.
  if (ascii(4, "ftyp") && ascii(8, "avi")) return "image/avif";

  return null;
}

/**
 * Whether these bytes may be stored as a listing photograph.
 *
 * `declared` is what the browser said the file was. It is checked against what
 * the bytes actually are, and a disagreement is refused rather than resolved in
 * either direction: a file lying about itself is not a file to be lenient with.
 */
export function validateImage(input: {
  bytes: Uint8Array;
  declared?: string | null;
  size?: number;
}): { ok: true; type: AcceptedType } | { ok: false } & Rejection {
  const size = input.size ?? input.bytes.length;

  if (size > MAX_BYTES) {
    return { ok: false, reason: `That photograph is larger than ${Math.floor(MAX_BYTES / 1024 / 1024)} MB.` };
  }
  if (size < MIN_BYTES) {
    return { ok: false, reason: "That file is too small to be a photograph." };
  }

  const actual = sniff(input.bytes);
  if (!actual) {
    return {
      ok: false,
      reason: "That is not a JPEG, PNG, WebP or AVIF. SVG and other formats are not accepted.",
    };
  }

  const declared = (input.declared ?? "").split(";")[0].trim().toLowerCase();
  if (declared && declared !== actual) {
    // Notably: an HTML or SVG payload renamed .jpg lands here.
    return { ok: false, reason: `That file says it is ${declared} but its contents are ${actual}.` };
  }

  return { ok: true, type: actual };
}

const EXTENSION: Record<AcceptedType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

/**
 * Where a photograph is stored.
 *
 * The name the uploader chose is thrown away entirely rather than sanitised.
 * Sanitising is a losing game — path traversal, control characters, right-to-
 * left overrides, a name that collides with someone else's — and none of it
 * buys anything, because nobody ever reads this string. The extension comes
 * from the sniffed type, not from the original name.
 *
 * The listing id is in the path so an object can be traced back to what it
 * belongs to, and so a prefix delete removes a listing's photographs.
 */
export function storageKey(input: {
  orgId: string;
  listingId: string;
  type: AcceptedType;
  /** Caller-supplied randomness, so this stays pure and testable. */
  token: string;
}): string {
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "");
  return `listings/${safe(input.orgId)}/${safe(input.listingId)}/${safe(input.token)}.${EXTENSION[input.type]}`;
}

/**
 * Whether a stored key belongs to this listing.
 *
 * The confirm step is handed a key by the browser, and a browser can say
 * anything. Without this check one host could attach another's photograph — or
 * any object in the bucket — to their own advert.
 */
export function keyBelongsTo(key: string, orgId: string, listingId: string): boolean {
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "");
  return key.startsWith(`listings/${safe(orgId)}/${safe(listingId)}/`)
    // No traversal, however it is spelled.
    && !key.includes("..")
    && !key.includes("//");
}

/**
 * Add a photograph to a listing's existing set.
 *
 * Order is meaningful — the first is the one every card shows — so a new
 * photograph goes last rather than displacing whatever the host chose to lead
 * with. Duplicates are ignored rather than refused: uploading the same file
 * twice is a slip, not an error worth a message.
 */
export function addPhoto(existing: string[], key: string): { ok: true; images: string[] } | { ok: false } & Rejection {
  if (existing.includes(key)) return { ok: true, images: existing };
  if (existing.length >= MAX_PER_LISTING) {
    return { ok: false, reason: `A listing may carry ${MAX_PER_LISTING} photographs. Remove one first.` };
  }
  return { ok: true, images: [...existing, key] };
}
