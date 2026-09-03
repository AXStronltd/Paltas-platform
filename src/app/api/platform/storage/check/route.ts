import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { guardPlatform, handle, ok } from "@/server/http";
import {
  deleteObject, objectSize, presignPut, publicUrl, readHead,
  servedFromSeparateHost, storageEnabled,
} from "@/server/storage";

export const dynamic = "force-dynamic";

/**
 * Does object storage actually work?
 *
 * A real round trip through the real module: sign a URL, upload a small file to
 * it, read the bytes back, check the size, delete it. Ten tests prove the signed
 * URL has the right shape; only a bucket can prove it is a shape the bucket
 * accepts, and until this returns green "photo upload works" is a belief.
 *
 * Paltas staff only, behind guardPlatform, which answers 404 — a stranger should
 * not be able to probe someone else's storage configuration.
 *
 * Every step reports separately, because the failures mean different things: a
 * refused PUT is usually the token's permissions, a readback that fails is
 * usually the bucket name, and a 403 on the public URL is usually that the
 * bucket has no public access configured.
 *
 * It cannot test CORS. A browser uploads directly to the bucket, and only a
 * browser can find out whether the bucket allows that, so the required policy
 * is reported here rather than checked.
 */
export async function GET(): Promise<NextResponse> {
  return handle(async () => {
    const g = await guardPlatform("platform.storage.check");
    if ("response" in g) return g.response;

    const steps: { step: string; ok: boolean; detail: string }[] = [];
    const add = (step: string, okay: boolean, detail = "") => steps.push({ step, ok: okay, detail });

    if (!storageEnabled()) {
      add("configuration", false, "S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must all be set.");
      return ok({ working: false, steps, cors: CORS_POLICY });
    }
    add("configuration", true, "endpoint, bucket and credentials are all present");

    // A throwaway key under its own prefix, so a half-finished check cannot
    // leave anything among real photographs.
    const key = `_diagnostics/${randomBytes(12).toString("hex")}.png`;
    // A one-pixel PNG: a real image, so this exercises the same path a
    // photograph takes rather than a special case.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );

    const signed = presignPut({ key, contentType: "image/png" });
    if (!signed.url) {
      add("sign", false, signed.error ?? "Could not sign an upload URL.");
      return ok({ working: false, steps, cors: CORS_POLICY });
    }
    add("sign", true, "a presigned PUT URL was produced");

    let uploaded = false;
    try {
      const res = await fetch(signed.url, {
        method: "PUT",
        headers: { "Content-Type": "image/png" },
        body: png,
      });
      uploaded = res.ok;
      add("upload", res.ok, res.ok
        ? "the bucket accepted a signed upload"
        : `the bucket refused it (${res.status}) — usually the API token's permissions or the bucket name`);
    } catch (e) {
      add("upload", false, `could not reach the bucket: ${(e as Error).message}`);
    }

    if (uploaded) {
      const head = await readHead(key, 16);
      add("read back", Boolean(head && head.length > 0),
        head?.length ? `${head.length} bytes read` : "the object could not be read back");

      const size = await objectSize(key);
      add("size", size === png.length,
        size === null ? "no size reported" : `${size} bytes stored, ${png.length} sent`);

      // Only meaningful when files are served from somewhere public.
      const url = publicUrl(key);
      try {
        const pub = await fetch(url, { method: "GET" });
        add("public read", pub.ok, pub.ok
          ? "the stored file is readable from S3_PUBLIC_URL"
          : `S3_PUBLIC_URL returned ${pub.status} — the bucket is probably not public, so photographs will not display`);
      } catch {
        add("public read", false, "S3_PUBLIC_URL could not be reached");
      }

      add("cleanup", await deleteObject(key), "the diagnostic object was removed");
    }

    return ok({
      working: steps.every((s) => s.ok),
      steps,
      /*
       * Reported rather than enforced. Serving files a stranger uploaded from
       * the origin that holds session cookies is a standing risk even with the
       * byte checks: it only takes one file that is both a valid image and a
       * valid document.
       */
      servedSeparately: servedFromSeparateHost(),
      cors: CORS_POLICY,
    });
  });
}

/**
 * What the bucket must allow, so a browser can PUT to it directly.
 *
 * Cannot be checked from here — only a browser discovers whether a
 * cross-origin PUT is permitted — so it is stated instead. This is the single
 * most common reason an upload works from a script and fails from the page.
 */
const CORS_POLICY = {
  note: "Set this on the bucket, or browser uploads fail with an opaque CORS error while everything here still passes.",
  policy: [
    {
      AllowedOrigins: ["https://paltas-platform.onrender.com", "http://localhost:3010"],
      AllowedMethods: ["PUT"],
      AllowedHeaders: ["content-type"],
      MaxAgeSeconds: 3600,
    },
  ],
};
