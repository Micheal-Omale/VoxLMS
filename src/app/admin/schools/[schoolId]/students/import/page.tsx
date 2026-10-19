import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";

import { Skeleton } from "@/components/ui/skeleton";
import { MAX_ROWS } from "@/lib/import/grid";
import { termLabel } from "@/lib/term-label";
import { requireTeamSchoolContext } from "@/server/auth/viewer";
import { getSchoolSetup } from "@/server/data/setup";
import { getStudentsOverview } from "@/server/data/students";

import { SetupHeader } from "../../setup-header";
import { StudentImport } from "./student-import";

export const metadata: Metadata = { title: "Import students" };

type Params = Promise<{ schoolId: string }>;

export default function ImportStudentsPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <ImportStudents params={params} />
    </Suspense>
  );
}

/** The columns a register can have (spec 0013, Feature design), for the side panel. */
const COLUMNS: {
  name: string;
  also: string;
  need: "required" | "optional" | "either";
}[] = [
  {
    name: "Surname and Other names",
    also: "or one Name column, surname first",
    need: "required",
  },
  { name: "Gender", also: "M or F, Boy or Girl", need: "required" },
  {
    name: "Class",
    also: "as the school names it, e.g. JSS 2 Gold",
    need: "required",
  },
  { name: "Admission number", also: "Adm no, Reg no", need: "optional" },
  { name: "House", also: "up to 30 characters", need: "optional" },
  {
    name: "Parent name and Parent phone",
    also: "with Relationship: mother, father or guardian",
    need: "optional",
  },
  {
    name: "Parent 2 name and phone",
    also: "or Father's and Mother's name and phone",
    need: "optional",
  },
];

async function ImportStudents({ params }: { params: Params }) {
  const { schoolId } = await params;
  const { ctx } = await requireTeamSchoolContext(schoolId);
  const [{ school }, overview] = await Promise.all([getSchoolSetup(ctx), getStudentsOverview(ctx)]);
  const base = `/admin/schools/${school.id}`;
  const { currentTerm } = overview;
  const classNames = overview.sections.flatMap((s) => s.classes.map((c) => c.name));
  const guide = <SheetGuide schoolName={school.name} classNames={classNames} />;

  return (
    <>
      <SetupHeader
        schoolId={school.id}
        schoolName={school.name}
        back={{ href: `${base}/students`, label: "Students" }}
        title="Import students"
        intro="Upload the school’s register, with parents, as an Excel or CSV file. Nothing is saved until you have checked the preview and confirmed. Uploading the same file again is safe: students already here are skipped."
      />

      {!currentTerm || classNames.length === 0 ? (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          {!currentTerm ? (
            // AC-10: no current term, no upload.
            <div className="flex flex-col items-start gap-2 rounded-xl border border-warning/30 bg-warning-wash p-5 text-warning">
              <h2 className="type-heading">Set the current term first</h2>
              <p>
                Imported students are enrolled into the current term, and {school.name} has none yet.{" "}
                <Link href={`${base}/terms`} className="font-semibold underline underline-offset-4">
                  Set the current term
                </Link>
                , then come back to import.
              </p>
            </div>
          ) : classNames.length === 0 ? (
            <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-input bg-card p-5 sm:p-8">
              <h2 className="type-title">Add the school’s classes first</h2>
              <p className="max-w-xl text-muted-foreground">
                Every row is matched to one of the school’s classes, so the classes and arms come first.{" "}
                <Link href={`${base}/classes`} className="font-semibold text-primary underline underline-offset-4">
                  Go to classes
                </Link>
              </p>
            </div>
          ) : null}
          {guide}
        </div>
      ) : (
        <StudentImport
          schoolId={school.id}
          termLabel={termLabel(currentTerm.number, currentTerm.sessionName)}
          studentsHref={`${base}/students`}
          guide={guide}
        />
      )}
    </>
  );
}

/** The side panel beside the upload box: the columns a register can have, and the school’s class names. */
function SheetGuide({ schoolName, classNames }: { schoolName: string; classNames: string[] }) {
  return (
    <aside aria-labelledby="layout-heading" className="flex flex-col gap-5 rounded-xl border border-rule bg-card p-5">
      <div className="flex flex-col gap-1">
        <h2 id="layout-heading" className="type-heading">
          How the sheet should look
        </h2>
        <p className="type-caption text-muted-foreground">
          One row per student under a row of headings. The headings can be in any order, and title rows above them are skipped.
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-rule border-y border-rule">
        {COLUMNS.map((c) => (
          <li key={c.name} className="flex items-start justify-between gap-3 py-2.5">
            <span className="flex min-w-0 flex-col">
              <span className="type-label">{c.name}</span>
              <span className="type-caption text-muted-foreground">{c.also}</span>
            </span>
            <span className={`mt-0.5 shrink-0 type-caption ${c.need === "required" ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
              {c.need === "required" ? "Needed" : "Optional"}
            </span>
          </li>
        ))}
      </ul>
      <ul className="flex list-disc flex-col gap-1.5 pl-4 type-caption text-muted-foreground">
        <li>
          Up to <span className="type-figure">{MAX_ROWS.toLocaleString("en-NG")}</span> students and 2 MB per file. A bigger school uploads one file per
          section.
        </li>
        <li>Format the admission number and phone columns as Text in Excel, so a leading 0 stays.</li>
        <li>A parent on several rows, with the same name and phone, is saved once and linked to all their children.</li>
      </ul>
      {classNames.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h3 className="type-label">Classes at {schoolName}</h3>
          <p className="type-caption text-muted-foreground">{classNames.join(", ")}</p>
        </div>
      )}
    </aside>
  );
}
