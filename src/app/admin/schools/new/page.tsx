import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

import { SchoolDetailsForm } from "../school-details-form";
import { createSchoolAction } from "../setup-actions";

export const metadata: Metadata = { title: "New school" };

// The team layout already checks the visitor is on our team.
export default function NewSchoolPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col items-start gap-1">
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/admin" />} className="-ml-3 text-muted-foreground">
          <ChevronLeftIcon data-icon="inline-start" />
          Schools
        </Button>
        <h1 className="type-display">New school</h1>
        <p className="text-muted-foreground">Just the essentials. You finish the rest from the school’s setup checklist.</p>
      </div>
      <div className="rounded-xl border border-rule bg-card p-5 sm:p-8">
        <SchoolDetailsForm mode="create" action={createSchoolAction} />
      </div>
    </div>
  );
}
