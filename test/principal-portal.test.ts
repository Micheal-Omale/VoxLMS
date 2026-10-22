// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { createElement as h } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { PrincipalDashboard } from "@/components/principal/principal-dashboard";
import { assertLeadership, assertWritable, type PrincipalOverview, ReadOnlySession, schoolContext } from "@/server/data";
import { assertNotTeacher } from "@/server/data/access";
import { NotFound } from "@/server/data/errors";

afterEach(cleanup);

const mockOverview: PrincipalOverview = {
  school: {
    id: "sch-1",
    name: "Grace High School",
    slug: "ghs",
    principalName: "Mr Samuel Adeleke",
    principalTitle: "Principal",
  },
  term: {
    id: "term-1",
    number: 1,
    isCurrent: true,
    resultsReleasedAt: null,
  },
  session: {
    id: "sess-1",
    name: "2026/2027",
  },
  summary: {
    totalClasses: 3,
    totalStudents: 85,
    totalSubjectOfferings: 27,
    completedSubjectOfferings: 22,
    overallScorePercent: 81,
    totalRemarksExpected: 85,
    totalRemarksEntered: 55,
    overallRemarkPercent: 65,
    upToDateClasses: 1,
    laggingClasses: 2,
  },
  sections: [
    {
      id: "sec-junior",
      name: "Junior Secondary",
      classes: [
        {
          id: "cls-jss1",
          name: "JSS 1 Gold",
          sectionId: "sec-junior",
          sectionName: "Junior Secondary",
          teacher: {
            id: "t-1",
            title: "Mrs",
            fullName: "Funke Adewale",
            phone: "+2348031234567",
          },
          totalStudents: 28,
          scores: {
            totalSubjects: 9,
            completedSubjects: 9,
            percent: 100,
            unfinished: [],
          },
          remarks: {
            totalStudents: 28,
            entered: 28,
            pending: 0,
            percent: 100,
          },
          status: "up_to_date",
        },
        {
          id: "cls-jss2",
          name: "JSS 2 Diamond",
          sectionId: "sec-junior",
          sectionName: "Junior Secondary",
          teacher: {
            id: "t-2",
            title: "Mr",
            fullName: "Ibrahim Musa",
            phone: "+2348059876543",
          },
          totalStudents: 30,
          scores: {
            totalSubjects: 9,
            completedSubjects: 6,
            percent: 67,
            unfinished: [
              {
                classSubjectId: "cs-btech",
                name: "Basic Technology",
                complete: 12,
                takers: 30,
                isElective: false,
                missingCount: 18,
              },
            ],
          },
          remarks: {
            totalStudents: 30,
            entered: 15,
            pending: 15,
            percent: 50,
          },
          status: "scores_lagging",
        },
      ],
    },
    {
      id: "sec-senior",
      name: "Senior Secondary",
      classes: [
        {
          id: "cls-ss1",
          name: "SS 1 Science",
          sectionId: "sec-senior",
          sectionName: "Senior Secondary",
          teacher: {
            id: "t-3",
            title: "Mr",
            fullName: "Babatunde Raji",
            phone: "+2348024445555",
          },
          totalStudents: 27,
          scores: {
            totalSubjects: 9,
            completedSubjects: 7,
            percent: 78,
            unfinished: [
              {
                classSubjectId: "cs-chm",
                name: "Chemistry",
                complete: 10,
                takers: 27,
                isElective: false,
                missingCount: 17,
              },
            ],
          },
          remarks: {
            totalStudents: 27,
            entered: 12,
            pending: 15,
            percent: 44,
          },
          status: "severely_lagging",
        },
      ],
    },
  ],
};

describe("Principal Portal - Permissions", () => {
  it("allows principal, admin, and system to access leadership overview", () => {
    expect(() => assertLeadership({ kind: "principal", staffId: "p1", readOnly: false })).not.toThrow();
    expect(() => assertLeadership({ kind: "admin", readOnly: false })).not.toThrow();
    expect(() => assertLeadership({ kind: "system" })).not.toThrow();
  });

  it("denies regular teachers with NotFound", () => {
    expect(() => assertLeadership({ kind: "teacher", staffId: "t1", readOnly: false })).toThrow(NotFound);
  });

  // A principal reviews every class but never changes a score or comment, and
  // school setup (terms, students, PIN slips) stays our team's.
  it("refuses every write from a principal", () => {
    const principal = schoolContext({ schoolId: "sch-1", userId: "u1", actor: { kind: "principal", staffId: "p1", readOnly: false } });
    expect(() => assertWritable(principal)).toThrow(ReadOnlySession);
    expect(() => assertWritable(principal)).toThrow("Only its form teacher can change it.");
    expect(() => assertNotTeacher(principal, "Term")).toThrow(NotFound);
    const teacher = schoolContext({ schoolId: "sch-1", userId: "u2", actor: { kind: "teacher", staffId: "t1", readOnly: false } });
    expect(() => assertWritable(teacher)).not.toThrow();
  });
});

describe("Principal Portal - Dashboard UI", () => {
  it("shows the school, the term and how far scores and comments are", () => {
    render(h(PrincipalDashboard, { data: mockOverview }));

    expect(screen.getByRole("heading", { level: 1, name: "Grace High School" })).toBeInTheDocument();
    expect(screen.getByText(/results not released yet/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Subjects with every score in" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Form teacher comments written" })).toBeInTheDocument();
    expect(screen.getByText(/85 students this term/)).toBeInTheDocument();
  });

  it("lists each class's form teacher, phone and what is left, with its broadsheet", () => {
    render(h(PrincipalDashboard, { data: mockOverview }));

    expect(screen.getByText(/Mrs Funke Adewale/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "+234 805 987 6543" })).toHaveAttribute("href", "tel:+2348059876543");
    expect(screen.getByText("Scores still missing in Basic Technology (18 students).")).toBeInTheDocument();
    expect(screen.getAllByText("15 comments still to write.")).toHaveLength(2);
    expect(screen.getByText("Every score and comment is in.")).toBeInTheDocument();

    const broadsheets = screen.getAllByText("Broadsheet").map((el) => el.closest("a")!);
    expect(broadsheets.map((a) => a.getAttribute("href"))).toEqual([
      "/ghs/classes/cls-jss1/broadsheet",
      "/ghs/classes/cls-jss2/broadsheet",
      "/ghs/classes/cls-ss1/broadsheet",
    ]);
  });

  it("shows only the classes still to finish", async () => {
    const user = userEvent.setup();
    render(h(PrincipalDashboard, { data: mockOverview }));

    await user.click(screen.getByRole("button", { name: /still to finish \(2\)/i }));

    expect(screen.queryByText("JSS 1 Gold")).not.toBeInTheDocument();
    expect(screen.getByText("JSS 2 Diamond")).toBeInTheDocument();
    expect(screen.getByText("SS 1 Science")).toBeInTheDocument();
  });

  it("finds a class by its form teacher", async () => {
    const user = userEvent.setup();
    render(h(PrincipalDashboard, { data: mockOverview }));

    await user.type(screen.getByRole("searchbox", { name: /find a class or teacher/i }), "Funke");

    expect(screen.getByText("JSS 1 Gold")).toBeInTheDocument();
    expect(screen.queryByText("JSS 2 Diamond")).not.toBeInTheDocument();
    expect(screen.queryByText("SS 1 Science")).not.toBeInTheDocument();
  });
});
