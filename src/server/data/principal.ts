import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import { classTeacher, school, schoolClass, section, staff } from "@/db/schema";

import type { Actor, SchoolContext } from "./context";
import { NotFound } from "./errors";
import { subjectProgress } from "./scores";
import { getCurrentTerm } from "./terms";

// Leadership overview and teacher lagging tracker (spec 0015).
// Accessible by the school's principal and our team.

export function assertLeadership(actor: Actor) {
  if (actor.kind === "system") return;
  if (actor.kind === "admin") return;
  if (actor.kind === "principal") return;
  throw new NotFound("Principal Portal");
}

export type ClassLaggingReport = {
  id: string;
  name: string;
  sectionId: string;
  sectionName: string;
  teacher: {
    id: string;
    title: string | null;
    fullName: string;
    phone: string;
  } | null;
  totalStudents: number;
  scores: {
    totalSubjects: number;
    completedSubjects: number;
    percent: number;
    unfinished: {
      classSubjectId: string;
      name: string;
      complete: number;
      takers: number;
      isElective: boolean;
      missingCount: number;
    }[];
  };
  remarks: {
    totalStudents: number;
    entered: number;
    pending: number;
    percent: number;
  };
  status: "up_to_date" | "scores_lagging" | "remarks_lagging" | "severely_lagging" | "no_students" | "no_teacher";
};

export type PrincipalOverview = {
  school: {
    id: string;
    name: string;
    slug: string;
    principalName: string | null;
    principalTitle: string;
  };
  term: {
    id: string;
    number: number;
    isCurrent: boolean;
    resultsReleasedAt: Date | null;
  };
  session: {
    id: string;
    name: string;
  };
  summary: {
    totalClasses: number;
    totalStudents: number;
    totalSubjectOfferings: number;
    completedSubjectOfferings: number;
    overallScorePercent: number;
    totalRemarksExpected: number;
    totalRemarksEntered: number;
    overallRemarkPercent: number;
    upToDateClasses: number;
    laggingClasses: number;
  };
  sections: {
    id: string;
    name: string;
    classes: ClassLaggingReport[];
  }[];
};

/**
 * Loads the complete leadership overview: all classes across all sections,
 * assigned form teachers with phone numbers, live score progress with
 * lagging subjects, and teacher remarks progress.
 */
