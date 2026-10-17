"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DoorOpenIcon,
  EllipsisVerticalIcon,
  EyeIcon,
  KeyRoundIcon,
  LogOutIcon,
  PencilIcon,
  PhoneIcon,
  PowerIcon,
  UndoIcon,
  UserPlusIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { formatNigerianPhone } from "@/lib/phone";

import { changePhoneAction, createLoginAction, setLoginEnabledAction, signOutEverywhereAction, startViewAsAction } from "../../../actions";
import { saveTeacherAction, setStaffLeftAction } from "../../enrol-actions";
import { ConfirmFix, type FixConfirm } from "../confirm-fix";
import { PasswordDialog, SamePersonDialog, SetupLinkDialog, useLoginActions } from "./login-dialogs";
import { TITLES } from "./titles";

type Props = {
  schoolId: string;
  staffId: string;
  userId: string | null;
  title: string | null;
  fullName: string;
  phone: string;
  loginStatus: "none" | "waiting" | "active" | "off";
  isSelf: boolean;
  isTeam: boolean;
  active: boolean;
  /** Classes they head this session, named in the "Mark as left" confirm (spec 0008, AC-3). */
  classes: string[];
};

/** One staff member's menu: their record (spec 0008, AC-2, AC-3) and their login (spec 0004, AC-9, AC-13). */
export function StaffActions(props: Props) {
  const router = useRouter();
  const name = [props.title, props.fullName].filter(Boolean).join(" ");
  const login = useLoginActions();
  const { dialog, setDialog, run, sendLink } = login;
  const [busy, start] = useTransition();
  const pending = login.pending || busy;
  const [open, setOpen] = useState<"none" | "edit" | "phone" | "leave">("none");
  const [error, setError] = useState<{ field: string; error: string } | null>(null);

  const createLogin = (confirm: boolean) =>
    run(
      () => createLoginAction(props.schoolId, props.staffId, confirm),
      (r) => {
        setDialog({ kind: "none" });
        toast.add({ title: `Login created for ${name}`, description: "Now send them a setup link.", type: "success" });
        sendLink(r.userId, "first", name);
      },
    );

  function saveDetails(form: FormData) {
    start(async () => {
      const result = await saveTeacherAction(props.schoolId, props.staffId, {
        title: String(form.get("title") ?? ""),
        fullName: String(form.get("fullName") ?? ""),
        phone: props.userId ? undefined : String(form.get("phone") ?? ""),
      });
      if (!result.ok) {
        setError({ field: result.field, error: result.error });
        return;
      }
      setOpen("none");
      toast.add({ title: "Teacher saved", type: "success" });
      router.refresh();
    });
  }

  function setLeft(left: boolean) {
    setOpen("none");
    start(async () => {
      const result = await setStaffLeftAction(props.schoolId, props.staffId, left);
      if (!result.ok) {
        toast.add({ title: result.error, type: "error" });
        return;
      }
      if (!left) toast.add({ title: `${name} is active again`, description: props.loginStatus === "off" ? "Their login is still off. Switch it back on from this menu." : undefined, type: "success" });
      else {
        const details = [
          "unassigned" in result && result.unassigned.length > 0 ? `No longer form master of ${result.unassigned.join(", ")}.` : null,
          "loginOff" in result && result.loginOff ? "Their login is switched off." : null,
        ].filter(Boolean);
        toast.add({ title: `${name} is marked as left`, description: details.join(" ") || undefined, type: "success" });
      }
      router.refresh();
    });
  }

  const leaveConfirm: FixConfirm = {
    title: `Mark ${name} as left?`,
    description:
      props.classes.length > 0
        ? `${props.classes.map((c) => `${c} will have no form master`).join(". ")}. Earlier sessions stay as they were.`
        : "Earlier sessions stay as they were.",
    action: "Mark as left",
    removes: true,
  };

  const userId = props.userId;
  const canViewAs = props.loginStatus === "active" && props.active && !props.isTeam && !props.isSelf;
  const fieldError = (field: string) => (error?.field === field ? error.error : null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label={`Options for ${name}`} disabled={pending} />}>
          {pending ? <Spinner /> : <EllipsisVerticalIcon />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-60">
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={() => {
                setError(null);
                setOpen("edit");
              }}
            >
              <PencilIcon />
              Edit details
            </DropdownMenuItem>
            {props.active ? (
              !props.isSelf && (
                <DropdownMenuItem variant="destructive" onClick={() => setOpen("leave")}>
                  <DoorOpenIcon />
                  Mark as left
                </DropdownMenuItem>
              )
            ) : (
              <DropdownMenuItem onClick={() => setLeft(false)}>
                <UndoIcon />
                Mark as active again
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Login</DropdownMenuLabel>
            {props.loginStatus === "none" && (
              <DropdownMenuItem onClick={() => createLogin(false)}>
                <UserPlusIcon />
                Create login
              </DropdownMenuItem>
            )}
            {userId && props.loginStatus !== "off" && (
              <DropdownMenuItem onClick={() => sendLink(userId, props.loginStatus === "waiting" ? "first" : "reset", name)}>
                <KeyRoundIcon />
                {props.loginStatus === "waiting" ? "Send setup link" : "Send new password link"}
              </DropdownMenuItem>
            )}
            {canViewAs && (
              <DropdownMenuItem onClick={() => run(() => startViewAsAction(userId!, props.schoolId), () => {})}>
                <EyeIcon />
                View as {name.split(" ").slice(-2).join(" ")}
              </DropdownMenuItem>
            )}
            {userId && !props.isSelf && (
              <>
                {props.loginStatus !== "off" && (
                  <DropdownMenuItem onClick={() => setOpen("phone")}>
                    <PhoneIcon />
                    Change phone number
                  </DropdownMenuItem>
                )}
                {props.loginStatus === "active" && (
                  <DropdownMenuItem onClick={() => run(() => signOutEverywhereAction(userId), () => toast.add({ title: `${name} is signed out everywhere`, type: "success" }))}>
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
              </>
            )}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <PasswordDialog dialog={dialog} setDialog={setDialog} />
      <SamePersonDialog dialog={dialog} setDialog={setDialog} name={name} pending={pending} onConfirm={() => createLogin(true)} />
      <SetupLinkDialog dialog={dialog} setDialog={setDialog} />
      <ConfirmFix confirm={open === "leave" ? leaveConfirm : null} onConfirm={() => setLeft(true)} onCancel={() => setOpen("none")} />

      <Dialog open={open === "edit"} onOpenChange={(o) => !o && setOpen("none")}>
        <DialogContent className="sm:max-w-md">
          <form action={saveDetails}>
            <DialogHeader>
              <DialogTitle>Edit {name}</DialogTitle>
              <DialogDescription>Fix a misspelt name or title. It changes what they see after signing in too.</DialogDescription>
            </DialogHeader>
            <FieldGroup className="py-5">
              <div className="grid gap-5 sm:grid-cols-[7rem_1fr]">
                <Field data-invalid={fieldError("title") ? true : undefined}>
                  <FieldLabel htmlFor={`title-${props.staffId}`}>Title</FieldLabel>
                  <Input id={`title-${props.staffId}`} name="title" defaultValue={props.title ?? ""} list="staff-titles" maxLength={20} aria-invalid={!!fieldError("title")} />
                  {fieldError("title") && <FieldError>{fieldError("title")}</FieldError>}
                </Field>
                <Field data-invalid={fieldError("fullName") ? true : undefined}>
                  <FieldLabel htmlFor={`name-${props.staffId}`}>Full name</FieldLabel>
                  <Input id={`name-${props.staffId}`} name="fullName" defaultValue={props.fullName} required minLength={3} maxLength={80} aria-invalid={!!fieldError("fullName")} />
                  {fieldError("fullName") && <FieldError>{fieldError("fullName")}</FieldError>}
                </Field>
              </div>
              <Field data-invalid={fieldError("phone") ? true : undefined}>
                <FieldLabel htmlFor={`phone-${props.staffId}`}>Phone number</FieldLabel>
                {props.userId ? (
                  <>
                    <Input id={`phone-${props.staffId}`} value={formatNigerianPhone(props.phone)} readOnly disabled className="type-figure" />
                    <FieldDescription>They sign in with this number, so it changes through “Change phone number” in their menu.</FieldDescription>
                  </>
                ) : (
                  <Input id={`phone-${props.staffId}`} name="phone" type="tel" inputMode="tel" defaultValue={formatNigerianPhone(props.phone)} required className="type-figure" aria-invalid={!!fieldError("phone")} />
                )}
                {fieldError("phone") && <FieldError>{fieldError("phone")}</FieldError>}
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen("none")}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {busy && <Spinner data-icon="inline-start" />}
                Save teacher
              </Button>
            </DialogFooter>
          </form>
          <datalist id="staff-titles">
            {TITLES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </DialogContent>
      </Dialog>

      <Dialog open={open === "phone"} onOpenChange={(o) => !o && setOpen("none")}>
        <DialogContent>
          <form
            action={(formData) => {
              const phone = String(formData.get("phone") ?? "");
              run(
                () => changePhoneAction(userId!, phone),
                () => {
                  setOpen("none");
                  toast.add({ title: "Phone number changed", description: "They are signed out everywhere. Send a new password link.", type: "success" });
                },
              );
            }}
          >
            <DialogHeader>
              <DialogTitle>Change {name}’s phone number</DialogTitle>
              <DialogDescription>It changes at every school they work in. They will be signed out everywhere and sign in with the new number.</DialogDescription>
            </DialogHeader>
            <FieldGroup className="py-5">
              <Field>
                <FieldLabel htmlFor={`new-phone-${props.staffId}`}>New phone number</FieldLabel>
                <Input id={`new-phone-${props.staffId}`} name="phone" type="tel" inputMode="tel" required className="type-figure" />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen("none")}>
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
