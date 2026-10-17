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
}: {
  schoolId: string;
  schoolName: string;
  title: string;
  intro: React.ReactNode;
  /** Where the back link goes; the school's overview unless set. */
  back?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={back?.href ?? `/admin/schools/${schoolId}`} />} className="-ml-3 text-muted-foreground">
        <ChevronLeftIcon data-icon="inline-start" />
        {back?.label ?? schoolName}
      </Button>
      <h1 className="type-display">{title}</h1>
      <p className="max-w-2xl text-muted-foreground">{intro}</p>
    </div>
  );
}
