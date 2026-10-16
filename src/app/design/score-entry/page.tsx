import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeftIcon } from "lucide-react";

import { AppBar } from "@/components/app-bar";
import { Button } from "@/components/ui/button";

import { demoSchool, demoTeacher, demoTerm } from "../demo-data";
import { ScoreEntryDemo } from "./score-entry-demo";
import { SubjectSwitcher } from "./subject-switcher";

export const metadata: Metadata = { title: "Score entry" };

export default function ScoreEntryPreview() {
  return (
    <>
      <AppBar school={demoSchool} term={demoTerm} account={{ name: demoTeacher.name, detail: demoTeacher.role, canSwitchSchool: false, readOnly: false }} />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col pt-3 sm:px-6 sm:pt-5">
        <div className="flex flex-col gap-4 px-4 pb-5 sm:px-0 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col items-start gap-1">
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link href="/design" />}
              className="-ml-3 text-muted-foreground"
            >
              <ChevronLeftIcon data-icon="inline-start" />
              JSS 2 Gold
            </Button>
            <h1 className="type-display">Mathematics</h1>
            <p className="text-muted-foreground">
              Type each score as it appears in your mark book. Missing scores stay blank, never 0.
            </p>
          </div>
          <SubjectSwitcher />
        </div>
        <ScoreEntryDemo />
      </main>
    </>
  );
}
