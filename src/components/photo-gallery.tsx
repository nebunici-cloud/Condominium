"use client";

import { useState } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export type GalleryPhoto = { url: string; alt: string };

// Thumbnail row that opens the full image in an in-page lightbox
// instead of navigating to the raw signed URL in a new tab. Used for
// both the reporter's photos and the staff resolution photos.
export function PhotoGallery({
  photos,
  thumbClassName = "size-20 rounded-md border object-cover",
}: {
  photos: GalleryPhoto[];
  thumbClassName?: string;
}) {
  const [active, setActive] = useState<GalleryPhoto | null>(null);

  if (photos.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {photos.map((photo) => (
          <button
            key={photo.url}
            type="button"
            onClick={() => setActive(photo)}
            className="cursor-zoom-in rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt={photo.alt} className={thumbClassName} />
          </button>
        ))}
      </div>
      <Dialog open={active !== null} onOpenChange={(open) => !open && setActive(null)}>
        <DialogContent className="max-w-3xl p-2">
          <DialogTitle className="sr-only">{active?.alt ?? ""}</DialogTitle>
          {active && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={active.url}
              alt={active.alt}
              className="max-h-[80vh] w-full rounded object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
