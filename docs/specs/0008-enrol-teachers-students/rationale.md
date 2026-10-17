# 0008. Enrol teachers and students: rationale

## Context

Release 1 is done when a teacher signs in and sees their class, and our team prints that class's report cards. Today nothing in the app creates a teacher, a student or a parent: the demo school exists only through the seed. The tables (spec 0003) and the teacher's class access (spec 0004) are in place, but our team has no screens to fill them.

The pilot school has under 200 students in about a dozen classes, handed over as paper class registers, often without parents' phone numbers. Our team, not the school, does the typing, before First Term results in early December 2026. Speed of entry per class matters more than search across the school. Registers repeat siblings, so the same mother can appear under several children.

Students are enrolled per term (spec 0003). Without help, every class would be empty again when Second Term starts in January, and teachers would see empty classes until our team typed everything in again. Senior classes also need each student's electives registered before their scores can be saved (spec 0003, AC-8; moved here by spec 0006).

The records are children's personal data under the Nigeria Data Protection Act: names, photos and parents' phones. Parents check results with a PIN slip on the result page first (Release 3); sending results on WhatsApp, and the consent it needs, comes later as the product grows. Mistakes must be fixable, but a student with results must never vanish from past report cards.

## Options considered

### Option 1: Class by class admin screens over the existing tables (chosen)

A Students page leads to one list per class: a form master picker, a quick add row, a side panel for details, photo, parents and fixes, and an electives grid. A separate Staff page adds teachers with their login. Carry forward runs inside the term switch.

**Pros**:
- Matches the paper register our team types from, so a class is done in one sitting.
- No new tables; existing constraints (one enrolment per term, two parents, student numbers) already guard the data.
- The form master is set where our team is already looking.

**Cons**:
- No single list to search for one student across classes (our team must know the class).
- Several new screens (Staff, Students, class list, panel, grid) before the deadline.

### Option 2: One school wide Students directory with full forms

A single searchable list of every student, and an "Add student" dialog with every field, class and parents included.

**Pros**:
- Easy to find any student by name.
- One complete form per student, so nothing is half filled.

**Cons**:
- Much slower to type a 40 student register: a dialog per student with a class picker each time.
- Form masters and electives still need per class screens, so the class view gets built anyway.

### Option 3: A spreadsheet style grid for the whole class

One editable table per class, where our team types or pastes rows like Excel.

**Pros**:
- Fastest for bulk entry, and pasting from a sheet is natural.

**Cons**:
- Overlaps Excel import (#13), which already plans a checked upload with a preview of problems.
- Hard to show warnings (duplicate names, sibling parents) cell by cell, and hard to use on a phone.

## Rationale

Option 1 fits the real job: our team holds one class register at a time and types it in, under deadline. A quick add row with Enter covers the bulk, and the side panel keeps the less common fields (house, photo, parents) out of the way without leaving the class. Option 2 optimises for finding one student, which matters later but not for onboarding a school. Option 3 would duplicate Excel import, which is the right tool for bulk sheets and comes in Release 2.

Carry forward inside the term switch removes the January risk of empty classes without a step our team could forget, and it stays safe to repeat because one enrolment per student per term is already a database rule. Limiting it to the same session keeps promotion (#18) a separate decision.

The deletion rule narrows spec 0003's "never deleted" to "never deleted once it has results". A typo duplicate with no records carries no history worth keeping, and keeping it would leave a stray child's record in the database, which the data protection law discourages. A student with any score, score history, remark or rating keeps the old rule. Moving a class is refused once scores exist, because scores are tied to the class (spec 0003) and moving them silently could lose a teacher's work.
