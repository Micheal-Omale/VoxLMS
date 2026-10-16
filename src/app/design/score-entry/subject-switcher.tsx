"use client";

import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { demoSubjects } from "../demo-data";

const items = demoSubjects.map((subject) => ({ value: subject, label: subject }));

export function SubjectSwitcher() {
  return (
    <Field className="md:w-64">
      <FieldLabel htmlFor="subject" className="type-caption font-semibold text-muted-foreground">
        Subject
      </FieldLabel>
      <Select items={items} defaultValue="Mathematics">
        <SelectTrigger id="subject" className="w-full">
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
