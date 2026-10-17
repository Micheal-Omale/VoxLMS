"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUpIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FieldDescription, FieldError } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

import { ConfirmFix, type FixConfirm } from "./confirm-fix";

const MAX_WIDTH = 600;

/**
 * Shrinks an image to at most 600px wide and re-draws it as a PNG (which also
 * drops phone photo metadata such as location). For signatures, near-white
 * paper becomes transparent so the signature sits cleanly on the report card.
 */
async function prepareImage(file: File, kind: "logo" | "signature"): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: kind === "signature" });
  if (!context) throw new Error("This browser can't prepare images.");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  if (kind === "signature") {
    const pixels = context.getImageData(0, 0, width, height);
    const d = pixels.data;
    for (let i = 0; i < d.length; i += 4) {
      const lightness = (d[i] + d[i + 1] + d[i + 2]) / 3;
      // Paper (light) fades out; ink (dark) stays, with a soft edge.
      if (lightness > 200) d[i + 3] = 0;
      else if (lightness > 150) d[i + 3] = Math.round(((200 - lightness) / 50) * d[i + 3]);
    }
    context.putImageData(pixels, 0, 0);
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't prepare the image."))), "image/png"),
  );
}

/** Whose signature an upload is (spec 0007): the school's principal, or one section's own head. */
export type SignatureOwner = { signer: "principal" } | { signer: "section"; sectionId: string };

export function ImageUpload({
  schoolId,
  kind,
  owner,
  currentUrl,
  label,
  hint,
  confirmReplace,
}: {
  schoolId: string;
  kind: "logo" | "signature";
  /** Required for a signature. */
  owner?: SignatureOwner;
  currentUrl: string | null;
  label: string;
  hint: string;
  /** Asked before replacing an image that is already there (spec 0007, AC-2 and AC-3). */
  confirmReplace?: FixConfirm;
}) {
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<File | null>(null);
  const shown = preview ?? currentUrl;

  function choose(file: File) {
    setError(null);
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      setError("Choose a JPG, PNG or WebP image.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    // Setting an image for the first time needs no confirm.
    if (confirmReplace && shown) setWaiting(file);
    else void upload(file);
  }

  async function upload(file: File) {
    setWaiting(null);
    setBusy(true);
    try {
      const prepared = await prepareImage(file, kind);
      const form = new FormData();
      form.set("kind", kind);
      if (owner) {
        form.set("signer", owner.signer);
        if (owner.signer === "section") form.set("sectionId", owner.sectionId);
      }
      form.set("file", prepared, `${kind}.png`);
      const response = await fetch(`/admin/schools/${schoolId}/images`, { method: "POST", body: form });
      const result = (await response.json().catch(() => null)) as { ok: boolean; error?: string } | null;
      if (!result?.ok) {
        setError(result?.error ?? "Upload failed. Check your connection and try again.");
        return;
      }
      setPreview(URL.createObjectURL(prepared));
      toast.add({ title: kind === "logo" ? "Logo saved" : "Signature saved", type: "success" });
      router.refresh();
    } catch {
      setError("That image couldn't be read. Try a different photo.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="type-label">{label}</span>
      <div className="flex flex-wrap items-center gap-4">
        <div
          className={`flex h-24 w-40 items-center justify-center overflow-hidden rounded-lg border border-dashed border-input ${
            kind === "signature" ? "bg-[repeating-linear-gradient(0deg,var(--card)_0_23px,var(--rule)_23px_24px)]" : "bg-card"
          }`}
        >
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element -- our own image routes, already sized
            <img src={shown} alt={`Current ${label.toLowerCase()}`} className="max-h-full max-w-full object-contain p-1" />
          ) : (
            <span className="type-caption text-muted-foreground">{kind === "signature" ? "No signature yet" : "None yet"}</span>
          )}
        </div>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) choose(file);
          }}
        />
        <Button type="button" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? <Spinner data-icon="inline-start" /> : <ImageUpIcon data-icon="inline-start" />}
          {busy ? "Uploading" : shown ? "Replace" : "Upload"}
        </Button>
      </div>
      {error ? <FieldError>{error}</FieldError> : <FieldDescription>{hint}</FieldDescription>}
      <ConfirmFix
        confirm={waiting ? (confirmReplace ?? null) : null}
        onConfirm={() => waiting && void upload(waiting)}
        onCancel={() => {
          setWaiting(null);
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
    </div>
  );
}
