"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageUpIcon, Trash2Icon, UserRoundIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FieldDescription, FieldError } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

import { removeStudentPhotoAction } from "../../../enrol-actions";
import { ConfirmFix } from "../../confirm-fix";

const WIDTH = 300;
const HEIGHT = 400;
const MAX_BYTES = 100 * 1024;

/**
 * Crops a photo to a 3 by 4 passport shape and shrinks it to about 300 by 400
 * as a JPEG under 100 KB (spec 0008, AC-7). Re-drawing it also drops phone
 * photo metadata such as location. Faces sit high in a photo, so the crop does too.
 */
async function preparePassport(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  let sw = bitmap.width;
  let sh = bitmap.height;
  if (sw / sh > WIDTH / HEIGHT) sw = Math.round((sh * WIDTH) / HEIGHT);
  else sh = Math.round((sw * HEIGHT) / WIDTH);
  const sx = Math.round((bitmap.width - sw) / 2);
  const sy = Math.round((bitmap.height - sh) * 0.3);
  const scale = Math.min(1, WIDTH / sw);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(120, Math.round(sw * scale));
  canvas.height = Math.max(160, Math.round(sh * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser can't prepare photos.");
  context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.85, 0.7, 0.55, 0.4]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= MAX_BYTES) return blob;
  }
  throw new Error("Couldn't make the photo small enough.");
}

export function PassportPhoto({ schoolId, studentId, assetId, name }: { schoolId: string; studentId: string; assetId: string | null; name: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [removing, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const shown = preview ?? (assetId ? `/admin/schools/${schoolId}/images/${assetId}` : null);

  async function upload(file: File) {
    setError(null);
    if (!/^image\/(png|jpe?g|webp|heic|heif)$/.test(file.type)) {
      setError("Choose a JPG, PNG or WebP photo.");
      return;
    }
    setBusy(true);
    try {
      const prepared = await preparePassport(file);
      const form = new FormData();
      form.set("kind", "student_photo");
      form.set("studentId", studentId);
      form.set("file", prepared, "photo.jpg");
      const response = await fetch(`/admin/schools/${schoolId}/images`, { method: "POST", body: form });
      const result = (await response.json().catch(() => null)) as { ok: boolean; error?: string } | null;
      if (!result?.ok) {
        setError(result?.error ?? "Upload failed. Check your connection and try again.");
        return;
      }
      setPreview(URL.createObjectURL(prepared));
      toast.add({ title: "Photo saved", type: "success" });
      router.refresh();
    } catch {
      setError("That photo couldn't be read. Try a different one.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function remove() {
    setConfirmRemove(false);
    start(async () => {
      const result = await removeStudentPhotoAction(schoolId, studentId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPreview(null);
      toast.add({ title: "Photo removed", type: "success" });
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="panel-photo" className="flex flex-col gap-3">
      <h3 id="panel-photo" className="type-heading">
        Photo
      </h3>
      <div className="flex items-start gap-4">
        <div className="flex aspect-[3/4] w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-input bg-muted">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element -- our own private image route, already sized
            <img src={shown} alt={`Passport photo of ${name}`} className="size-full object-cover" />
          ) : (
            <UserRoundIcon aria-hidden="true" className="size-10 text-muted-foreground/60" />
          )}
        </div>
        <div className="flex flex-col items-start gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            aria-label={`Photo of ${name}`}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <Button type="button" variant="outline" disabled={busy || removing} onClick={() => inputRef.current?.click()}>
            {busy ? <Spinner data-icon="inline-start" /> : <ImageUpIcon data-icon="inline-start" />}
            {busy ? "Uploading" : shown ? "Replace photo" : "Add photo"}
          </Button>
          {shown && !busy && (
            <Button type="button" variant="ghost" size="sm" disabled={removing} onClick={() => setConfirmRemove(true)} className="text-destructive hover:text-destructive">
              {removing ? <Spinner data-icon="inline-start" /> : <Trash2Icon data-icon="inline-start" />}
              Remove photo
            </Button>
          )}
          {error ? <FieldError>{error}</FieldError> : <FieldDescription>Cropped to passport shape for you. Only the VoxLMS team sees photos.</FieldDescription>}
        </div>
      </div>
      <ConfirmFix
        confirm={confirmRemove ? { title: `Remove ${name}’s photo?`, description: "The photo is deleted. You can add a new one at any time.", action: "Remove photo", removes: true } : null}
        onConfirm={remove}
        onCancel={() => setConfirmRemove(false)}
      />
    </section>
  );
}
