# 0015. Class broadsheet (master compilation sheet)

**Date**: 2026-10-19
**Status**: In Progress

## Summary

The class broadsheet is the master compilation sheet Nigerian school principals, section heads and exam officers rely on to review every student and every subject side-by-side in one grand matrix before approving results. Built as an interactive web view (no downloads or Excel export for now), it displays all class results computed on-the-fly via Spec 0010's `loadClassResults`, showing the full CA and exam breakdown by default with sticky headers and pinned student columns for smooth scrolling.

## Requirements

**User stories**:
- As a principal, I want to review all class grades together on one master screen, so that I can see subject performance, compare student scores, and spot missing marks before approving report cards.
- As a form master, I want to see the whole class score matrix with full CA and Exam breakdowns, so that I can verify calculations and identify incomplete students.
- As a principal or form master, I want student names and subject headers to stay fixed while I scroll through many subjects and students, so that I never lose context.
- As our team, I want the broadsheet to read exclusively through `loadClassResults`, so that broadsheet figures always match the report cards and class results exactly.

**Acceptance criteria** (the contract):

- **AC-1**: Dedicated web view routes:
  - Teacher / staff route: `/[school]/classes/[classId]/broadsheet`
  - Admin / leadership route: `/admin/schools/[schoolId]/classes/[classId]/broadsheet`
  - Both accept an optional `?term` search param, defaulting to the current term up to the current term of the session.
  - A prominent "Broadsheet" (or "Master compilation sheet") link in the Results section on `/[school]/classes/[classId]` and the admin class view takes the user directly to this page.
  - No file download buttons (no Excel, no PDF download).

- **AC-2**: Zero duplicate computation:
  - Every figure comes solely from `loadClassResults` / `getClassResults` in `src/server/data/results.ts`.
  - Nothing computed is stored; scores never count a missing entry as 0.

- **AC-3**: Matrix grid layout:
  - **Left pinned columns**:
    - `Pos` (or S/N): student rank (with badge for 1st, 2nd, 3rd)
    - `Student Name`: surname first in uppercase, then other names (e.g. `OKON, Emem`)
    - `ID / Adm. No`: student admission number or formatted student ID
  - **Subject columns**:
    - Every offered subject in curriculum order (compulsory first, then electives).
    - Top header row displays Subject Name (spanning all sub-columns: `colSpan = split.length + 2`).
    - Sub-header row displays each assessment component in the school's split (e.g. `CA 1 [20]`, `CA 2 [20]`, `Exam [60]`), followed by `Total` and `Grade`.
  - **Right summary columns**:
    - `Grand Total`: sum of complete subject totals in tenths.
    - `Average`: overall student average percentage in hundredths (e.g. `78.45%`).
    - `Class Position`: student position in class (e.g. `5th of 32`).
    - `Status`: `Ranked` or `Incomplete`.
  - **Bottom summary rows**:
    - `Class Average`: average total for each subject and overall class average.
    - `Highest`: highest score achieved in that subject.
    - `Lowest`: lowest score achieved in that subject.

- **AC-4**: Cell contents & missing score indicators:
  - If a student takes a subject and a component score is missing, the cell displays an unentered mark `—` highlighted with a subtle warning/red pen accent.
  - If a student does not take an elective subject, every cell for that subject displays a neutral dash `—`.
  - Subject totals and grades are rendered in bold tabular figures.

- **AC-5**: Interactive review toolbar:
  - **Sort mode**:
    - `By Position` (1st, 2nd, 3rd... — default)
    - `By Name` (Alphabetical by Surname)
  - **View mode**:
    - `Full Breakdown` (shows every CA component + Exam + Total + Grade — default)
    - `Totals only` (compact view showing only Total + Grade per subject)
  - **Filter**:
    - `All students` (default)
    - `Incomplete only` (filters table to only students with unentered marks)

- **AC-6**: Pinned navigation & sticky positioning:
  - Sticky table headers pinned to the top of the viewport when scrolling down.
  - Pinned student name columns on the left when scrolling horizontally.
  - High-contrast column divider separating the pinned student information from the scrolling subject matrix.
  - Responsive container supporting desktop and tablet screen sizes.

- **AC-7**: Access & security:
  - Teachers can access the broadsheet only for their assigned form classes this session; other classes return 404.
  - School team/admin can access broadsheets for any class in their school.
