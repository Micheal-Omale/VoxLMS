import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { worstCaseInput } from "@/app/design/report-card/worst-case";
import { PinForm } from "@/app/result/pin-form";
import { ResultView } from "@/app/result/result-view";
import { Logo } from "@/components/brand/logo";
import { buildReportCards } from "@/lib/report-card";
import { pinMessage, type PinRefusal } from "@/server/data/pin-results";

// Design preview: result view and each AC-12 message state on made-up data (spec 0014, AC-22).
// Returns 404 in production unless SHOW_DESIGN_PREVIEWS=1.

export const metadata: Metadata = { title: "Result preview · Design" };

type SearchParams = Promise<{ plan?: string; state?: string }>;

const STATES: Record<string, { label: string; refusal: PinRefusal }> = {
  shape: { label: "Typo / Shape", refusal: { reason: "shape" } },
  throttled: { label: "Throttled", refusal: { reason: "throttled", waitSeconds: 12 * 60 } },
  unknown: { label: "Unknown PIN", refusal: { reason: "unknown" } },
  replaced: { label: "Replaced Slip", refusal: { reason: "replaced" } },
  withdrawn: { label: "Withdrawn Student", refusal: { reason: "withdrawn" } },
  unreleased: {
    label: "Term Unreleased",
    refusal: { reason: "unreleased", schoolName: "Government Secondary School", termLabel: "First Term, 2026/2027" },
  },
  not_ready: { label: "Class Not Ready", refusal: { reason: "not_ready" } },
  unavailable: { label: "Key Missing", refusal: { reason: "unavailable" } },
};

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

export default async function DesignResultPage({ searchParams }: { searchParams: SearchParams }) {
  if (process.env.NODE_ENV === "production" && process.env.SHOW_DESIGN_PREVIEWS !== "1") {
    notFound();
  }

  const { plan: rawPlan, state: rawState } = await searchParams;
  const plan = rawPlan === "basic" ? "basic" : "school_logo";
  const state = typeof rawState === "string" && rawState in STATES ? rawState : null;

  const cards = buildReportCards(worstCaseInput({ parts: 5, plan }), new Date());
  const card = cards[0];

  return (
    <div className="flex flex-1 flex-col items-center">
      {/* Design preview controls */}
      <nav aria-label="Design preview options" className="mb-8 flex w-full max-w-4xl flex-wrap items-center justify-between gap-4 border-b border-rule pb-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-muted-foreground">Plan:</span>
          <Link
            href={`/design/result?plan=school_logo${state ? `&state=${state}` : ""}`}
            className={`rounded-md px-2.5 py-1 ${plan === "school_logo" ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:bg-accent"}`}
          >
            School Logo
          </Link>
          <Link
            href={`/design/result?plan=basic${state ? `&state=${state}` : ""}`}
            className={`rounded-md px-2.5 py-1 ${plan === "basic" ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:bg-accent"}`}
          >
            Basic
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 font-semibold text-muted-foreground">State:</span>
          <Link
            href={`/design/result?plan=${plan}`}
            className={`rounded-md px-2 py-0.5 text-xs ${!state ? "bg-accent font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Result View
          </Link>
          {Object.entries(STATES).map(([key, item]) => (
            <Link
              key={key}
              href={`/design/result?plan=${plan}&state=${key}`}
              className={`rounded-md px-2 py-0.5 text-xs ${state === key ? "bg-accent font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>

      <main className="flex w-full justify-center px-4 py-4 sm:py-8">
        {state ? (
          <FormScreen message={pinMessage(STATES[state].refusal)} />
        ) : (
          <ResultView card={card} />
        )}
      </main>
    </div>
  );
}
