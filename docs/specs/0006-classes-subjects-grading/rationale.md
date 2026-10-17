# 0006. Rationale: classes, subjects and grading rules

## Context

The data model (spec 0003) already holds classes, school subjects, the subjects each class offers per session, the score split per section per session, and grade bands. School setup (spec 0005) gives our team a checklist with sections and sessions in place. What is missing is the way to fill in what a school teaches and how it grades, and the rules for changing it safely once teachers have saved scores. Score entry (#9) cannot start until a class has subjects and its section has a split.

The forces: onboarding should take about an hour per school (#20), on a patchy school office connection, by a team of one or two. A secondary school has 12 to 20 classes across JSS 1 to SS 3, usually with the same arms at each level, and most levels offer the same subjects in every arm, with senior arms differing (Science, Arts, Commercial). Schools rename standard subjects ("English Studies") and list them in their own fixed order on report cards. Splits are mostly CA 1 20 / CA 2 20 / Exam 60, with primary schools often using one CA, and grade scales follow A to F for basic education and WAEC A1 to F9 for senior secondary, with some schools moving the cut offs.

Mistakes in setup are found after scores are in (a wrong maximum, a subject offered to the wrong arm). A change that quietly breaks saved scores would show up as wrong report cards that parents check, which is the outcome this product most has to avoid. Students do not exist until #8, so anything about individual students (elective registration) cannot be used yet.

Decisions confirmed with the engineer: classes from a levels × arms grid; subjects ticked from the standard list; subjects set per level and applied to all arms, with per class differences; electives marked here and registered in #8; splits from presets, 1 to 5 parts adding to 100; grade scale preset per stage and editable; only safe changes once scores exist; one school wide subject order; a "Copy from last session" button; delete if unused, else switch off; at most 20 subjects per class; pages open on the current session with a switcher; three checklist items.

## Options considered

### Option 1: Three checklist pages over the existing tables (chosen)

Subjects, Classes (with each level's subject offer), and Score split and grades, each a page of small forms saving into the spec 0003 tables. "Per level" is a way of editing: it writes one `class_subject` row per arm. One add only migration gives subjects an order and an on/off flag.

**Pros**:
- No new tables and no change to how scores link to class subjects, so score entry, results and the report card read the same rows they already expect.
- Fits the checklist pattern of spec 0005; each part saves on its own.
- Safety rules sit in one transaction per save, next to the rows they protect.

**Cons**:
- A new arm doesn't inherit its level's subjects automatically; the level offer has to be saved again.
- The level view has to work out "partly offered" from the arms' rows.

### Option 2: Level templates that classes inherit live

A new `level_offer` table holds each level's subjects per session; classes read it and store only their differences.

**Pros**:
- A new arm gets its level's subjects at once.
- The level's offer is one clear record.

**Cons**:
- Two sources of truth (template plus differences) that every reader must merge, including the score save, results and the PDF.
- Scores link to `class_subject` through composite keys (spec 0003); moving offers into a template means reworking those keys or keeping both in step.
- More to build before the December deadline, for a benefit felt only when arms change mid session.

### Option 3: One guided wizard for all of it

A single step by step flow: subjects, then classes, then offers, then split and scale.

**Pros**:
- Clear for a first school setup.

**Cons**:
- Awkward for the common later job of fixing one thing; an interrupted wizard is confusing; each later feature changes the wizard (the same reason spec 0005 chose a checklist).

### Option 4: A shared library of split and scale templates across schools

Presets stored as rows any school can pick from, managed by our team.

**Pros**:
- Our team can add a new common preset without a code change.

**Cons**:
- A new table and admin screen for six presets that rarely change; presets in code do the same job until there are many schools (#20).

## Rationale

The tables already model this correctly, and the riskiest part of the feature is not the screens but changing setup after scores exist. Option 1 keeps every score linked to the same `class_subject` and `assessment_component` rows and puts each safety check inside the save transaction that changes them, which is the simplest way to guarantee no report card breaks. Option 2's live inheritance would make every later reader (score save, results, PDF, broadsheet) merge two sources, adding risk to the parts of the product parents check, to save a click when an arm is added mid session. The partly ticked level view gives most of that benefit without the second source of truth.

A single school wide subject order matches how Nigerian report cards are laid out (the same subject order for every class) and needs one column rather than per class ordering. Delete if unused, else switch off, follows the data model's rule that nothing holding children's records is deleted, while still letting a mistake made during setup disappear cleanly. Keeping part keys fixed after creation matters because score saves name parts by key (spec 0003); a renamed label must not disconnect scores.

The lock between saving the split and saving scores closes a real race: without it, our team could lower CA 1 to 15 at the moment a teacher's save of 18 passes its check, leaving a score above its maximum. Presets live in code because there are six of them and they change rarely; a table is worth it only once many schools want their own (#20).
