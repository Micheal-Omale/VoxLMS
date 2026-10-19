# 0013. Excel import: rationale

## Context

Spec 0008 gave our team screens to type students in, one class at a time, and parents one by one in a side panel. For the pilot school (under 200 students), that's an afternoon. For each later school, it's the main onboarding cost, and Release 2 must be live before First Term results in early December 2026. Schools already keep their registers in Excel, usually one sheet with a title row, their own column names and orders, a single "Name" column in surname first order, and phone numbers that Excel has turned into numbers (dropping the leading 0).

The records are children's personal data under the Nigeria Data Protection Act. A bad file must never put wrong records into a school, and a wrong file (or the right file uploaded to the wrong school) must be easy to reverse. Spec 0001 planned a Neon branch snapshot before every import for this, which needs a Neon API key in the app and branch cleanup on a plan that limits branches.

Several rules already exist and must not fork: admission numbers unique ignoring case and spaces, Nigerian phone format, at most two parents with one primary, sibling parents shared by phone, student numbers from one allocator, and teacher logins created with the staff record (spec 0008). Spec 0001 already settled the library (ExcelJS, server side), the file types (`.xlsx` and CSV, `.xls` refused) and the upload path (a Route Handler, since server actions take only 1 MB and Vercel caps a request at 4.5 MB).

Our team, not the school, runs every import, and edits the school's file in Excel when it needs fixing.

## Options considered

### Option 1: Stateless upload, check, confirm over shared rules, with a run record and undo (chosen)

The file is read and checked on upload and returned as a preview. Confirm sends the same file again, and the server checks it again and saves the valid rows in one transaction. Problems are fixed in Excel and the file uploaded again; rows already in the school are skipped. Each confirmed import is an `import_run` that can be undone while nothing it added has results.

**Pros**:
- No staging table, nothing to expire or clean up; the preview and the save use one planner.
- Uploading again is always safe, so the fix loop needs no state.
- Undo fully reverses an import (import only adds), replacing the snapshot and the Neon API key.

**Cons**:
- The file is read twice, and fixing means going back to Excel every time.
- Can't bulk update existing students.

### Option 2: Staging table with an editable preview grid

Upload parses rows into a staging table. The team fixes problem cells on screen, then commits the staged rows.

**Pros**:
- Typos are fixed in place, without leaving the app.
- The file is read once.

**Cons**:
- An editable, rechecking grid is the largest UI piece in the product, built before the deadline.
- Staged rows hold children's data that needs expiry and cleanup, and the school's own file stays wrong.

### Option 3: Call the existing `addStudent`, `addGuardian` and `addTeacher` once per row

Each valid row goes through the same functions as the typed screens, each in its own transaction.

**Pros**:
- Reuses the add code exactly; no new write path.
- One bad row can't block the rest.

**Cons**:
- Hundreds of small transactions per file on serverless Postgres, and a failure halfway leaves half a file saved, with no run to undo.
- Their "Add anyway?" and "Same person?" answers are made for one person at a keyboard, not a batch.

### Option 4: Column mapping step, then import

After upload, the team maps each file column to a field on screen, then previews.

**Pros**:
- Works with any header names at all.

**Cons**:
- An extra screen on every import, for headers that a list of aliases recognises almost always.

## Rationale

The real job is to load a school's register quickly and safely, with the team doing it, not the school. Excel is a better editor than anything we could build in the time left, and the team already works there, so a read only preview plus "upload again" (Option 1) beats an editable grid (Option 2). Making uploads again safe by skipping known students is what makes that loop work without storing anything between steps.

Saving in one transaction with batched inserts, rather than calling the typed add functions per row (Option 3), keeps an import all or nothing and gives it a run to undo. The rules stay shared because the pure checks behind those functions are exported and called by both paths. Because an import only ever adds rows, undoing a run removes exactly what it added (and only the logins it created), which makes the planned Neon snapshot (and its API key and branch cleanup) unnecessary, while the nightly backup still covers everything else.

Header aliases instead of a mapping screen (Option 4), a per school template with a class dropdown, and loose class matching keep the common case to one upload, with the preview showing how columns, names and classes were read so a wrong guess is caught before saving.

Calls made without asking (each with the runner up):
- Confirm sends the file again and plans again inside the transaction (runner up: client sends parsed rows back; rejected because it trusts the browser and nears the 1 MB action limit).
- A file with the same phone or admission number on two rows makes all of those rows problems, since we can't know which is right (runner up: first row wins).
- A teacher import works without a current term, and only its Form class waits for one (runner up: block it, which would hold up logins for no reason).
- The template has no example data row, only a How to fill sheet, so an untouched template never imports a fake student (runner up: an example row the team must delete).
- Class matching allows the arm initial only when it is unique within the level (runner up: exact names only, which fails on "JSS 2G").
- Name split at the first comma, else the first space (runner up: a "Name order" choice, kept as a follow up).
