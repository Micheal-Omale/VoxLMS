# 0010. Rationale: results computation

## Context

Once a form master has entered a class's scores (spec 0009), the school needs the figures a Nigerian report card prints: each subject's total, grade, remark and position in the subject, the subject's class average, highest and lowest, and the student's overall total, average and position in class ("5th of 32"). Today teachers work these out by hand or in Excel over a weekend before results day. The pilot school prints First Term 2026/2027 cards in early December 2026, so this must be right the first time.

Parents check report cards line by line, and some check with a calculator. Three things cause most disputes: ties (Nigerian schools share a position and skip the next, so two students 3rd and the next 5th), rounding (a figure that rounds differently from a calculator looks like a mistake), and missing scores (a blank silently counted as 0 drags a child down; a blank silently left out lifts them up). Spec 0003 decided results are worked out at read time and never stored, and that a missing score is the absence of a row. Spec 0006 left open how a decimal total like 69.5 meets whole number grade bands. Spec 0009 left open how a missing part prints and whether an "Absent" mark is needed.

Classes vary. Senior students take different electives, so they take different numbers of subjects. Students are withdrawn mid term. The split can change mid term (a part added), and the grade scale can be corrected at any time, and both must flow through at once. Three later features read the same figures: the report card PDF (#12), the single student reprint (#15) and the class broadsheet (#16). If any two compute separately, they will eventually disagree on paper.

Business rules confirmed with the engineer (2026-10-18): an incomplete student's overall result is withheld while everyone else is ranked; class position is by average; ties are judged on the printed two place average; a decimal total is graded exactly (69.5 is B); averages show two places, rounded half up; ranking is within the arm; positions are provisional until the whole class is complete; "number in class" is every open enrolment; no "Absent" or "Exempt" mark for now (the teacher types 0 where the school counts a missed exam as 0); a Results section on the class page, between Scores and Students, with incomplete students listed below the ranked ones; the class average and subject positions are computed; highest and lowest average and an overall grade are not; shared positions print as plain "3rd"; nothing is stored.

## Options considered

### Option 1: Pure computation over one snapshot read (chosen)

One data function reads everything a class's results need for a term inside one read only snapshot (spec 0003's `readSnapshot`) and passes plain rows to a pure TypeScript function that applies every rule in whole number tenths. The page renders the result; later features call the same loader inside their own snapshot.

**Pros**:
- Every rule (ties, half up rounding, missing parts, electives, withdrawn students) lives in one small function that unit tests can check against a hand calculation with no database.
- Whole number arithmetic means the code and a calculator agree exactly.
- Nothing stored, so nothing drifts; a corrected score updates every position on the next read (#15 relies on this).
- One loader for the Results section, the report card and the broadsheet, so they cannot disagree.

**Cons**:
- Recomputed on every view; cheap for a class of 50, but the work grows with schools and views.
- Rows travel from the database to the app (a few thousand at most per class) instead of only the answers.

### Option 2: Ranking in SQL with window functions

A query (or a database view) sums parts per subject, averages per student and uses `rank() over (...)` for positions, returning finished figures.

**Pros**:
- Postgres does the work close to the data; fewer rows cross the network.
- `rank()` already gives competition ranking (1, 2, 3, 3, 5).

**Cons**:
- The rules split between SQL and TypeScript (ordinals, provisional state, the missing parts list), so no single place holds them.
- The tie must be judged on the rounded average, which means rounding inside the window, a subtle rule that is easy to get wrong and hard to test without a database.
- Hand calculation tests need seeded database rows for every case, which is slower and noisier than plain data.

### Option 3: Store results when the class is final

When every student is complete, compute once and save totals, averages and positions to a `term_result` table that the card and broadsheet read.

**Pros**:
- Reads are trivial and fast.
- A record of what was printed.

**Cons**:
- Goes stale the moment a score, the split or the grade scale changes; every change path must remember to recompute, and one that forgets prints wrong positions.
- A migration and a recompute trigger before December, for a speed problem nobody has measured.
- Breaks spec 0003's rule that results are never stored.

## Rationale

Option 1 fits the forces in Context directly. The whole risk of this feature is a figure that disagrees with a parent's calculator or with another document. Putting every rule in one pure function, working in whole number tenths, makes the hand calculation test (AC-12) a plain table of inputs and expected outputs, and the shared loader makes disagreement between the Results section, the report card and the broadsheet impossible by construction. The cost, recomputing per view, is a few queries and some arithmetic over at most about 50 students by 20 subjects; at pilot size that is nothing, and spec 0003 already chose read time results for exactly this reason. Option 2 is the runner up and stays available if a measured slowdown ever appears: the pure function's tests would then check the SQL. Option 3 trades a problem we have (correctness under corrections) for one we don't (read speed).

The engineer's choices shape the rules. Withholding an incomplete student's overall result, rather than averaging what is there, follows from the scope's promise that a missing score is never silently counted; averaging the complete subjects only would let a missing weak subject lift a child's position. Ranking by average, not total, is forced by senior electives. Judging ties on the printed figure keeps the card self consistent: two identical printed averages with different positions would be queried at the school gate. Grading the exact total keeps the results identical to the live grade the score sheet already shows; rounding 69.5 up to an A would have made the sheet and the card disagree.

**Decisions settled while writing** (each with the runner up):
- Arithmetic in whole number tenths and hundredths, with one `divHalfUp` helper. Runner up: JavaScript numbers with `Math.round`, which round some values wrongly (1.005 becomes 1, not 1.01) because of how computers store decimals.
- The class average is the mean of the printed two place averages. A form master checking it adds up the column they see. Runner up: the mean of the exact averages, which can differ in the last digit from what a hand check gives.
- Subject positions use the exact one decimal total, which is already what is printed, so no rounding question arises.
- The breakdown panel reads the results the page already holds, with no server action per student. Runner up: a server action like score history, which adds a network round trip on a slow phone for data the page already has.
- `loadClassResults` runs on whatever `db` it is given, and `getClassResults` wraps it in `readSnapshot`. Drizzle turns a nested transaction into a savepoint, which cannot change the isolation level, so the report card must call the loader inside its own snapshot rather than nest snapshots. Runner up: one function that detects an existing transaction, which hides the rule instead of naming it.
- Equal positions list in surname order, then other names, matching the class register. Runner up: student number order, which means nothing to a teacher.
- The pure module lives in `src/lib/results.ts`, without `server-only`, so tests import it directly and a client component can use its formatting helpers. The data loading lives in the existing `src/server/data/results.ts`, next to `getStudentSessionResults`.
