"use client";

import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { stopViewAsAction } from "@/server/auth/actions";

export function StopViewingButton() {
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => start(() => stopViewAsAction())}>
      Stop viewing as
    </Button>
  );
}
