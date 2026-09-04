import { createHash, createHmac } from "node:crypto";

/**
 * Object storage, server-side only.
 *
 * S3-compatible, spoken directly rather than through an SDK — the same choice
 * the Stripe module makes and for the same reason: every field that leaves this
 * process is visible in one file, and the dependency surface around a signing
 * key stays small.
 *
 * Compatible means Cloudflare R2, Amazon S3, Backblaze B2, Supabase Storage,
 * MinIO. Nothing here is specific to one of them.
 *
 * WHY UPLOADS GO STRAIGHT TO THE BUCKET
 *
 * The browser is handed a URL signed for one key, one method and a few minutes,
 * and sends the file there. A ten-megabyte photograph never passes through this
 * process, so it cannot exhaust its memory or its request timeout, and there is
 * no multipart parser here to get wrong.
 *
 * A signed URL is a capability, so it is deliberately narrow: PUT only, one
 * exact key, expiring in minutes. It cannot list the bucket, read anything, or
 * write anywhere else.
 *
 * WHERE THE PHOTOGRAPHS ARE SERVED FROM MATTERS
 *
 * `S3_PUBLIC_URL` should be a *different host* from the application. Even with
 * the byte-level checks in `@/lib/media/images`, serving files a stranger
 * uploaded from the origin that holds session cookies is a standing risk: it
 * only takes one file that is both a valid image and a valid document. A
 * separate host means the worst case is a strange file on a domain with nothing
 * to steal.
 */

const ALGORITHM = "AWS4-HMAC-SHA256";
const UNSIGNED = "UNSIGNED-PAYLOAD";

function config() {
  return {
    endpoint: (process.env.S3_ENDPOINT ?? "").replace(/\/$/, ""),
    region: process.env.S3_REGION || "auto",
    bucket: process.env.S3_BUCKET ?? "",
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    publicUrl: (process.env.S3_PUBLIC_URL ?? "").replace(/\/$/, ""),
  };
}

/**
 * Whether uploads can work at all.
 *
 * Checked before anything is promised to a host, so an unconfigured deployment
 * says "not set up yet" rather than handing out URLs that cannot be used.
 */
export function storageEnabled(): boolean {
  const c = config();
  return Boolean(c.endpoint && c.bucket && c.accessKeyId && c.secretAccessKey);
}

/**
 * Whether uploaded files are served from somewhere other than this application.
 *
 * Reported rather than enforced: a deployment that has not separated them still
 * works, and the answer belongs in the operator's face rather than in a crash.
 */
export function servedFromSeparateHost(): boolean {
  const c = config();
  if (!c.publicUrl) return false;
  try {
    const app = process.env.NEXT_PUBLIC_APP_URL ?? "";
    if (!app) return true;
    return new URL(c.publicUrl).host !== new URL(app).host;
  } catch {
    return false;
  }
}

const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const hmac = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data).digest();

/** RFC 3986, which is stricter than `encodeURIComponent` about a few characters. */
function uriEncode(s: string, encodeSlash = true): string {
  return [...s]
    .map((c) => {
      if (/[A-Za-z0-9_.\-~]/.test(c)) return c;
      if (c === "/") return encodeSlash ? "%2F" : "/";
      return [...Buffer.from(c, "utf8")]
        .map((b) => `%${b.toString(16).toUpperCase().padStart(2, "0")}`)
        .join("");
    })
    .join("");
}

function signingKey(secret: string, date: string, region: string): Buffer {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, date), region), "s3"), "aws4_request");
}

/** `20260904T101530Z` and `20260904`, which is the only format SigV4 accepts. */
function stamps(now: Date) {
  const amz = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return { amzDate: amz, dateStamp: amz.slice(0, 8) };
}

/**
 * A URL that will accept exactly one PUT of one object, and nothing else.
 *
 * The content type is signed in, so a browser that uploads with a different one
 * is refused by the bucket rather than by us. That is not the real defence —
 * a declared type is a claim, and the bytes are checked on confirm — but it
 * stops the lazy case at the door.
 */
export function presignPut(input: {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
  now?: Date;
}): { url: string; error: null } | { url: null; error: string } {
  const c = config();
  if (!storageEnabled()) return { url: null, error: "Object storage is not configured." };

  const expires = Math.min(Math.max(input.expiresInSeconds ?? 300, 30), 3600);
  const { amzDate, dateStamp } = stamps(input.now ?? new Date());
  const host = new URL(c.endpoint).host;
  const canonicalUri = `/${c.bucket}/${uriEncode(input.key, false)}`;

  const credential = `${c.accessKeyId}/${dateStamp}/${c.region}/s3/aws4_request`;
  const query: [string, string][] = [
    ["X-Amz-Algorithm", ALGORITHM],
    ["X-Amz-Credential", credential],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(expires)],
    ["X-Amz-SignedHeaders", "content-type;host"],
  ];
  // SigV4 requires the query string sorted by encoded key.
  const canonicalQuery = query
    .map(([k, v]) => [uriEncode(k), uriEncode(v)] as [string, string])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const canonicalHeaders = `content-type:${input.contentType}\nhost:${host}\n`;
  const canonicalRequest = [
    "PUT", canonicalUri, canonicalQuery, canonicalHeaders, "content-type;host", UNSIGNED,
  ].join("\n");

  const stringToSign = [
    ALGORITHM, amzDate, `${dateStamp}/${c.region}/s3/aws4_request`, sha256(canonicalRequest),
  ].join("\n");

  const signature = createHmac("sha256", signingKey(c.secretAccessKey, dateStamp, c.region))
    .update(stringToSign)
    .digest("hex");

  return {
    url: `${c.endpoint}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`,
    error: null,
  };
}

