// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { createElement as h } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { PrincipalDashboard } from "@/components/principal/principal-dashboard";
import { assertLeadership, type PrincipalOverview } from "@/server/data";
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
            phone: "0803 123 4567",
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
            phone: "0805 987 6543",
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
            phone: "0802 444 5555",
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
});

describe("Principal Portal - Dashboard UI", () => {
  it("renders school name, principal details, and executive KPI summary cards", () => {
    render(h(PrincipalDashboard, { data: mockOverview }));

    expect(screen.getByText("Grace High School")).toBeInTheDocument();
    expect(screen.getByText("Mr Samuel Adeleke")).toBeInTheDocument();
    expect(screen.getByText("81%")).toBeInTheDocument(); // score submissions percent
    expect(screen.getByText("65%")).toBeInTheDocument(); // remarks percent
    expect(screen.getByText("85")).toBeInTheDocument(); // total students
  });

  it("renders lagging teachers with contact numbers and unfinished subjects", () => {
    render(h(PrincipalDashboard, { data: mockOverview }));

    // Form masters visible
    expect(screen.getByText("Mrs Funke Adewale")).toBeInTheDocument();
    expect(screen.getByText("0803 123 4567")).toBeInTheDocument();
    expect(screen.getByText("Mr Ibrahim Musa")).toBeInTheDocument();
    expect(screen.getByText("0805 987 6543")).toBeInTheDocument();

    // Lagging subjects visible with taker counts
    expect(screen.getByText("Basic Technology")).toBeInTheDocument();
    expect(screen.getByText("(12/30)")).toBeInTheDocument();
    expect(screen.getByText("Chemistry")).toBeInTheDocument();
    expect(screen.getByText("(10/27)")).toBeInTheDocument();

    // Broadsheet action buttons present
    const broadsheetLinks = screen.getAllByRole("link", { name: /view broadsheet/i });
    expect(broadsheetLinks.length).toBe(3);
    expect(broadsheetLinks[0]).toHaveAttribute("href", "/ghs/classes/cls-jss1/broadsheet");
    expect(broadsheetLinks[1]).toHaveAttribute("href", "/ghs/classes/cls-jss2/broadsheet");
    expect(broadsheetLinks[2]).toHaveAttribute("href", "/ghs/classes/cls-ss1/broadsheet");
  });

  it("filters classes by lagging status", async () => {
    const user = userEvent.setup();
    render(h(PrincipalDashboard, { data: mockOverview }));

    // Click 'Lagging (2)' filter
    const laggingFilterBtn = screen.getByRole("button", { name: /lagging \(2\)/i });
    await user.click(laggingFilterBtn);

    // JSS 1 Gold (up to date) should be filtered out
    expect(screen.queryByText("JSS 1 Gold")).not.toBeInTheDocument();
    // JSS 2 Diamond & SS 1 Science should remain
    expect(screen.getByText("JSS 2 Diamond")).toBeInTheDocument();
    expect(screen.getByText("SS 1 Science")).toBeInTheDocument();
  });

  it("searches by teacher name or subject", async () => {
    const user = userEvent.setup();
    render(h(PrincipalDashboard, { data: mockOverview }));

    const searchInput = screen.getByPlaceholderText(/search class or teacher/i);
    await user.type(searchInput, "Funke");

    expect(screen.getByText("JSS 1 Gold")).toBeInTheDocument();
    expect(screen.queryByText("JSS 2 Diamond")).not.toBeInTheDocument();
    expect(screen.queryByText("SS 1 Science")).not.toBeInTheDocument();
  });

  it("switches to Master Results (Broadsheet) tab with class matrix", async () => {
    const user = userEvent.setup();
    render(h(PrincipalDashboard, { data: mockOverview }));

    const broadsheetTabBtn = screen.getByRole("button", { name: /master results/i });
    await user.click(broadsheetTabBtn);

    // Master Results table is visible
    expect(screen.getByText(/Master Compilation Sheets \(Webview\)/i)).toBeInTheDocument();
    const openBroadsheetBtns = screen.getAllByRole("link", { name: /open broadsheet/i });
    expect(openBroadsheetBtns.length).toBe(3);
    expect(openBroadsheetBtns[0]).toHaveAttribute("href", "/ghs/classes/cls-jss1/broadsheet");
  });
});
