import { Suspense } from "react";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon, CircleCheckIcon, CircleIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { termLabel } from "@/lib/term-label";
import { requireTeamSchoolContext } from "@/server/auth/viewer";
import { getCurriculumProgress } from "@/server/data/curriculum";
import { getSchoolSetup } from "@/server/data/setup";
import { getEnrolmentProgress } from "@/server/data/students";

type Params = Promise<{ schoolId: string }>;

/** "JSS 1 Blue", "JSS 1 Blue and SS 1 Arts", "A, B, C and 24 more": at most three names, so the line stays readable. */
function listNames(names: string[]) {
  if (names.length > 3) return `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export default function SchoolTeamPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <SchoolOverview params={params} />
    </Suspense>
  );
}

async function SchoolOverview({ params }: { params: Params }) {
  const { schoolId } = await params;
  const { ctx } = await requireTeamSchoolContext(schoolId);
  const [setup, progress, enrolled] = await Promise.all([getSchoolSetup(ctx), getCurriculumProgress(ctx), getEnrolmentProgress(ctx)]);
  const { school, sections, sessions, currentTerm, checklist } = setup;
  const currentSession = sessions.find((s) => s.id === currentTerm?.sessionId);
  // Spec 0007, AC-7: only sections with their own head need a signature here.
  const missingSignatures = sections.filter((s) => s.headName && !s.headSignatureAssetId).length;
  const principalMissing = !school.principalName ? "the principal’s name and signature" : !school.principalSignatureAssetId ? "the principal’s signature" : null;
  const base = `/admin/schools/${school.id}`;

  const items = [
    {
      title: "Details",
      href: `${base}/details`,
      done: checklist.details,
      status: `/${school.slug}, code ${school.code}, ${school.plan === "basic" ? "Basic plan" : "School logo plan"}${principalMissing ? `. Still needs ${principalMissing}.` : ""}`,
    },
    {
      title: "Logo",
      href: `${base}/details#logo`,
      done: checklist.logo,
      status: school.plan === "basic" ? "Not needed on the Basic plan" : school.logoAssetId ? "Uploaded" : "Not uploaded yet",
    },
    {
      title: "Sections",
      href: `${base}/sections`,
      done: checklist.sections,
      status:
        sections.length === 0
          ? "None added yet"
          : missingSignatures > 0
            ? `${sections.map((s) => s.name).join(", ")}. ${missingSignatures} own ${missingSignatures === 1 ? "head still needs a signature" : "heads still need a signature"}.`
            : sections.map((s) => s.name).join(", "),
    },
    {
      title: "Session and terms",
      href: `${base}/terms`,
      done: checklist.terms,
      status: currentTerm && currentSession ? `${termLabel(currentTerm.number, currentSession.name)} is current` : "No current term yet",
    },
    // Spec 0006, AC-10.
    {
      title: "Subjects",
      href: `${base}/subjects`,
      done: progress.subjects.done,
      status: progress.subjects.count === 0 ? "None added yet" : `${progress.subjects.count} ${progress.subjects.count === 1 ? "subject" : "subjects"}, in the school’s order`,
    },
    {
      title: "Classes",
      href: `${base}/classes`,
      done: progress.classes.done,
      status:
        progress.classes.count === 0
          ? "None added yet"
          : !progress.session
            ? `${progress.classes.count} classes. Add a session to give them subjects.`
            : progress.classes.withoutSubjects > 0
              ? `${progress.classes.count} classes. ${progress.classes.withoutSubjects} still ${progress.classes.withoutSubjects === 1 ? "needs" : "need"} subjects for ${progress.session.name}.`
              : `${progress.classes.count} ${progress.classes.count === 1 ? "class" : "classes"}, each with its subjects for ${progress.session.name}`,
    },
    {
      title: "Score split and grades",
      href: `${base}/grading`,
      done: progress.grading.done,
      status:
        progress.grading.sections === 0
          ? "Add sections first"
          : !progress.session
            ? "Add a session first"
            : progress.grading.done
              ? `Set for every section in ${progress.session.name}`
              : `${progress.grading.unready.join(", ")} still ${progress.grading.unready.length === 1 ? "needs" : "need"} a split adding to 100 and a grade scale`,
    },
    // Spec 0008, AC-15.
    {
      title: "Staff",
      href: `${base}/staff`,
      done: enrolled.staff.done,
      status: !enrolled.currentTerm
        ? "Set the current term first"
        : enrolled.classes === 0
          ? "Add classes first"
          : enrolled.staff.done
            ? `Every class has its form master for ${enrolled.currentTerm.sessionName}`
            : `${listNames(enrolled.staff.missing)} still ${enrolled.staff.missing.length === 1 ? "needs" : "need"} a form master`,
    },
    {
      title: "Students",
      href: `${base}/students`,
      done: enrolled.students.done,
      status: !enrolled.currentTerm
        ? "Set the current term first"
        : enrolled.classes === 0
          ? "Add classes first"
          : enrolled.students.done
            ? "Every class has its students this term"
            : `${listNames(enrolled.students.missing)} ${enrolled.students.missing.length === 1 ? "has" : "have"} no students yet`,
    },
  ];
  const remaining = items.filter((i) => !i.done).length;

  return (
    <>
      <div className="flex flex-col items-start gap-1">
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/admin" />} className="-ml-3 text-muted-foreground">
          <ChevronLeftIcon data-icon="inline-start" />
          Schools
        </Button>
        <h1 className="type-display">{school.name}</h1>
        <p className="text-muted-foreground">
          {remaining === 0 ? "Setup is complete." : `${remaining} setup ${remaining === 1 ? "step" : "steps"} left.`}
        </p>
      </div>

      <section aria-labelledby="setup-heading" className="flex flex-col gap-3">
        <h2 id="setup-heading" className="type-heading">
          Setup
        </h2>
        <ol className="flex flex-col overflow-hidden rounded-xl border border-rule bg-card">
          {items.map((item) => (
            <li key={item.title} className="border-b border-rule last:border-b-0">
              <Link href={item.href} className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-accent">
                {item.done ? (
                  <CircleCheckIcon aria-label="Done" className="size-5 shrink-0 text-success" />
                ) : (
                  <CircleIcon aria-label="Not done" className="size-5 shrink-0 text-input" />
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-bold">{item.title}</span>
                  <span className="type-caption text-muted-foreground">{item.status}</span>
                </span>
                <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ol>
      </section>

    </>
  );
}
