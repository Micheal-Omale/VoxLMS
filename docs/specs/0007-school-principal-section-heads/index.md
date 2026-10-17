# 0007. School principal and optional section heads

**Date**: 2026-10-17
**Status**: Accepted

## Summary

Each school has one principal (title, name and signature), set once on the School details page. A section may have its own head, such as a primary head teacher, and when it does, that head signs the section's report cards instead of the principal. Names and signatures can only be fixed in place, and no history is kept for now, so a fix also shows on reprints of past terms. This replaces the earlier 0007 design (a head per section, with Change principal and Undo), which was built but never committed.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Requirements

**User stories**:
- As our team, I want to enter the school's principal once, so that every section's report cards carry the same principal without retyping it per section.
- As our team, I want to give a section its own head, so that a school whose primary section is run by a head teacher gets that head on its primary report cards.
- As our team, I want to fix a misspelled name or a blurry signature, so that report cards look right.

**Acceptance criteria** (the contract):
- **AC-1**: The School details page has a Principal block with the principal's title, name and signature (upload with preview). There is exactly one principal per school. The title defaults to "Principal", with suggestions Principal, Head teacher, Proprietor, Proprietress and Head of school, or any custom text of 2 to 40 characters. The name, as printed on report cards, is 3 to 80 characters.
- **AC-2**: The principal can only be fixed in place. Saving a changed title or name, or replacing the signature, when the principal already has one shows a confirm first: "This shows on every report card the principal signs, reprints of past terms included." Setting a value for the first time needs no confirm. No password is asked. No history is kept: after saving, the old name is gone and the old signature image is deleted.
- **AC-3**: The section form has a "Has its own head" switch, off by default. While it is off, the principal signs that section's report cards. While it is on, the head's title (default "Head teacher", with suggestions Head teacher, Head mistress, Headmaster and Principal, or custom) and name are required, with the same lengths as AC-1. The signature is uploaded on the section's card after saving. Changing an existing own head's title, name or signature shows the same kind of confirm as AC-2, naming the section.
- **AC-4**: Turning the switch off on a section that has its own head asks to confirm first: "The principal will sign {section}'s report cards, reprints of past terms included. {head}'s name and signature will be removed." On save, the head's name is cleared and its signature image is deleted, in one transaction. A signature upload for a section without its own head is refused with a plain message.
- **AC-5**: Each section card on the Sections page says who signs its report cards: "Signed by the principal: Mr Samuel Adeleke, Principal" (linking to School details), or "Own head: Mrs Grace Oyelaran, Head teacher" with the signature preview, or "No signature yet" and an Upload button.
- **AC-6**: One data function, `getSignerForSection`, answers who signs a section's report cards: the section's own head when its name is set, otherwise the school's principal. It returns the title, name, signature asset id, and whether the signer is the section's head or the principal, or null when the chosen signer has no name yet. Report cards (#12) read the signer only through it. The answer does not depend on the term.
- **AC-7**: The setup checklist marks Details done when the principal has a name and a signature. It marks Sections done when the school has at least one section and every section with its own head has a signature. Sections without their own head need nothing more for this item.
- **AC-8**: Signatures stay private (spec 0005, AC-4): never served on the web, previewed only to our team, at most 300 KB, and a new upload replaces and deletes the old image. Removing a section deletes its own head's signature, as it does today.
- **AC-9**: Every page and action here is for our team only (anyone else gets not found), and every id from a form is checked within the school.
- **AC-10**: After the build, the earlier 0007 design is gone: no `section_head` table, no `getHeadForTerm`, no Change principal, Undo or term date guard. The demo seed gives Grace High the principal Mr Samuel Adeleke (Principal), gives Primary its own head Mrs Grace Oyelaran (Head teacher), and gives Junior and Senior Secondary no own head.

## Decision

**Chosen option**: Option 1: the principal as three fields on the school, and a section's own head on the section fields it already has.

`school` gains `principal_title`, `principal_name` and `principal_signature_asset_id`. The section's existing `head_title`, `head_name` and `head_signature_asset_id` (spec 0003) hold an optional own head, where an empty name means the principal signs. Every reader asks `getSignerForSection`.

**Implementation skills**: `neon-drizzle` (`neondatabase/ai-rules`, `.claude/skills/neon-drizzle/`) · `shadcn` (`shadcn-ui/ui`, `.claude/skills/shadcn/`)

## Feature design

**Data model sketch** (one migration):

| Table | Column | Type | Rule |
|---|---|---|---|
| `school` (new) | `principal_title` | text, required, default `'Principal'` | 2 to 40 characters |
| | `principal_name` | text, null | 3 to 80 characters when set; required for the checklist |
| | `principal_signature_asset_id` | uuid, null | `(id, principal_signature_asset_id)` → `asset (school_id, id)`, named `school_principal_signature_fk`, built like `school_logo_fk` |
| `section` (existing, read again) | `head_title` | text, required | printed only while `head_name` is set; keeps its last value when the head is turned off |
| | `head_name` | text, null | null means no own head, so the principal signs |
| | `head_signature_asset_id` | uuid, null | existing link to `asset (school_id, id)`; null whenever `head_name` is null |
| `section_head` | dropped | | the uncommitted table from the earlier design |

Relationships: a school has one principal (its own columns, so "one per school" holds by shape). A section has zero or one own head. Each signature asset belongs to exactly one owner (the school's principal or one section's head).

**Signer rule** (`getSignerForSection`): read the section within the school (not found otherwise). If `head_name` is set, return `{ title: head_title, name: head_name, signatureAssetId: head_signature_asset_id, from: "section" }`. Otherwise read the school: if `principal_name` is set, return `{ title: principal_title, name: principal_name, signatureAssetId: principal_signature_asset_id, from: "principal" }`, else null.

**State transitions** (per section):
- principal signs → own head (switch on, with title and name).
- own head → own head with a fixed title, name or signature (confirm).
- own head → principal signs (switch off, confirm; name cleared, signature deleted).

**API surface** (pages call `requireTeamSchoolContext`; data functions in `src/server/data/setup.ts` call `assertTeam` and return the `FormResult` shape):

| Surface | Kind | Key inputs | Result | Who | Key errors |
|---|---|---|---|---|---|
| `/admin/schools/[id]/details` (changed) | page | none | adds the Principal block: title, name, signature preview and upload | our team | not found |
| `savePrincipal` (new) | action | title, name | school's principal title and name saved | our team | title or name length |
| `saveSection` (changed) | action | stage, teacher title, `hasOwnHead`, head title, head name | section saved; switching off clears the name and deletes the signature | our team | stage already used; head title or name length when on |
| `POST /admin/schools/[id]/images` (changed) | route handler | `kind` logo or signature; for a signature, `signer` = `principal` or `section` plus `sectionId` | asset saved on that owner; the owner's previous image deleted | our team | not an image; over 300 KB; section not in this school; section has no own head |
| `/admin/schools/[id]/sections` (changed) | page | none | each card shows its signer (AC-5) | our team | not found |
| `getSignerForSection` (new) | data function | section id | `{ title, name, signatureAssetId, from }` or null | our team, system (PDF) | section not in this school: not found |
| `getSchoolSetup` (changed) | data function | none | checklist per AC-7 | our team | none |

The confirms in AC-2, AC-3 and AC-4 are shown in the browser before the action is sent; the server does not need a "confirmed" flag, because the confirm guards against slips, not against a hostile caller (only our team can call these).

**Key invariants**:
- A section's `head_signature_asset_id` is null whenever its `head_name` is null. `saveSection` and the signature upload both lock the section row (`for update`) and read it again inside the transaction, so an upload can't attach a signature to a head that a switch off just removed (it gets the "no own head" refusal).
- A principal signature upload locks the school row the same way, so two quick uploads can't leave an orphaned image.
- An asset that is replaced, or whose owner is removed, is deleted in the same transaction. Images live in Postgres (spec 0001), so a rolled back transaction leaves nothing behind.
- `getSignerForSection` is the only reader of signers for printing.
- Signatures are never served publicly (spec 0005).

**Security model**:
- Team only; teachers and anyone viewing as someone get not found (`assertTeam`, spec 0004).
- Every id from a form (section, asset) is looked up within the school.
- No password check: fixes are guarded by a confirm only (engineer's choice), since only our team can reach these pages.
- No children's data is touched. Names and signatures are staff data, kept private as before.

**Configuration required**: none new.

**Critical test scenarios**:
- Happy path: on the demo school, `getSignerForSection` returns Mrs Grace Oyelaran for Primary and Mr Samuel Adeleke (from the principal) for both secondary sections; verifies **AC-6**, **AC-10**.
- Own head switch: turning Primary's head off clears its name and deletes its signature asset, and the signer becomes the principal; turning it back on needs a title and name; verifies **AC-3**, **AC-4**, **AC-6**.
- Fix: changing the principal's name changes the signer for every section without its own head; replacing the principal's signature deletes the old asset; verifies **AC-1**, **AC-2**, **AC-8**.
- Failure case: a signature upload with `signer=section` for a section without its own head is refused; a name of 2 characters or a title over 40 is refused; verifies **AC-1**, **AC-3**, **AC-4**.
- Checklist: Details stays unfinished without a principal signature; Sections stays unfinished while Primary has its own head but no signature, and is done when no section has its own head; verifies **AC-7**.
- Edge: a school with no principal name returns null from `getSignerForSection` for a section without its own head; removing a section with its own head deletes its signature; verifies **AC-6**, **AC-8**.
- Auth/permission: a teacher gets not found for every action and the image route; a section id from another school is not found; verifies **AC-9**.

## Build plan

Skateboard: put the tree back to the last commit's simple shape, add the principal, then the section switch, so report cards (#12) can rely on `getSignerForSection` as soon as possible.

1. Remove the earlier 0007 build: delete `src/server/data/heads.ts`, `sections/head-panel.tsx`, `test/section-heads.test.ts`, `drizzle/0007_section_heads.sql`, `drizzle/meta/0007_snapshot.json`, its `_journal.json` entry and the `sectionHead` table in the schema; return `setup.ts`, `setup-actions.ts`, the image route, the Sections page and form, `staff-actions.tsx`, `page.tsx`, the demo seed and `test/school-setup.test.ts` to the last commit, keeping only what this spec reuses (for example, a confirm before replacing an image in `image-upload.tsx`). Delete `password-confirm.tsx` if nothing uses it after that; satisfies **AC-10**.
2. Migration and seed: generate `0007_school_principal` (three columns on `school` and `school_principal_signature_fk`), then add by hand, guarded so it is harmless on a database that never had it, the removal of `section_head` and its signature images (see Migration plan). Update the demo seed with the principal and Primary's own head; satisfies **AC-1**, **AC-10**.
3. Data functions: `savePrincipal`; `saveSection` with `hasOwnHead` (switch off clears the name and deletes the signature, under the section lock); `saveImage` with `signer` principal or section (refuses a section without its own head); `getSignerForSection`; the checklist in `getSchoolSetup`; satisfies **AC-1**, **AC-3**, **AC-4**, **AC-6**, **AC-7**, **AC-8**, **AC-9**.
4. Screens: the Principal block on School details with its fix confirm; the section form switch with its fix and switch off confirms; the signer line and signature upload on each section card; satisfies **AC-1** to **AC-5**.
5. Tests for the signer rule, the switch, fixes, uploads, the checklist and access; update the spec 0005 tests that expected a head on every section; satisfies **AC-1** to **AC-10**.

## Migration plan

**Strategy**: one deployment. Only demo data exists (engineer confirmed), so no live data is converted.
**Phases**:
1. Migration `0007_school_principal` adds `principal_title` (default `'Principal'`), `principal_name`, `principal_signature_asset_id` and its foreign key. Then, only where `section_head` exists (`to_regclass('public.section_head') is not null`, in a `DO` block): collect its signature asset ids, drop the table, delete those assets. On a fresh database this step does nothing.
2. On the dev branch (which ran the earlier, never committed 0007), run `npm run db:migrate`, then `npm run db:seed` so the demo schools get the principal and Primary's own head, and the secondary sections lose the head names the old seed gave them.
**Rollback**: revert the commit. The three new columns are only added and can stay unused; nothing else changed shape.
**Risks**: a database with real schools would keep a head name on every section (spec 0005 required one), so each section would wrongly show its own head. Before running on the production branch, check it has no schools; if any exist, our team sets the principal and turns off the copied heads by hand. The dev branch's old `__drizzle_migrations` row for the removed migration stays; Drizzle ignores it.

## Consequences

**Positive**:
- Our team enters the principal once per school, which matches how the user's schools work.
- Schools with a separate primary head teacher get the right signer on primary cards.
- Report cards get one clear rule (`getSignerForSection`) and a much smaller surface than the earlier design.

**Negative / tradeoffs**:
- No history: when a school changes its principal, our team overwrites the name and signature, and reprints of past terms then show the new principal. This is accepted for now and is the main thing a later spec would add back.
- Turning a section's own head off deletes its signature, so turning it back on means uploading again.
- The earlier 0007 build (data rules, panel, tests) is thrown away.

**Neutral**:
- Spec 0005's AC-5 (a head's title, name and signature on every section) and the signature row of its image route are now governed by this spec: the section head is optional and the principal lives on the school.
- The printed principal is not a login. The `principal` staff role (spec 0003) and a later principal portal (scope Deferred, "Principal approval") are separate; that work may link a staff account to the school's principal.
- The school's stamp stays out of scope (spec 0005).

## Follow-up

- [ ] Report card PDF (#12): read the signer only through `getSignerForSection` and print its title from the result.
- [ ] Principal history (who signed which term) is deferred; a later spec would add it if schools reprint old terms after changing principal.
- [ ] Principal approval portal: run `/scope principal approval` to pull it into a release, then design how a principal's login relates to the school's principal.
- [ ] `/sync` should note in spec 0005 that its section head fields and signature upload are governed by spec 0007.
