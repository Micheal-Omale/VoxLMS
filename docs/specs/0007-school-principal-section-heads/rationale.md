# 0007. School principal and optional section heads: rationale

## Context

Spec 0005 stores a head (title, name and signature) on every section, so a school with Primary, Junior Secondary and Senior Secondary has three head records. In the user's schools the principal heads the whole school: one person, one name, one signature, the same on every section's report cards. Typing the principal three times invites three spellings and three uploads of the same signature, and suggests sections could have different principals, which isn't how these schools work.

Some schools do have a different head for part of the school, most often a head teacher who runs the primary section. Primary report cards in those schools carry the head teacher's name and signature, and secondary cards carry the principal's. Nigerian report cards carry one head's signature, not two.

A first rewrite of 0007 treated every section head as a dated record, with "Change principal" from a chosen term, "Undo", and a guard on term date edits, so reprints of old terms keep the head who signed then. It was built but never committed. The user has since said that changing heads over time isn't needed for now, and that fixing a name or signature in place is enough. Nothing prints a signature yet (the report card PDF, #12, is not designed), and only demo data exists, so the shape can still change cheaply.

## Options considered

### Option 1: Principal on the school, optional head on the section fields

Three new columns on `school` hold the principal. The section's existing head columns (spec 0003) hold an optional own head, where an empty name means the principal signs. Edits overwrite in place after a confirm.

**Pros**:
- "One principal per school" holds by the shape of the data, with no uniqueness rule to enforce.
- Reuses columns that already exist, so the section side needs no schema change at all.
- Smallest code: the committed code already reads and writes the section's head; only the principal and the switch are new.

**Cons**:
- No history: a principal change overwrites, and reprints of past terms then show the new principal.
- The section's `head_title` column is required, so it keeps a stale value while a section has no own head (harmless, never printed).

### Option 2: A principal table and a section head table

A `school_principal` table (one row per school) and a `section_head` table (zero or one row per section), each with title, name and signature.

**Pros**:
- Rows could later gain start terms, giving history without moving data.

**Cons**:
- Two tables, two uniqueness rules and two joins for data that is one value per owner today.
- The history it prepares for is explicitly not wanted now; building toward it is speculative.

### Option 3: Keep the dated head records from the first rewrite

Keep the built `section_head` table with Change principal, Undo and the term date guard, and add a school level principal on top.

**Pros**:
- Reprints of past terms would stay correct after a change of principal.
- The code and tests already exist.

**Cons**:
- Models a head per section, the very thing the user corrected; a school wide principal on top would mean two places for the same person.
- Brings a password prompt, an undo rule and a term date guard into setup for a case the user doesn't need yet.
- The largest surface to maintain before the first report card ships (deadline: First Term 2026/2027 results, early December).

## Rationale

Option 1 fits how the user's schools are run: one principal for the whole school, entered once, with a head teacher for a section only where one exists. It also fits the user's stated priorities, cheap and minimal with no over engineering, and the December deadline: the section side is the code already committed, and the principal is three columns. Option 2 pays for history the user deferred. Option 3 keeps working code, but that code encodes the wrong model (a head per section) and a lifecycle nobody asked for, and keeping it would leave two sources for the principal.

The engineer chose the rest directly: the section head replaces the principal on that section's cards (one signer per card, the usual Nigerian layout); the principal's name and signature are required for setup to count as done; a fix needs only a confirm, no password; the principal is set on the School details page; a section's own head is turned on with a switch; turning it off clears the name and deletes the signature; and two signers may share a title (a primary only school may call its principal Head teacher).

Calls made here without asking: the confirms run in the browser only, with no server side "confirmed" flag, since they guard against slips and only our team can reach these actions (runner up: a confirm token on the action, rejected as ceremony with no attacker to stop). The signature upload names its owner with `signer` (`principal` or `section`), not a new asset kind, so the `asset.kind` enum doesn't change (runner up: a `principal_signature` kind, rejected because the kind describes the image, not its owner). The migration drops `section_head` only where it exists, so the dev branch that ran the never committed migration converges with a fresh database without a branch reset (runner up: reset the dev branch from its parent, rejected because it also wipes the two permanent test schools' other data).
