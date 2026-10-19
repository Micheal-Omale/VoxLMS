import { Suspense } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";

import { Logo } from "@/components/brand/logo";
import { Skeleton } from "@/components/ui/skeleton";
import { PinKeyMissing } from "@/server/data/errors";
import { loadPinResult, pinMessage } from "@/server/data/pin-results";
import { readResultCookie } from "@/server/result-pin/crypto";

import { RESULT_COOKIE } from "./cookie";
import { PinForm } from "./pin-form";
import { ResultView } from "./result-view";

export const metadata: Metadata = {
  title: "Check a school result",
  description: "Type the 12 digit PIN from your child’s result slip to see their school result and download the report card.",
};

export default function ResultPage() {
  return (
    <main className="flex flex-1 flex-col items-center px-4 py-8 sm:py-12">
      <Suspense fallback={<Skeleton className="h-96 w-full max-w-[26rem] rounded-xl" />}>
        <ResultOrForm />
      </Suspense>
    </main>
  );
}

/** The result while a signed cookie holds and every check passes (AC-14); else the empty form. */
async function ResultOrForm() {
  const value = (await cookies()).get(RESULT_COOKIE)?.value;
  if (!value) return <FormScreen />;
  let slip;
  try {
    slip = readResultCookie(value);
  } catch (error) {
    if (error instanceof PinKeyMissing) return <FormScreen message={pinMessage({ reason: "unavailable" })} />;
    throw error;
  }
  if (!slip) return <FormScreen />;
  const result = await loadPinResult(slip.pinId);
  if (!result.ok) return <FormScreen message={pinMessage(result)} />;
  return <ResultView card={result.card} />;
}

function FormScreen({ message }: { message?: string }) {
  return (
    <div className="flex w-full max-w-[26rem] flex-col gap-6">
      <Logo className="h-7 self-start" />
      <div className="ruled-sheet rounded-xl border border-rule py-7 pr-5 pl-[calc(var(--margin-x)+1.25rem)] shadow-sm [--margin-x:1.5rem] sm:py-9 sm:pr-8 sm:pl-[calc(var(--margin-x)+2rem)] sm:[--margin-x:2rem]">
        <div className="mb-7 flex flex-col gap-1.5">
          <h1 className="type-title">Check a school result</h1>
          <p className="text-muted-foreground">Type the PIN printed on the slip from your child’s school.</p>
        </div>
        <PinForm initialMessage={message} />
      </div>
    </div>
  );
}
