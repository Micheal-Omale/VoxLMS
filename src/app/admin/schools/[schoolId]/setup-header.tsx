import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export function SetupHeader({ schoolId, schoolName, title, intro }: { schoolId: string; schoolName: string; title: string; intro: string }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/admin/schools/${schoolId}`} />} className="-ml-3 text-muted-foreground">
        <ChevronLeftIcon data-icon="inline-start" />
        {schoolName}
      </Button>
      <h1 className="type-display">{title}</h1>
      <p className="max-w-2xl text-muted-foreground">{intro}</p>
    </div>
  );
}
