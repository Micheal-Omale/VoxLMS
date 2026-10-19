# 0011. Remarks: decision record

## Context

Every Nigerian report card carries a form master's (or class teacher's) comment and a comment from whoever signs the card: the principal, or a section's own head (spec 0007). The scope row (#11) also named attendance, but the pilot school has the attendance box switched off, and the engineer chose to defer it rather than build an unused screen before results day.

The storage already exists: `term_report` (spec 0003) holds both comments for one student in one term. What's missing is how the comments get written, who writes the head's comment, and how they reach the card (#12).

The forces:
- **Volume on a phone.** A form master writes for 30 to 45 students, usually on a phone between lessons, close to results day. Typing two comments per student by hand is the slowest path.
- **The principal has no login.** Principal and school admin roles exist but are switched on by later features (spec 0004), and principal approval is deferred. Someone else must produce the head's comment for Release 1.
- **Consistency with results.** The head's comment usually reflects the student's overall performance. If it is typed once and scores change later, the comment and the printed average can disagree.
- **Proven saving pattern.** The score sheet (spec 0009) already solved lost work on bad networks, two people saving at once, closed terms and students leaving mid term. A second, weaker pattern would confuse teachers and repeat the same bugs.
- **One A4 page.** The card must fit on one page with the most subjects any class takes (#12), so comment length needs a fixed budget.

## Options considered

### Option 1: Class sheet, typed teacher's comment, automatic head's comment from school bands, score sheet saving (chosen)

One Remarks sheet per class. The teacher types each comment with a fixed list of quick picks. The head's comment is picked by average from school wide bands our team sets, and can be typed over per student. Saving reuses the score sheet's draft, conflict and closed term behaviour.

**Pros**:
- No typing for the head's comment, and it always matches the printed average.
- Teachers already know the save behaviour; the draft and conflict helpers exist.
- One small table; nothing computed is stored.

**Cons**:
- Same band, same words: head's comments can feel generic.
- More build than a plain text box (bands editor, three head comment states).

### Option 2: Both comments typed, saved per row as the teacher moves on

Two free text boxes per student, autosaved when the teacher leaves a row. No bands, no Save button.

**Pros**:
- Smallest build; every comment is personal.

**Cons**:
- Twice the typing, and the teacher writes in the principal's voice for every student.
- A bad network loses the row being typed, and two people saving the same row is silently last one wins, the very failures spec 0009 was built to prevent.
- A typed head's comment can contradict a later corrected average.

### Option 3: Comments inside each student's result panel

Add the comment fields to the breakdown panel on the class page (spec 0010), so the teacher sees every subject while writing.

**Pros**:
- The richest context for writing a fitting comment.

**Cons**:
- Forty panels opened one by one; slow on a phone and easy to miss a student.
- No class wide view of who still needs a comment.

### Option 4: Blank line for the principal's pen

Store only the teacher's comment; the card leaves a ruled line and the principal writes by hand after printing.

**Pros**:
- Nothing to build for the head's comment; the principal's words are truly theirs.

**Cons**:
- Hundreds of cards to write by hand on results day, and nothing for the online result (#21) or a reprint (#15) to show.

## Rationale

Option 1 matches the forces directly. The volume on a phone and the absent principal login both point at an automatic head's comment, and tying it to the overall average from spec 0010 means it can never contradict the printed figures. That is the consistency the rest of the system already guarantees for totals and positions. Keeping it automatic until someone types over it (rather than stamping the text into the row) follows the project rule that nothing computed is stored. A typed comment is the only thing kept, so a corrected score still corrects every untyped comment.

Reusing the score sheet's saving is the main reason not to take the cheaper Option 2: spec 0009 exists because lost typing and silent overwrites were judged unacceptable on results day, and those risks don't shrink for text. The bands live per school, not per section or per session, because the principal speaks the same way across the school and our team should not have to retype wording every session. The cost (old reprints show new wording) is the same trade the engineer already accepted for principal names. The 200 character budget keeps each comment to about two printed lines, so #12 can plan a fixed space.

Choices made at the engineer's direction: automatic head's comment that can be typed over; quick picks from a fixed starter list in code; school wide bands with no history, keyed on overall average; one class sheet reached from a Remarks section on the class page; bands edited on the Grading page; last change only, no history; incomplete results wait for all scores; teacher's comments optional with progress shown; quick picks add to the end; whitespace folded to one line; attendance deferred. Calls made in this spec: the 5 default bands and 10 quick picks (wording a school can live with on day one, written without he or she); storing a typed head's comment as typed even when it equals the automatic text (what the person chose stays put; runner up was clearing it back to automatic, which would let it drift later); no hard typing limit, only a counter and a blocked Save (silent truncation loses words, especially on paste).
