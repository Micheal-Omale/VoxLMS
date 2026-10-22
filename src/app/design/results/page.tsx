import { Suspense } from "react";
import type { Metadata } from "next";

import { ResultsSection } from "@/app/[school]/classes/[classId]/results-section";
import { AppBar } from "@/components/app-bar";

import { demoSchool, demoTeacher, demoTerm } from "../demo-data";
import { demoResults } from "../demo-results";

export const metadata: Metadata = { title: "Results" };

type SearchParams = Promise<{ parts?: string; subjects?: string; state?: string }>;

/** The design preview of the class page's Results section (spec 0010, AC-8), on made-up scores. */
export default function ResultsPreview({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <AppBar school={demoSchool} term={demoTerm} account={{ name: demoTeacher.name, detail: demoTeacher.role, canSwitchSchool: false, readOnly: false }} />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-1">
          <h1 className="type-display">JSS 2 Gold</h1>
          <p className="text-muted-foreground">{demoTerm}</p>
        </div>
        <Suspense>
          <Demo searchParams={searchParams} />
        </Suspense>
      </main>
    </>
  );
}

async function Demo({ searchParams }: { searchParams: SearchParams }) {
  const { parts, subjects, state } = await searchParams;
  return <ResultsSection results={demoResults({ five: parts === "5", count: subjects === "20" ? 20 : 8, state })} schoolCode="GHS" />;
}
