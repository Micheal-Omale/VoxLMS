# Verify: Enrol teachers & students · spec 0008 · updated 2026-10-17
_Steps derived from spec 0008 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

Signed in as our team, in Grace High (`/admin/schools/<id>`):

- [ ] Open Staff from the setup checklist → every teacher listed with phone, login badge, last sign in and "Form master of …"; the school overview no longer has a Staff logins block → AC-1
- [ ] Add a teacher with a new phone → saved, then the password prompt (if stale) and the setup link dialog with QR and "Send on WhatsApp" → AC-1
- [ ] Add a teacher with a phone that has a login at another school → "This phone number already has a login" before anything is saved; with that login switched off, the dialog says so → AC-1
- [ ] Add a teacher with a phone already used by staff here → refused under the field; for a leaver the message points to "Mark as active again" → AC-1
- [ ] Teacher menu → Edit details: fix the name → saved; for a teacher with a login the phone field is read only and points to "Change phone number" → AC-2
- [ ] Change phone number to one other staff in any of their schools already have → refused, nothing changed → AC-2
- [ ] Mark as left → the confirm names "JSS 2 Gold will have no form master"; after saving, the class has no form master and the login badge reads Switched off; "Mark as active again" restores the record only → AC-3
- [ ] Open Students → classes by section with students this term and form master; a class opens its list → AC-4
- [ ] On a class list, pick a form master → toast and saved; "None yet" clears it; on a primary class the label reads "Class teacher" → AC-4
- [ ] With no current term set, the class list says to set one first and has no add row → AC-5
- [ ] Quick add by keyboard only: surname, Tab, other names, Tab, G, Enter → student appears with the next number; the row clears and the cursor is back in Surname → AC-5
- [ ] Add a student with admission no. `ghs/2024/ 015` → "… already belongs to OKON Emem."; the typed row is kept → AC-6
- [ ] Add a name already in the class → "There is already an … Add anyway?"; Add anyway saves → AC-6
- [ ] Tap a student → a side panel on a computer, a full screen sheet at 390px; details save; house up to 30 characters → AC-7
- [ ] Add a photo from a phone image → cropped to 3 by 4; Replace and Remove work; the photo shows only in the team area → AC-7
- [ ] Add a parent with Mr Tunde Adebayo's phone to another student → "Same person?" naming his children; Yes links him (now "Also parent of …"); No saves a new parent → AC-8
- [ ] Make primary, Remove from this student (the other becomes primary), a third parent refused; a student with no parent shows the amber mark → AC-8
- [ ] SS 1 Science → Electives grid: tick and untick, Save → saved; untick an elective that has scores → whole save refused, naming student, subject and score count → AC-9
- [ ] Panel → Move to another class for a student without scores → moved; for one with scores the panel explains why it can't → AC-10
- [ ] Panel → Mark as left with today's date → student leaves the list into "Left this term"; Undo restores them; a future date is refused → AC-11
- [ ] A student just added by mistake → "Remove, added by mistake" deletes them; a student with any results record doesn't offer it → AC-12
- [ ] Terms page → make Second Term current → toast says how many students were carried forward (and how many weren't because their class is switched off); making First Term current again carries nothing → AC-13
- [ ] Sign in as Funke Adewale (or View as) → the JSS 2 Gold card opens `/gracehigh/classes/<id>`: admission no., name, gender only, no photos, parents or edit controls; another class's address is not found → AC-14
- [ ] Overview checklist shows Staff and Students items naming the classes still missing (at most three named, then "and N more") → AC-15
- [ ] While viewing as a teacher, open any `/admin/schools/…` page → not found → AC-16

## Commands
- [ ] `npm run db:migrate` then query `pg_indexes` for `student_school_admission_norm_key` → present; `student_school_admission_key` gone → AC-6
- [ ] `npx vitest run test/enrolment.test.ts` → 22 passed (AC-1 to AC-16) → all ACs
- [ ] `npx vitest run test/class-register.test.ts` → 4 passed (quick add row, same name warning) → AC-5, AC-6
- [ ] `npm test` → every file passes (data-model, logins and school-setup cover the changed linkGuardian, changePhone and setCurrentTerm) → AC-2, AC-8, AC-13

## Acceptance-criteria coverage
- AC-1 staff list, add, confirm, refusals · AC-2 edit and Change phone · AC-3 mark as left · AC-4 Students page and form master picker · AC-5 no current term, quick add · AC-6 admission number, same name, migration · AC-7 panel and photo · AC-8 parents and siblings · AC-9 electives grid · AC-10 move · AC-11 left and Undo · AC-12 remove · AC-13 carry forward · AC-14 teacher class page · AC-15 checklist · AC-16 view as, test file
