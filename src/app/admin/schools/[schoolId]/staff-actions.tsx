"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CopyIcon,
  EllipsisVerticalIcon,
  EyeIcon,
  KeyRoundIcon,
  LogOutIcon,
  PhoneIcon,
  PowerIcon,
  UserPlusIcon,
} from "lucide-react";

import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

import {
  type AdminResult,
  changePhoneAction,
  confirmPasswordAction,
  createLoginAction,
  makeSetupLinkAction,
  type SetupLinkView,
  setLoginEnabledAction,
  signOutEverywhereAction,
  startViewAsAction,
} from "../../actions";

type Props = {
  schoolId: string;
  staffId: string;
  userId: string | null;
  name: string;
  loginStatus: "none" | "waiting" | "active" | "off";
  isSelf: boolean;
  isTeam: boolean;
  active: boolean;
};

type Dialogs =
  | { kind: "none" }
  | { kind: "password"; retry: () => Promise<void>; error?: string }
  | { kind: "existing"; existing: { name: string; schools: string[] } }
  | { kind: "link"; link: SetupLinkView }
  | { kind: "phone"; error?: string };

const lagos = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short", hour12: true, timeZone: "Africa/Lagos" });

export function StaffActions(props: Props) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialogs>({ kind: "none" });
  const [pending, start] = useTransition();

  /** Runs an action; asks for the team member's password first if it has gone stale. */
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

  const createLogin = (confirm: boolean) =>
    run(
      () => createLoginAction(props.schoolId, props.staffId, confirm),
      (r) => {
        setDialog({ kind: "none" });
        toast.add({ title: `Login created for ${props.name}`, description: "Now send them a setup link.", type: "success" });
        sendLink("first", r.userId);
      },
    );

  const sendLink = (kind: "first" | "reset", userId = props.userId) => {
    if (!userId) return;
    run(() => makeSetupLinkAction(userId, kind), (r) => setDialog({ kind: "link", link: r.link }));
  };

  const userId = props.userId;
  const canViewAs = props.loginStatus === "active" && props.active && !props.isTeam && !props.isSelf;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label={`Login options for ${props.name}`} disabled={pending} />}>
          {pending ? <Spinner /> : <EllipsisVerticalIcon />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-60">
          <DropdownMenuGroup>
            {props.loginStatus === "none" && (
              <DropdownMenuItem onClick={() => createLogin(false)}>
                <UserPlusIcon />
                Create login
              </DropdownMenuItem>
            )}
            {userId && props.loginStatus !== "off" && (
              <DropdownMenuItem onClick={() => sendLink(props.loginStatus === "waiting" ? "first" : "reset")}>
                <KeyRoundIcon />
                {props.loginStatus === "waiting" ? "Send setup link" : "Send new password link"}
              </DropdownMenuItem>
            )}
            {canViewAs && (
              <DropdownMenuItem onClick={() => run(() => startViewAsAction(userId!, props.schoolId), () => {})}>
                <EyeIcon />
                View as {props.name.split(" ").slice(-2).join(" ")}
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          {userId && !props.isSelf && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                {props.loginStatus !== "off" && (
                  <DropdownMenuItem onClick={() => setDialog({ kind: "phone" })}>
                    <PhoneIcon />
                    Change phone number
                  </DropdownMenuItem>
                )}
                {props.loginStatus === "active" && (
                  <DropdownMenuItem
                    onClick={() =>
                      run(() => signOutEverywhereAction(userId), () => toast.add({ title: `${props.name} is signed out everywhere`, type: "success" }))
                    }
                  >
                    <LogOutIcon />
                    Sign out everywhere
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  variant={props.loginStatus === "off" ? "default" : "destructive"}
                  onClick={() =>
                    run(
                      () => setLoginEnabledAction(userId, props.loginStatus === "off"),
                      () => toast.add({ title: props.loginStatus === "off" ? "Login switched back on" : "Login switched off", type: "success" }),
                    )
                  }
                >
                  <PowerIcon />
                  {props.loginStatus === "off" ? "Switch login back on" : "Switch login off"}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <PasswordDialog dialog={dialog} setDialog={setDialog} />

      <Dialog open={dialog.kind === "existing"} onOpenChange={(open) => !open && setDialog({ kind: "none" })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>This phone number already has a login</DialogTitle>
            <DialogDescription>
              {dialog.kind === "existing" &&
                `It belongs to ${dialog.existing.name}${dialog.existing.schools.length ? ` at ${dialog.existing.schools.join(" and ")}` : ""}. Link it only if ${props.name} is that same person.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ kind: "none" })}>
              Cancel
            </Button>
            <Button disabled={pending} onClick={() => createLogin(true)}>
              Same person, link it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog.kind === "link"} onOpenChange={(open) => !open && setDialog({ kind: "none" })}>
        <DialogContent className="sm:max-w-md">
          {dialog.kind === "link" && (
            <>
              <DialogHeader>
                <DialogTitle>{dialog.link.kind === "first" ? "Setup link" : "New password link"} for {props.name}</DialogTitle>
                <DialogDescription>
                  In person: they scan this with their phone camera. Otherwise, send it on WhatsApp to their own number.
                  It works once, until {lagos.format(new Date(dialog.link.expiresAt))}.
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

      <Dialog open={dialog.kind === "phone"} onOpenChange={(open) => !open && setDialog({ kind: "none" })}>
        <DialogContent>
          <form
            action={(formData) => {
              const phone = String(formData.get("phone") ?? "");
              run(
                () => changePhoneAction(userId!, phone),
                () => {
                  setDialog({ kind: "none" });
                  toast.add({ title: "Phone number changed", description: "They are signed out everywhere. Send a new password link.", type: "success" });
                },
              );
            }}
          >
            <DialogHeader>
              <DialogTitle>Change {props.name}’s phone number</DialogTitle>
              <DialogDescription>They will be signed out everywhere and sign in with the new number.</DialogDescription>
            </DialogHeader>
            <FieldGroup className="py-5">
              <Field>
                <FieldLabel htmlFor="new-phone">New phone number</FieldLabel>
                <Input id="new-phone" name="phone" type="tel" inputMode="tel" required className="type-figure" />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog({ kind: "none" })}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                Change number
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PasswordDialog({ dialog, setDialog }: { dialog: Dialogs; setDialog: (d: Dialogs) => void }) {
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
