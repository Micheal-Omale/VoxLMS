"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { CircleAlertIcon, CircleCheckIcon, CloudOffIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

// The save pattern shared by the score sheet (spec 0009) and the Remarks
// sheet (spec 0011): the request timeout, offline detection and the times
// shown in Lagos time.

/** A request with no reply after this long counts as failed, so Save can be tried again (spec 0009, AC-5). */
export const SAVE_TIMEOUT_MS = 20_000;

export const lagosTime = new Intl.DateTimeFormat("en-NG", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Lagos" });
export const lagosDay = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });

export type RequestFailure = { kind: "failed" } | { kind: "updated" };

/** Waits for a save, but no longer than the timeout; a request that breaks is "failed" or "updated". */
export async function settle<T>(request: Promise<T>): Promise<T | RequestFailure> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<RequestFailure>((resolve) => {
    timer = setTimeout(() => resolve({ kind: "failed" }), SAVE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([request, timeout]);
  } catch (error) {
    // Next answers "Server Action unavailable." when the app was deployed since the page loaded.
    const message = error instanceof Error ? error.message : "";
    return /server action/i.test(message) ? { kind: "updated" } : { kind: "failed" };
  } finally {
    clearTimeout(timer);
  }
}

/** "3:14 pm" today, or "12 Oct at 3:14 pm" on an earlier day, in Lagos time. */
export function LagosTime({ iso }: { iso: string }) {
  const date = new Date(iso);
  const today = lagosDay.format(new Date()) === lagosDay.format(date);
  return (
    <>
      {today ? "" : `${lagosDay.format(date)} at `}
      <time dateTime={iso} suppressHydrationWarning>
        {lagosTime.format(date)}
      </time>
    </>
  );
}

/** "Saved at 3:14 pm" today, or "Saved 12 Oct at 3:14 pm" on an earlier day, in Lagos time. */
export function SavedAt({ iso }: { iso: string }) {
  const date = new Date(iso);
  const today = lagosDay.format(new Date()) === lagosDay.format(date);
  return (
    <>
      Saved {today ? "" : `${lagosDay.format(date)} `}at{" "}
      <time dateTime={iso} suppressHydrationWarning>
        {lagosTime.format(date)}
      </time>
    </>
  );
}

export function ReloadButton() {
  return (
    <Button size="lg" onClick={() => window.location.reload()} className="shrink-0">
      Reload page
    </Button>
  );
}

export type SaveStatus = "idle" | "saving" | "saved" | "failed" | "updated" | "signedOut" | "invalid";

/** What a sheet saves, for the bar's words: "score", "scores", "No scores entered yet". */
export type SaveNoun = { one: string; many: string; empty: string };

type SaveBarProps = {
  noun: SaveNoun;
  changedCount: number;
  conflictCount: number;
  toFix: number;
  status: SaveStatus;
  online: boolean;
  savedAt: string | null;
  canRetry: boolean;
  onSave: () => void;
};

/** The sticky bar at the foot of a sheet: what is unsaved or wrong, and the one Save button (spec 0009, AC-5). */
export function SaveBar({ noun, changedCount, conflictCount, toFix, status, online, savedAt, canRetry, onSave }: SaveBarProps) {
  const clean = changedCount === 0 && !canRetry;
  const saving = status === "saving";
  let tone: "quiet" | "warning" | "error" | "success" = "quiet";
  let icon: React.ReactNode = null;
  let message: React.ReactNode;
  let action: React.ReactNode = null;
  const alertIcon = <CircleAlertIcon aria-hidden="true" className="size-4 shrink-0" />;

  if (saving) {
    message = `Saving ${noun.many}…`;
  } else if (!online && !clean) {
    tone = "warning";
    icon = <CloudOffIcon aria-hidden="true" className="size-4 shrink-0" />;
    message = `You are offline. Your ${noun.many} are kept on this phone until you can save.`;
  } else if (status === "updated") {
    tone = "error";
    icon = alertIcon;
    message = `VoxLMS was updated. Reload the page; your ${noun.many} are kept on this phone.`;
    action = <ReloadButton />;
  } else if (status === "signedOut") {
    tone = "error";
    icon = alertIcon;
    message = `You were signed out. Sign in again; your ${noun.many} are kept on this phone.`;
    action = (
      <Button size="lg" nativeButton={false} render={<Link href="/login" />} className="shrink-0">
        Sign in
      </Button>
    );
  } else if (status === "invalid") {
    tone = "error";
    icon = alertIcon;
    message = `Something in this save didn't match the sheet. Reload the page; your ${noun.many} are kept on this phone.`;
    action = <ReloadButton />;
  } else if (status === "failed") {
    tone = "error";
    icon = alertIcon;
    message = `Couldn't save. Your ${noun.many} are kept on this phone. Try again.`;
  } else if (conflictCount > 0) {
    tone = "warning";
    message = `Someone else saved ${noun.many} for ${conflictCount} ${conflictCount === 1 ? "student" : "students"} first. Choose Keep mine or Use saved to save.`;
  } else if (toFix > 0) {
    tone = "error";
    icon = alertIcon;
    message = `${toFix} ${toFix === 1 ? `${noun.one} needs` : `${noun.many} need`} fixing before you can save.`;
  } else if (changedCount > 0) {
    tone = "warning";
    message = `${changedCount} ${changedCount === 1 ? "student" : "students"} changed, not saved yet`;
  } else if (savedAt) {
    tone = "success";
    icon = <CircleCheckIcon aria-hidden="true" className="size-4 shrink-0" />;
    message = <SavedAt iso={savedAt} />;
  } else {
    message = noun.empty;
  }

  return (
    <div className="sticky bottom-0 z-20 mt-4 border-t border-rule bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:rounded-t-xl sm:border-x sm:bg-card/95 sm:px-4">
      <div className="flex items-center gap-3">
        <p
          aria-live="polite"
          className={cn(
            "flex min-w-0 flex-1 items-start gap-2 type-caption sm:items-center sm:text-[0.9375rem]",
            tone === "quiet" && "text-muted-foreground",
            tone === "warning" && "text-warning",
            tone === "error" && "font-semibold text-destructive",
            tone === "success" && "text-success",
          )}
        >
          {tone === "warning" && !icon && <span aria-hidden="true" className="mt-1 size-2 shrink-0 rounded-full bg-warning sm:mt-0" />}
          {icon && <span className="mt-px sm:mt-0">{icon}</span>}
          <span>{message}</span>
        </p>
        {action ?? (
          <Button size="lg" onClick={onSave} disabled={saving || clean || !online || conflictCount > 0} className="shrink-0">
            {saving && <Spinner data-icon="inline-start" />}
            {saving ? "Saving" : status === "failed" ? "Try again" : `Save ${noun.many}`}
          </Button>
        )}
      </div>
    </div>
  );
}

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function useOnline() {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}
