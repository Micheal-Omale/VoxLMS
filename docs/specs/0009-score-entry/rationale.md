# 0009. Score entry: rationale

## Context

Release 1 is done when the pilot school enters one class's scores and prints every report card for that class. The tables, the all or nothing save with its conflict check, and the add only change log already exist (spec 0003). The class access rule exists too (spec 0004). A teacher can now sign in and see their class (spec 0008), but nothing lets them type a score. The ruled `ScoreSheet` exists only as a design preview, fixed at three parts and fed demo data.

The people typing are form masters on cheap Android phones, often outdoors, on networks that drop, and under pressure in the last week of term. In Release 1 the form master enters every subject for their class (spec 0003; subject teachers come later). A class takes 10 to 15 subjects, with 20 to 45 students each, and a split of 1 to 5 parts per section (spec 0006). So one form master types up to a few thousand numbers per term. Losing typed work once is enough for a teacher to go back to paper.

Mistakes are expensive afterwards. Parents check report cards line by line, and disputes ("my child's score was changed") need an answer. A score must never become 0 when it was simply not typed, and a score typed against a student who has since left the class, or a maximum that has changed, must not land silently. Our team also types scores during the pilot when a teacher hands in paper, so two people can work on the same sheet.

Once a term's report cards are printed, the scores behind them should stop moving, or the paper and the system disagree. The product has no approval or lock step yet (principal approval is deferred in the scope). The deadline is early December 2026, and the team is one developer, so anything beyond the smallest safe tool has to earn its place.

## Options considered

### Option 1: Subject list with progress, one ruled sheet per subject, explicit Save (chosen)

The class page lists subjects with "N of M complete". Each subject opens the ruled sheet: one row per student, one field per part, a live total and grade, and a sticky Save that sends only the changes. Typed scores are kept on the device until confirmed. Conflicts and out of date sheets are handled on the sheet. Only the current term can be saved.

**Pros**:
- Matches how teachers already work: one subject's mark sheet at a time.
- Fits a phone: a handful of fields per row, at most 5.
- Builds on the existing sheet, save, and change log; no migration.
- Progress tells the teacher and our team exactly what is left before results day.

**Cons**:
- One more screen (the subject list) before typing starts.
- A form master with 15 subjects opens 15 sheets.

### Option 2: Single sheet with a subject switcher, no overview

The class page opens straight onto the first subject's sheet, with a dropdown to change subject.

**Pros**:
- One less screen; the fastest path to the first score.
- Less to build.

**Cons**:
- No view of which subjects still have missing scores; teachers and our team find out at print time.
- The dropdown hides how much is left.

### Option 3: One grid of every subject and part for the class

Students down the side, every subject's parts across the top, like a broadsheet.

**Pros**:
- Everything for the class in one place; good on a laptop with a spreadsheet habit.
- One save for the whole class.

**Cons**:
- Unusable on a phone with 12 subjects of 3 parts (36 columns).
- A conflict or refusal in one subject blocks the whole class save, or forces splitting saves anyway.
- Does not match the existing save, which is per class subject.

### Option 4: Autosave as you type

Any of the layouts above, but each change saves itself after a short pause, with no Save button.

**Pros**:
- Nothing to remember to tap.
- Less typed work is ever held only on the device.

**Cons**:
- Refusals and conflicts appear while the teacher is still typing, mid row.
- Many small requests on poor, metered networks, and a half typed "1" on its way to "17" can briefly save.
- A circled over maximum score is harder to treat as blocking when there is no Save to block.

## Rationale

The forces that matter most are cheap phones on bad networks, a teacher who must never lose typed work, and a deadline with one developer. Option 1 keeps each save small (one subject, at most 45 rows) and matches the existing per subject `saveScores`. So the all or nothing rule, the conflict check and the change log apply without change. The subject list costs one screen, but it is what turns "did I finish?" from a guess into a number. Our team's Scores page reuses the same count. Option 2 saves that screen but leaves the most common results day failure (a subject forgotten) to be found at print time. Option 3 is a laptop answer to a phone problem.

An explicit Save with a device draft beats autosave here. The design system already promises "never lose typed work" through the draft. An explicit Save gives one clear moment where refusals (too high, conflict, student left) are shown and settled, instead of interrupting typing. It also sends one request per subject instead of dozens on a metered connection.

Conflicts show both values and let the teacher choose. Our team and the form master can genuinely both touch a sheet during the pilot, and quietly dropping or overwriting either person's work is exactly the trust failure this product cannot afford. Limiting edits to the current term is the cheapest lock that matches how schools work. Report cards print at the end of the term the scores belong to, and the switch to the next term is already a deliberate act by our team. A per class lock belongs with principal approval later. Recording "absent" was left out: it would add storage and a rule that results computation (#10) has to own anyway. Paste, history and the team overview were chosen because each is cheap on what already exists (the sheet, the change log, the progress count) and directly reduces results day risk.
