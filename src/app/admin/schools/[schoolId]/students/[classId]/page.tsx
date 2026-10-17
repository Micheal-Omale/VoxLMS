import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { Skeleton } from "@/components/ui/skeleton";
import { termLabel } from "@/lib/term-label";
import { requireTeamSchoolContext } from "@/server/auth/viewer";
import { NotFound } from "@/server/data";
import { getSchoolSetup } from "@/server/data/setup";
import { getClassRoster } from "@/server/data/students";

import { SetupHeader } from "../../setup-header";
import { ClassRegister } from "./class-register";
import { ElectivesGrid } from "./electives-grid";
import { FormTeacherPicker } from "./form-teacher-picker";

export const metadata: Metadata = { title: "Class list" };

type Params = Promise<{ schoolId: string; classId: string }>;

export default function ClassListPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<ClassSkeleton />}>
      <ClassList params={params} />
    </Suspense>
  );
}

async function ClassList({ params }: { params: Params }) {
  const { schoolId, classId } = await params;
  const { ctx } = await requireTeamSchoolContext(schoolId);
  if (!/^[0-9a-f-]{36}$/.test(classId)) notFound();
  const [{ school }, roster] = await Promise.all([
    getSchoolSetup(ctx),
    getClassRoster(ctx, { classId }).catch((error: unknown) => {
      if (error instanceof NotFound) notFound();
      throw error;
    }),
  ]);
  const { cls, term } = roster;
  const base = `/admin/schools/${school.id}`;
  const open = roster.students.filter((s) => !s.withdrawnOn);

  return (
    <>
      <SetupHeader
        schoolId={school.id}
        schoolName={school.name}
        back={{ href: `${base}/students`, label: "Students" }}
        title={cls.name}
        intro={
          term
            ? `${cls.sectionName} · ${termLabel(term.number, term.sessionName)} · ${open.length} ${open.length === 1 ? "student" : "students"}`
            : cls.sectionName
        }
      />

      {!term ? (
        <div className="flex flex-col items-start gap-2 rounded-xl border border-warning/30 bg-warning-wash p-5">
          <h2 className="type-heading">Set the current term first</h2>
          <p className="text-foreground">
            A class list is always for the current term, and {school.name} has none yet.{" "}
            <Link href={`${base}/terms`} className="font-semibold text-primary underline underline-offset-4">
              Go to Session and terms
            </Link>
          </p>
        </div>
      ) : (
        <>
          {!cls.isActive && (
            <p className="rounded-xl border border-warning/30 bg-warning-wash p-4 text-warning">
              {cls.name} is switched off, so no students can be added. Switch it back on from the{" "}
              <Link href={`${base}/classes`} className="font-semibold underline underline-offset-4">
                Classes
              </Link>{" "}
              page.
            </p>
          )}

          <FormTeacherPicker
            // Fresh choice whenever the saved one changes.
            key={roster.formTeacher?.staffId ?? "none"}
            schoolId={school.id}
            classId={cls.id}
            className={cls.name}
            teacherTitle={cls.teacherTitle}
            sessionName={term.sessionName}
            current={roster.formTeacher}
            teachers={roster.teachers}
            staffHref={`${base}/staff`}
          />

          <ClassRegister schoolId={school.id} roster={roster} />

          {roster.electiveSubjects.length > 0 && open.length > 0 && (
            <ElectivesGrid
              key={JSON.stringify(open.map((s) => [s.studentId, s.electives.map((e) => e.subjectId)]))}
              schoolId={school.id}
              classId={cls.id}
              className={cls.name}
              sessionName={term.sessionName}
              subjects={roster.electiveSubjects}
              students={open.map((s) => ({ id: s.studentId, surname: s.surname, otherNames: s.otherNames, electives: s.electives.map((e) => e.subjectId) }))}
            />
          )}
        </>
      )}
    </>
  );
}

function ClassSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-6">
      <Skeleton className="h-16 w-72" />
      <Skeleton className="h-24 rounded-xl" />
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}
