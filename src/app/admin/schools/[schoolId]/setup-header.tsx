import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

/** The back link, title and intro at the top of every setup page. */
export function SetupHeader({
  schoolId,
  schoolName,
  title,
  intro,
  back,
  actions,
}: {
  schoolId: string;
  schoolName: string;
  title: string;
  intro: React.ReactNode;
  /** Where the back link goes; the school's overview unless set. */
  back?: { href: string; label: string };
  /** Page level actions, beside the title from sm up and under the intro on phones. */
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={back?.href ?? `/admin/schools/${schoolId}`} />} className="-ml-3 text-muted-foreground">
        <ChevronLeftIcon data-icon="inline-start" />
        {back?.label ?? schoolName}
      </Button>
      <div className="flex w-full flex-col gap-x-6 gap-y-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="type-display">{title}</h1>
          <p className="max-w-2xl text-muted-foreground">{intro}</p>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