/** A short-lived read capability for private review documents. */
export function presignGet(key: string, expiresInSeconds = 300): { url: string; error: null } | { url: null; error: string } {
  const c = config();
  if (!storageEnabled()) return { url: null, error: "Object storage is not configured." };
  const expires = Math.min(Math.max(expiresInSeconds, 30), 3600);
  const { amzDate, dateStamp } = stamps(new Date());
  const host = new URL(c.endpoint).host;
  const canonicalUri = `/${c.bucket}/${uriEncode(key, false)}`;
  const credential = `${c.accessKeyId}/${dateStamp}/${c.region}/s3/aws4_request`;
  const query: [string, string][] = [
    ["X-Amz-Algorithm", ALGORITHM], ["X-Amz-Credential", credential],
    ["X-Amz-Date", amzDate], ["X-Amz-Expires", String(expires)], ["X-Amz-SignedHeaders", "host"],
  ];
  const canonicalQuery = query.map(([k, v]) => [uriEncode(k), uriEncode(v)] as [string, string])
    .sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `${k}=${v}`).join("&");
  const canonicalRequest = ["GET", canonicalUri, canonicalQuery, `host:${host}\n`, "host", UNSIGNED].join("\n");
  const stringToSign = [ALGORITHM, amzDate, `${dateStamp}/${c.region}/s3/aws4_request`, sha256(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", signingKey(c.secretAccessKey, dateStamp, c.region)).update(stringToSign).digest("hex");
  return { url: `${c.endpoint}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`, error: null };
}

/** A signed request this process makes itself, for reading back or deleting. */
async function signedRequest(
  method: "GET" | "DELETE" | "HEAD",
  key: string,
  extraHeaders: Record<string, string> = {},
): Promise<Response | null> {
  const c = config();
  if (!storageEnabled()) return null;

  const { amzDate, dateStamp } = stamps(new Date());
  const host = new URL(c.endpoint).host;
  const canonicalUri = `/${c.bucket}/${uriEncode(key, false)}`;

  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": UNSIGNED,
    "x-amz-date": amzDate,
    ...Object.fromEntries(Object.entries(extraHeaders).map(([k, v]) => [k.toLowerCase(), v])),
  };
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${headers[n]}\n`).join("");
  const signedHeaders = names.join(";");

  const canonicalRequest = [
    method, canonicalUri, "", canonicalHeaders, signedHeaders, UNSIGNED,
  ].join("\n");
  const stringToSign = [
    ALGORITHM, amzDate, `${dateStamp}/${c.region}/s3/aws4_request`, sha256(canonicalRequest),
  ].join("\n");
  const signature = createHmac("sha256", signingKey(c.secretAccessKey, dateStamp, c.region))
    .update(stringToSign)
    .digest("hex");

  const authorization =
    `${ALGORITHM} Credential=${c.accessKeyId}/${dateStamp}/${c.region}/s3/aws4_request, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  try {
    return await fetch(`${c.endpoint}${canonicalUri}`, {
      method,
      headers: { ...headers, Authorization: authorization },
    });
  } catch {
    return null;
  }
}

/**
 * The first bytes of a stored object, so its contents can be judged rather than
 * its name believed.
 *
 * A range request: enough to identify a format, not enough to pull a ten
 * megabyte file back through this process for nothing.
 */
export async function readHead(key: string, bytes = 64): Promise<Uint8Array | null> {
  const res = await signedRequest("GET", key, { range: `bytes=0-${bytes - 1}` });
  if (!res || !res.ok) return null;
  return new Uint8Array(await res.arrayBuffer());
}

/** How big the stored object actually is, regardless of what was claimed. */
export async function objectSize(key: string): Promise<number | null> {
  const res = await signedRequest("HEAD", key);
  if (!res || !res.ok) return null;
  const length = Number(res.headers.get("content-length"));
  return Number.isFinite(length) ? length : null;
}

/** Remove an object — used when a upload turns out not to be a photograph. */
export async function deleteObject(key: string): Promise<boolean> {
  const res = await signedRequest("DELETE", key);
  return Boolean(res && (res.ok || res.status === 404));
}

/**
 * Where a stored photograph is read from.
 *
 * Falls back to the endpoint when no public URL is set, which works but puts
 * files on the same host as the application — see the note at the top of this
 * file about why that is not where they belong.
 */
export function publicUrl(key: string): string {
  const c = config();
  const base = c.publicUrl || `${c.endpoint}/${c.bucket}`;
  return `${base}/${key.split("/").map((s) => encodeURIComponent(s)).join("/")}`;
}

/**
 * What a listing's stored image should be fetched from.
 *
 * A listing's `images` hold two different kinds of thing and always will. A
 * sample photograph shipped with the repository is a path — it begins with a
 * slash and is served by this application. A host's upload is a storage key,
 * which lives in a bucket somewhere else entirely.
 *
 * Telling them apart on the leading slash rather than storing a flag keeps
 * every existing row valid: nothing had to be migrated when uploads arrived,
 * and nothing breaks if storage is switched off again.
 */
export function photoUrl(imageOrKey: string): string {
  if (!imageOrKey) return "";
  if (imageOrKey.startsWith("/") || /^https?:\/\//i.test(imageOrKey)) return imageOrKey;
  return publicUrl(imageOrKey);
}
