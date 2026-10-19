import Link from "next/link";
import type { Metadata } from "next";
import { CircleAlertIcon, CircleCheckIcon, HistoryIcon, PlusIcon, PrinterIcon, UsersIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Logo } from "@/components/brand/logo";
import { brand } from "@/lib/brand";

import { Section } from "./section";
import { ConfirmDemo, RedPenSpecimen, ToastDemo } from "./showcase-interactive";

export const metadata: Metadata = { title: "Design system" };

const colours = [
  { name: "Paper", token: "background", hex: "#F3F6F9", use: "The page. Cool exercise-book white, never cream." },
  { name: "Sheet", token: "card", hex: "#FFFFFF", use: "Anything laid on the desk: score sheets, forms, menus." },
  { name: "Biro ink", token: "foreground", hex: "#16224A", use: "All text and figures. 14.2:1 on paper." },
  { name: "Pencil", token: "muted-foreground", hex: "#56627E", use: "Supporting text. 5.6:1 on paper." },
  { name: "Biro blue", token: "primary", hex: "#1F3FA8", use: "The one action colour: buttons, links, focus." },
  { name: "Red pen", token: "destructive", hex: "#C8202F", use: "Stop and look: a score to fix, or an action that removes something." },
  { name: "Register green", token: "success", hex: "#0B6B4C", use: "Only for saved or complete." },
  { name: "Amber", token: "warning", hex: "#8A4B00", use: "Only for typed but not saved yet." },
  { name: "Feint rule", token: "rule", hex: "#D3DDE8", use: "Ruled lines between rows. Structure, not decoration." },
  { name: "Margin", token: "margin", hex: "#E8939B", use: "The red margin line on ruled sheets. Never text." },
];

const typeScale = [
  { utility: "type-display", spec: "28 to 40px, 800", sample: "Mathematics" },
  { utility: "type-title", spec: "22 to 26px, 700", sample: "Report cards for JSS 2 Gold" },
  { utility: "type-heading", spec: "19px, 700", sample: "Behaviour and skills" },
  { utility: "type-body", spec: "16px, 400, 1.55", sample: "Type each score as it appears in your mark book." },
  { utility: "type-label", spec: "15px, 600", sample: "Phone number or username" },
  { utility: "type-caption", spec: "13px, 400", sample: "CA 2 and Exam not entered yet" },
  { utility: "type-score", spec: "20px, 700, tabular", sample: "17   15   48   80" },
];

const rules = [
  ["A missing score shows as a dash and is never counted as 0.", "Fill blanks with 0 so a total can be shown."],
  ["Red means stop and look: a score to fix, or an action that removes something.", "Use red for a brand accent, a highlight or a chart."],
  ["Say what happened and what to do: “CA 1 is out of 20. You wrote 25.”", "“Invalid input.” or “Oops! Something went wrong.”"],
  ["Keep the main action within thumb reach at the bottom of phone screens.", "Put Save at the top of a long sheet."],
  ["Show the school and term on every school page.", "Make teachers guess which term they are entering scores for."],
  ["Use the teacher’s words: score, class, term, report card.", "Use system words: record, entity, sync, submit."],
] as const;

