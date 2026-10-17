# Verify: school principal and optional section heads · spec 0007 · updated 2026-10-17
_Steps derived from spec 0007 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._
_Demo school: Grace High, `/admin/schools/16919ee6-49ef-4133-911a-122fabb86140`. Put back every change a check makes._

## UI / manual
- [ ] School details → a Principal block shows "Principal", Mr Samuel Adeleke, and "No signature yet" with an Upload button → AC-1
- [ ] Upload a principal signature → no confirm (first time) → preview shows → AC-1, AC-2
- [ ] Change the name to "Mr Samuel Adeleke Jr" → a confirm says it shows on every report card the principal signs, past terms included → save → put it back → AC-2
- [ ] Replace the principal signature → the same confirm appears before upload → AC-2, AC-8
- [ ] Sections → Junior and Senior Secondary read "Signed by the principal: Mr Samuel Adeleke, Principal" linking to School details; Primary reads "Own head: Mrs Grace Oyelaran, Head teacher" with its signature or "No signature yet" → AC-5
- [ ] Edit Primary → switch "Has its own head" off → the confirm names Primary and Mrs Grace Oyelaran → save → Primary now reads "Signed by the principal" → AC-4
- [ ] Switch it back on → saving with an empty name is refused; with a title and name it saves, and the card shows "No signature yet" → AC-3
- [ ] School overview checklist: Details unfinished without a principal signature; Sections unfinished while Primary has its own head but no signature → AC-7
- [ ] Sign in as a teacher and open the School details and Sections URLs → not found → AC-9

## Commands
- [ ] `npx vitest run test/school-setup.test.ts` → all pass, including the signer, switch, upload and checklist tests → AC-1 to AC-9
- [ ] `npm run db:migrate` on the dev branch, then `npm run db:seed` → `school` has the three principal columns; `section_head` no longer exists → AC-10
- [ ] `grep -rn "section_head\|sectionHead\|getHeadForTerm\|changeHead\|undoLatestHead" src test` → nothing → AC-10

## Acceptance criteria coverage
- AC-1: UI 1, 2 · AC-2: UI 2, 3, 4 · AC-3: UI 7 · AC-4: UI 6 · AC-5: UI 5 · AC-6: tests (signer) · AC-7: UI 8; tests · AC-8: UI 4; tests · AC-9: UI 9; tests · AC-10: commands 2, 3

## Added by /develop · 2026-10-17
- [ ] `npm run db:seed -- --demo` (not plain `npm run db:seed`, which only seeds the standard lists) → Grace High has principal Mr Samuel Adeleke (Principal), Primary keeps Mrs Grace Oyelaran (Head teacher), Junior and Senior Secondary have no own head → AC-10
- [ ] Sections → turn on "Has its own head" for Junior Secondary → the title field starts at "Head teacher" → switch it back off without saving → AC-3
- [ ] Sections → Primary switch off confirm → the "Remove the head" button is red (it deletes the signature) → press "Keep it as it was" → nothing changes → AC-4