export async function getPrincipalOverview(ctx: SchoolContext): Promise<PrincipalOverview> {
  assertLeadership(ctx.actor);
  const current = await getCurrentTerm(ctx);

  const [schoolRow, sections, classes, teachers] = await Promise.all([
    ctx.db
      .select({
        id: school.id,
        name: school.name,
        slug: school.slug,
        principalName: school.principalName,
        principalTitle: school.principalTitle,
      })
      .from(school)
      .where(eq(school.id, ctx.schoolId))
      .then((rows) => rows[0]),
    ctx.db
      .select({ id: section.id, name: section.name })
      .from(section)
      .where(eq(section.schoolId, ctx.schoolId))
      .orderBy(asc(section.stage)),
    ctx.db
      .select({
        id: schoolClass.id,
        name: schoolClass.name,
        sectionId: schoolClass.sectionId,
      })
      .from(schoolClass)
      .where(and(eq(schoolClass.schoolId, ctx.schoolId), eq(schoolClass.isActive, true)))
      .orderBy(asc(schoolClass.sortOrder), asc(schoolClass.name)),
    ctx.db
      .select({
        classId: classTeacher.classId,
        staffId: staff.id,
        title: staff.title,
        fullName: staff.fullName,
        phone: staff.phone,
      })
      .from(classTeacher)
      .innerJoin(staff, and(eq(staff.schoolId, classTeacher.schoolId), eq(staff.id, classTeacher.staffId)))
      .where(and(eq(classTeacher.schoolId, ctx.schoolId), eq(classTeacher.sessionId, current.session.id))),
  ]);

  if (!schoolRow) throw new NotFound("School");

  const classIds = classes.map((c) => c.id);

  // Score progress & remark counts for all classes in parallel
  const [scoreRows, remarkRows] = await Promise.all([
    subjectProgress(ctx.db, ctx.schoolId, {
      termId: current.term.id,
      sessionId: current.session.id,
      classIds,
    }),
    classIds.length === 0
      ? Promise.resolve({ rows: [] as { classId: string; totalStudents: number; remarksEntered: number }[] })
      : ctx.db.execute<{ classId: string; totalStudents: number; remarksEntered: number }>(sql`
          select
            e.class_id as "classId",
            count(e.id)::int as "totalStudents",
            count(tr.id) filter (where tr.teacher_remark is not null and length(trim(tr.teacher_remark)) > 0)::int as "remarksEntered"
          from enrolment e
          left join term_report tr on tr.school_id = e.school_id and tr.enrolment_id = e.id
          where e.school_id = ${ctx.schoolId} and e.term_id = ${current.term.id} and e.withdrawn_on is null
          group by e.class_id
        `),
  ]);

  const teacherByClass = new Map(teachers.map((t) => [t.classId, t]));
  const remarksByClass = new Map(remarkRows.rows.map((r) => [r.classId, r]));

  let totalSubjectOfferings = 0;
  let completedSubjectOfferings = 0;
  let totalRemarksExpected = 0;
  let totalRemarksEntered = 0;
  let totalStudentsCount = 0;
  let upToDateCount = 0;
  let laggingCount = 0;

  const sectionMap = new Map(sections.map((s) => [s.id, s.name]));

  const reports: ClassLaggingReport[] = classes.map((cls) => {
    const teacher = teacherByClass.get(cls.id) ?? null;
    const remarkInfo = remarksByClass.get(cls.id) ?? { totalStudents: 0, remarksEntered: 0 };
    const students = remarkInfo.totalStudents;
    const remarksDone = remarkInfo.remarksEntered;
    const remarksPending = Math.max(0, students - remarksDone);
    const remarkPercent = students > 0 ? Math.round((remarksDone / students) * 100) : 0;

    const subjectsTaken = scoreRows.filter((r) => r.classId === cls.id && r.takers > 0);
    const unfinishedSubjects = subjectsTaken
      .filter((r) => r.complete < r.takers)
      .map((r) => ({
        classSubjectId: r.classSubjectId,
        name: r.name,
        complete: r.complete,
        takers: r.takers,
        isElective: r.isElective,
        missingCount: r.takers - r.complete,
      }));

    const totalSub = subjectsTaken.length;
    const doneSub = totalSub - unfinishedSubjects.length;
    const scorePercent = totalSub > 0 ? Math.round((doneSub / totalSub) * 100) : 0;

    totalSubjectOfferings += totalSub;
    completedSubjectOfferings += doneSub;
    totalRemarksExpected += students;
    totalRemarksEntered += remarksDone;
    totalStudentsCount += students;

    const scoresComplete = totalSub > 0 && unfinishedSubjects.length === 0;
    const remarksComplete = students > 0 && remarksPending === 0;

    let status: ClassLaggingReport["status"];
    if (students === 0) {
      status = "no_students";
    } else if (!teacher) {
      status = "no_teacher";
      laggingCount++;
    } else if (scoresComplete && remarksComplete) {
      status = "up_to_date";
      upToDateCount++;
    } else if (!scoresComplete && !remarksComplete) {
      status = "severely_lagging";
      laggingCount++;
    } else if (!scoresComplete) {
      status = "scores_lagging";
      laggingCount++;
    } else {
      status = "remarks_lagging";
      laggingCount++;
    }

    return {
      id: cls.id,
      name: cls.name,
      sectionId: cls.sectionId,
      sectionName: sectionMap.get(cls.sectionId) ?? "",
      teacher: teacher
        ? {
            id: teacher.staffId,
            title: teacher.title,
            fullName: teacher.fullName,
            phone: teacher.phone,
          }
        : null,
      totalStudents: students,
      scores: {
        totalSubjects: totalSub,
        completedSubjects: doneSub,
        percent: scorePercent,
        unfinished: unfinishedSubjects,
      },
      remarks: {
        totalStudents: students,
        entered: remarksDone,
        pending: remarksPending,
        percent: remarkPercent,
      },
      status,
    };
  });

  const overallScorePercent =
    totalSubjectOfferings > 0 ? Math.round((completedSubjectOfferings / totalSubjectOfferings) * 100) : 0;
  const overallRemarkPercent =
    totalRemarksExpected > 0 ? Math.round((totalRemarksEntered / totalRemarksExpected) * 100) : 0;

  const groupedSections = sections
    .map((s) => ({
      id: s.id,
      name: s.name,
      classes: reports.filter((r) => r.sectionId === s.id),
    }))
    .filter((s) => s.classes.length > 0);

  return {
    school: schoolRow,
    term: {
      id: current.term.id,
      number: current.term.number,
      isCurrent: current.term.isCurrent,
      resultsReleasedAt: current.term.resultsReleasedAt,
    },
    session: {
      id: current.session.id,
      name: current.session.name,
    },
    summary: {
      totalClasses: classes.length,
      totalStudents: totalStudentsCount,
      totalSubjectOfferings,
      completedSubjectOfferings,
      overallScorePercent,
      totalRemarksExpected,
      totalRemarksEntered,
      overallRemarkPercent,
      upToDateClasses: upToDateCount,
      laggingClasses: laggingCount,
    },
    sections: groupedSections,
  };
}
