"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type Option = { value: string; label: string; href: string };

/** A select that moves to another address: the term picker and the subject switcher (spec 0009, AC-2, AC-3). */
export function NavSelect({ id, label, value, options, className }: { id: string; label: string; value: string; options: Option[]; className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const items = options.map(({ value, label }) => ({ value, label }));

  return (
    <Field className={cn("md:w-64", className)}>
      <FieldLabel htmlFor={id} className="type-caption font-semibold text-muted-foreground">
        {label}
        {pending && <Spinner className="size-3.5" aria-label="Loading" />}
      </FieldLabel>
      <Select
        items={items}
        value={value}
        onValueChange={(next) => {
          const option = options.find((o) => o.value === next);
          if (option && option.value !== value) startTransition(() => router.push(option.href));
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}
