"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CopyIcon } from "lucide-react";

import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

import { type AdminResult, confirmPasswordAction, makeSetupLinkAction, type SetupLinkView } from "../../../actions";

// The login dialogs shared by the Staff page's add form and each teacher's
// menu (spec 0004, AC-9 and AC-13; spec 0008, AC-1).

export type LoginDialog =
  | { kind: "none" }
  | { kind: "password"; retry: () => Promise<void>; error?: string }
  | { kind: "existing"; existing: { name: string; schools: string[]; off?: boolean } }
  | { kind: "link"; link: SetupLinkView; name: string };

const lagos = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short", hour12: true, timeZone: "Africa/Lagos" });

/**
 * Runs a team action; asks for the team member's password first when it has
 * gone stale, then retries. Shows the "same person?" and setup link dialogs.
 */
export function useLoginActions() {
  const router = useRouter();
  const [dialog, setDialog] = useState<LoginDialog>({ kind: "none" });
  const [pending, start] = useTransition();

  function run<T>(action: () => Promise<AdminResult<T>>, onOk: (result: { ok: true } & T) => void) {
    const attempt = async () => {
      const result = await action();
      if (result.ok) {
        setDialog((d) => (d.kind === "password" ? { kind: "none" } : d));
        onOk(result);
        router.refresh();
      } else if ("needPassword" in result) {
        setDialog({ kind: "password", retry: attempt });
      } else if (result.confirm) {
        setDialog({ kind: "existing", existing: result.confirm });
      } else {
        toast.add({ title: result.error, type: "error" });
      }
    };
    start(attempt);
  }

  /** Makes a one time setup link and shows it as a QR code and a WhatsApp button. */
  function sendLink(userId: string, kind: "first" | "reset", name: string) {
    run(() => makeSetupLinkAction(userId, kind), (r) => setDialog({ kind: "link", link: r.link, name }));
  }

  return { dialog, setDialog, pending, run, sendLink };
}

export function PasswordDialog({ dialog, setDialog }: { dialog: LoginDialog; setDialog: (d: LoginDialog) => void }) {
  const [pending, start] = useTransition();
  return (
    <Dialog open={dialog.kind === "password"} onOpenChange={(open) => !open && setDialog({ kind: "none" })}>
      <DialogContent>
        {dialog.kind === "password" && (
          <form
            action={(formData) =>
              start(async () => {
                const result = await confirmPasswordAction(String(formData.get("password") ?? ""));
                if (!result.ok) {
                  setDialog({ ...dialog, error: "error" in result ? result.error : "Try again." });
                  return;
                }
                await dialog.retry();
              })
            }
          >
            <DialogHeader>
              <DialogTitle>Confirm it’s you</DialogTitle>
              <DialogDescription>Type your own VoxLMS password. You won’t be asked again for 15 minutes.</DialogDescription>
            </DialogHeader>
            <FieldGroup className="py-5">
              <Field data-invalid={dialog.error ? true : undefined}>
                <FieldLabel htmlFor="confirm-password">Your password</FieldLabel>
                <PasswordInput id="confirm-password" name="password" autoComplete="current-password" invalid={!!dialog.error} />
                {dialog.error && <FieldError>{dialog.error}</FieldError>}
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending && <Spinner data-icon="inline-start" />}
                Confirm
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** "This phone number already has a login" (spec 0004, AC-13), saying so when that login is switched off. */
export function SamePersonDialog({
  dialog,
  setDialog,
  name,
  pending,
  onConfirm,
}: {
  dialog: LoginDialog;
  setDialog: (d: LoginDialog) => void;
  name: string;
  pending: boolean;
  onConfirm: () => void;
}) {
  const existing = dialog.kind === "existing" ? dialog.existing : null;
  return (
    <Dialog open={existing !== null} onOpenChange={(open) => !open && setDialog({ kind: "none" })}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>This phone number already has a login</DialogTitle>
          <DialogDescription>
            {existing &&
              `It belongs to ${existing.name}${existing.schools.length ? ` at ${existing.schools.join(" and ")}` : ""}. Link it only if ${name} is that same person.`}
          </DialogDescription>
        </DialogHeader>
        {existing?.off && (
          <p className="rounded-lg border border-warning/30 bg-warning-wash p-3 type-caption text-foreground">
            That login is switched off. It stays off until you switch it back on from {name}’s menu.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setDialog({ kind: "none" })}>
            Cancel
          </Button>
          <Button disabled={pending} onClick={onConfirm}>
            {pending && <Spinner data-icon="inline-start" />}
            Same person, link it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SetupLinkDialog({ dialog, setDialog }: { dialog: LoginDialog; setDialog: (d: LoginDialog) => void }) {
  return (
    <Dialog open={dialog.kind === "link"} onOpenChange={(open) => !open && setDialog({ kind: "none" })}>
      <DialogContent className="sm:max-w-md">
        {dialog.kind === "link" && (
          <>
            <DialogHeader>
              <DialogTitle>
                {dialog.link.kind === "first" ? "Setup link" : "New password link"} for {dialog.name}
              </DialogTitle>
              <DialogDescription>
                In person: they scan this with their phone camera. Otherwise, send it on WhatsApp to their own number. It works once, until{" "}
                {lagos.format(new Date(dialog.link.expiresAt))}.
              </DialogDescription>
            </DialogHeader>
            <div
              className="mx-auto w-56 rounded-lg border border-rule bg-white p-2 [&_svg]:h-auto [&_svg]:w-full"
              role="img"
              aria-label="QR code for the setup link"
              // QR SVG generated on our server from our own link; no user content.
              dangerouslySetInnerHTML={{ __html: dialog.link.qrSvg }}
            />
            <DialogFooter className="sm:justify-between">
              <Button
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(dialog.link.url);
                  toast.add({ title: "Link copied", type: "success" });
                }}
              >
                <CopyIcon data-icon="inline-start" />
                Copy link
              </Button>
              <Button nativeButton={false} render={<a href={dialog.link.whatsappUrl} target="_blank" rel="noreferrer" />}>
                Send on WhatsApp
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
