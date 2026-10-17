import { Suspense } from "react";
import type { Metadata } from "next";

import { Skeleton } from "@/components/ui/skeleton";
import { requireTeamSchoolContext } from "@/server/auth/viewer";
import { getSubjectsSetup } from "@/server/data/curriculum";
import { getSchoolSetup } from "@/server/data/setup";

import { SetupHeader } from "../setup-header";
import { StandardPicker } from "./standard-picker";
import { SubjectForm } from "./subject-form";
import { SubjectList } from "./subject-list";

export const metadata: Metadata = { title: "Subjects" };

type Params = Promise<{ schoolId: string }>;

export default function SubjectsPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <Subjects params={params} />
    </Suspense>
  );
}

async function Subjects({ params }: { params: Params }) {
  const { schoolId } = await params;
  const { ctx } = await requireTeamSchoolContext(schoolId);
  const [{ school }, { session, subjects, standards }] = await Promise.all([getSchoolSetup(ctx), getSubjectsSetup(ctx)]);
  const active = subjects.filter((s) => s.isActive).length;

  return (
    <>
      <SetupHeader
        schoolId={school.id}
        schoolName={school.name}
        title="Subjects"
        intro="The subjects this school teaches, in one order. Score sheets, the school home and report cards all list a class’s subjects this way."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <section aria-labelledby="order-heading" className="flex flex-col gap-4 rounded-xl border border-rule bg-card p-4 sm:p-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="order-heading" className="type-title">
              The school’s order
            </h2>
            <span className="type-caption text-muted-foreground">{active === 1 ? "1 subject" : `${active} subjects`}</span>
          </div>
          <SubjectList
            schoolId={school.id}
            sessionName={session?.name ?? null}
            subjects={subjects}
            standards={standards.map(({ id, code, name }) => ({ id, code, name }))}
          />
        </section>

        <div className="flex flex-col gap-6">
          <section aria-labelledby="standard-heading" className="flex flex-col gap-4 rounded-xl border border-rule bg-card p-4 sm:p-6">
            <div className="flex flex-col gap-1">
              <h2 id="standard-heading" className="type-heading">
                Add from the standard list
              </h2>
              <p className="type-caption text-muted-foreground sm:text-sm">Nigeria’s usual subjects. Ticked ones join the end of the order; rename any to the school’s wording afterwards.</p>
            </div>
            <StandardPicker schoolId={school.id} standards={standards.map(({ id, name, added }) => ({ id, name, added }))} />
          </section>

          <section aria-labelledby="own-heading" className="flex flex-col gap-4 rounded-xl border border-dashed border-input bg-card p-4 sm:p-6">
            <div className="flex flex-col gap-1">
              <h2 id="own-heading" className="type-heading">
                Add a subject of the school’s own
              </h2>
              <p className="type-caption text-muted-foreground sm:text-sm">For subjects the standard list doesn’t have, like Hausa Studies or Entrepreneurship.</p>
            </div>
            <SubjectForm
              schoolId={school.id}
              standards={standards.map(({ id, code, name }) => ({ id, code, name }))}
              takenShortNames={subjects.map((s) => s.shortName)}
            />
          </section>
        </div>
      </div>
    </>
  );
}