export default function DesignSystemPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-16 px-4 py-10 sm:px-6 sm:py-14">
      <header className="flex max-w-2xl flex-col gap-4">
        <Logo className="h-8 self-start" />
        <h1 className="type-display">The mark book</h1>
        <p className="text-lg text-muted-foreground">
          How {brand.name} looks and behaves. Every screen borrows from what teachers already work
          with: exercise-book paper, blue biro, ruled lines and the red pen. Every number is easy to
          read and check, because parents will check it.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button nativeButton={false} render={<Link href="/design/score-entry" />}>
            Open score entry preview
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link href="/design/sign-in" />}>
            Open sign in preview
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link href="/design/logo" />}>
            Logo guidelines
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link href="/design/report-card" prefetch={false} />}>
            Report card PDF
          </Button>
        </div>
      </header>

      <Section title="Colour" intro="Each colour has one job. If a colour appears, it means the same thing everywhere.">
        <ul className="grid gap-px overflow-hidden rounded-xl border border-rule bg-rule sm:grid-cols-2">
          {colours.map((colour) => (
            <li key={colour.token} className="flex items-start gap-4 bg-card p-4">
              <span
                aria-hidden="true"
                className="size-12 shrink-0 rounded-md border border-foreground/10"
                style={{ background: `var(--${colour.token})` }}
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-bold">
                  {colour.name} <span className="font-normal text-muted-foreground type-figure">{colour.hex}</span>
                </span>
                <span className="type-caption text-muted-foreground">{colour.use}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Type"
        intro="One family, Atkinson Hyperlegible Next, made by the Braille Institute so similar characters never look alike. Scores and admission numbers are where that matters most."
      >
        <div className="flex flex-col gap-6 rounded-xl border border-rule bg-card p-5 sm:p-8">
          <div className="flex flex-wrap items-end gap-x-10 gap-y-4 border-b border-rule pb-6">
            {["1 l I", "0 O", "5 S", "8 B"].map((pair) => (
              <span key={pair} className="flex flex-col gap-1">
                <span className="text-5xl font-bold tracking-wide type-figure">{pair}</span>
                <span className="type-caption text-muted-foreground">Never confused</span>
              </span>
            ))}
          </div>
          <dl className="flex flex-col">
            {typeScale.map((row) => (
              <div
                key={row.utility}
                className="grid gap-1 border-b border-rule py-4 last:border-b-0 sm:grid-cols-[11rem_1fr] sm:items-baseline sm:gap-6"
              >
                <dt className="flex flex-col">
                  <code className="type-caption font-semibold">{row.utility}</code>
                  <span className="type-caption text-muted-foreground">{row.spec}</span>
                </dt>
                <dd className={`${row.utility} min-w-0 whitespace-pre`}>{row.sample}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Section>

      <Section
        title="The red pen"
        intro="The one bold moment. When a score is above its maximum, the field is circled the way a teacher marks a script, and the reason is written underneath. It draws once, in under half a second, and not at all for people who turn off motion."
      >
        <div className="rounded-xl border border-rule bg-card p-5 sm:p-8">
          <RedPenSpecimen />
          <p className="mt-3 flex items-center gap-1.5 type-caption font-semibold text-destructive">
            <CircleAlertIcon aria-hidden="true" className="size-3.5" />
            CA 1 is out of 20. You wrote 25.
          </p>
        </div>
      </Section>

      <Section title="Actions" intro="Buttons are 44px tall by default so a thumb can hit them. One filled button per screen: the thing the teacher came to do.">
        <div className="flex flex-col gap-6 rounded-xl border border-rule bg-card p-5 sm:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Save scores</Button>
            <Button variant="outline">
              <PrinterIcon data-icon="inline-start" />
              Print report cards
            </Button>
            <Button variant="secondary">Change subject</Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="destructive">Remove student</Button>
            <Button variant="link">View broadsheet</Button>
          </div>
          <Separator />
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg">Large, 48px</Button>
            <Button>Default, 44px</Button>
            <Button size="sm">Small, 36px</Button>
            <Button size="icon" variant="outline" aria-label="Add student">
              <PlusIcon />
            </Button>
            <Button disabled>Disabled</Button>
          </div>
        </div>
      </Section>

      <Section title="Fields" intro="Labels sit above fields and stay visible. Errors say what is wrong and how to fix it, right under the field.">
        <div className="grid gap-8 rounded-xl border border-rule bg-card p-5 sm:p-8 md:grid-cols-2">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="ds-admission" className="type-label">
                Admission number
              </FieldLabel>
              <Input id="ds-admission" defaultValue="GHS/2024/0117" className="type-figure" />
              <FieldDescription>As written in the school register.</FieldDescription>
            </Field>
            <Field data-invalid>
              <FieldLabel htmlFor="ds-phone" className="type-label">
                Parent’s phone number
              </FieldLabel>
              <Input id="ds-phone" defaultValue="0803 123 456" aria-invalid className="type-figure" />
              <FieldError>This number has 10 digits. Nigerian mobile numbers have 11, like 08031234567.</FieldError>
            </Field>
          </FieldGroup>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="ds-comment" className="type-label">
                Form teacher’s comment
              </FieldLabel>
              <Textarea id="ds-comment" defaultValue="A focused and helpful student. Keep reading every day." />
            </Field>
            <Field orientation="horizontal">
              <Checkbox id="ds-consent" defaultChecked />
              <FieldLabel htmlFor="ds-consent">Parent agreed to receive results on WhatsApp</FieldLabel>
            </Field>
            <Field data-disabled>
              <FieldLabel htmlFor="ds-term" className="type-label">
                Term
              </FieldLabel>
              <Input id="ds-term" disabled defaultValue="First Term, 2026/2027" />
              <FieldDescription>Set by the school. Teachers cannot change it.</FieldDescription>
            </Field>
          </FieldGroup>
        </div>
      </Section>

      <Section title="Status" intro="Saved is green, not saved yet is amber, needs fixing is red. Each always comes with words, never colour alone.">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-success-wash text-success">
              <CircleCheckIcon data-icon="inline-start" />
              Complete
            </Badge>
            <Badge className="bg-warning-wash text-warning">Not saved yet</Badge>
            <Badge variant="destructive">2 to fix</Badge>
            <Badge variant="outline">JSS 2 Gold</Badge>
            <Badge variant="secondary">Basic plan</Badge>
          </div>
          <Alert className="border-success/25 bg-success-wash">
            <CircleCheckIcon className="text-success" />
            <AlertTitle>Report cards ready for JSS 2 Gold</AlertTitle>
            <AlertDescription className="text-foreground/80">32 report cards, one A4 page each.</AlertDescription>
          </Alert>
          <Alert className="border-warning/30 bg-warning-wash">
            <HistoryIcon />
            <AlertTitle>Unsaved scores for 4 students were kept on this device</AlertTitle>
            <AlertDescription className="text-foreground/80">Save to keep them, or discard to go back to the last saved scores.</AlertDescription>
          </Alert>
          <Alert variant="destructive" className="border-destructive/25 bg-destructive-wash">
            <CircleAlertIcon />
            <AlertTitle>3 students have missing Basic Science scores</AlertTitle>
            <AlertDescription className="text-foreground/80">Report cards are made once every score is in.</AlertDescription>
          </Alert>
          <div className="flex flex-wrap gap-3 pt-2">
            <ToastDemo />
            <ConfirmDemo />
          </div>
        </div>
      </Section>

      <Section title="Empty and loading" intro="An empty screen says what to do next. Loading keeps the shape of what is coming so nothing jumps.">
        <div className="grid gap-4 md:grid-cols-2">
          <Empty className="border border-dashed border-input bg-card">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UsersIcon />
              </EmptyMedia>
              <EmptyTitle className="type-heading">No students in JSS 2 Gold yet</EmptyTitle>
              <EmptyDescription>Add students one at a time, or upload the class list from Excel.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button>
                <PlusIcon data-icon="inline-start" />
                Add a student
              </Button>
            </EmptyContent>
          </Empty>
          <div aria-hidden="true" className="flex flex-col gap-0 rounded-xl border border-rule bg-card p-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 border-b border-rule py-3 last:border-b-0">
                <Skeleton className="h-4 w-5" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-10 w-14" />
                <Skeleton className="h-10 w-14" />
                <Skeleton className="h-10 w-14" />
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Rules" intro="Check new screens against these before they ship.">
        <ul className="flex flex-col overflow-hidden rounded-xl border border-rule bg-card">
          {rules.map(([doThis, notThis]) => (
            <li key={doThis} className="grid gap-2 border-b border-rule p-4 last:border-b-0 sm:grid-cols-2 sm:gap-8 sm:p-5">
              <p className="flex gap-2.5">
                <CircleCheckIcon aria-label="Do" className="mt-1 size-4 shrink-0 text-success" />
                {doThis}
              </p>
              <p className="flex gap-2.5 text-muted-foreground">
                <CircleAlertIcon aria-label="Don’t" className="mt-1 size-4 shrink-0 text-destructive" />
                {notThis}
              </p>
            </li>
          ))}
        </ul>
      </Section>
    </main>
  );
}

