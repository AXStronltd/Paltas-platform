"use client";

import { useRef, useState } from "react";
import { SafeImage } from "@/components/ui/SafeImage";
import {
  confirmListingPhoto, removeListingPhoto, requestPhotoUpload,
} from "@/lib/services/managementService";

/**
 * A host's photographs of their own property.
 *
 * Three steps for each file, and the middle one is not ours: ask the platform
 * for somewhere to put it, send the bytes straight there, then ask the platform
 * to check them. A ten-megabyte photograph never passes through the
 * application, which is why this works on a slow connection and why there is no
 * upload progress bar to get wrong.
 *
 * Everything a person could get wrong is said in words rather than left to a
 * silent failure: the wrong kind of file, one that is too large, storage not
 * being configured yet. A photograph that vanishes without explanation is worse
 * than one that is refused with a reason.
 */
export function ListingPhotos({
  listingId, images, urls, onChange,
}: {
  listingId: string;
  /** Storage keys and local paths, as stored. */
  images: string[];
  /** The same list, resolved to somewhere fetchable. */
  urls: string[];
  onChange: (images: string[], urls: string[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function upload(files: FileList) {
    setError(null);
    setBusy(true);
    setProgress({ done: 0, total: files.length });

    let images_ = images;
    let urls_ = urls;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // One failure does not abandon the rest: a host selecting six photographs
      // where one is a screenshot should still get the other five.
      const asked = await requestPhotoUpload(listingId, file);
      if (asked.error) { setError(asked.error.message); continue; }

      const put = await fetch(asked.data.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": asked.data.contentType },
        body: file,
      }).catch(() => null);

      if (!put?.ok) {
        setError("That photograph could not be uploaded. Check your connection and try again.");
        continue;
      }

      // The bytes are judged here, not by the browser and not by the bucket.
      const confirmed = await confirmListingPhoto(listingId, asked.data.key);
      if (confirmed.error) { setError(confirmed.error.message); continue; }

      images_ = confirmed.data.images;
      urls_ = confirmed.data.urls;
      onChange(images_, urls_);
      setProgress({ done: i + 1, total: files.length });
    }

    setBusy(false);
    setProgress(null);
    if (input.current) input.current.value = "";
  }

  async function remove(key: string) {
    setBusy(true);
    const res = await removeListingPhoto(listingId, key);
    setBusy(false);
    if (res.error) { setError(res.error.message); return; }
    onChange(res.data.images, res.data.urls);
  }

  return (
    <div className="photos">
      <div className="photo-grid">
        {urls.map((url, i) => (
          <div key={images[i]} className="photo">
            <SafeImage src={url} alt={`Photograph ${i + 1}`} />
            {/* Order is meaningful, so the one every card shows is labelled
                rather than left for a host to work out. */}
            {i === 0 && <span className="photo-badge">Cover</span>}
            <button
              className="photo-remove" onClick={() => remove(images[i])} disabled={busy}
              aria-label={`Remove photograph ${i + 1}`}
            >✕</button>
          </div>
        ))}

        <label className={`photo-add ${busy ? "busy" : ""}`}>
          <input
            ref={input} type="file" multiple
            accept="image/jpeg,image/png,image/webp,image/avif"
            disabled={busy}
            onChange={(e) => e.target.files?.length && upload(e.target.files)}
          />
          <span aria-hidden="true">＋</span>
          <span className="photo-add-label">
            {progress ? `Uploading ${progress.done + 1} of ${progress.total}…` : "Add photographs"}
          </span>
        </label>
      </div>

      {error && <p className="book-note bad">{error}</p>}

      {images.length === 0 && !error && (
        <p className="withheld small">
          JPEG, PNG, WebP or AVIF, up to 10 MB each. The first is the one that appears on every card.
        </p>
      )}
    </div>
  );
}
