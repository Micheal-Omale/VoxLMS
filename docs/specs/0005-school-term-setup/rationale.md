# 0005. Rationale: school and term setup

## Context

The data model (spec 0003) already holds schools, sections, sessions, terms and images; logins (spec 0004) give our team a team area. What is missing is the way to fill them in. The scope's goal for onboarding is about an hour per school with no new code (#20), and the pilot must be set up before First Term results (early December 2026).

Decisions confirmed with the engineer: the pilot's report card carries the school logo, the principal's signature (secondary) and the head teacher's signature (primary), and no stamp; our team switches the current term by hand when the school confirms (resumption dates move); the pilot's report card has no attendance box, so "times school opened" is optional and controlled by a school setting; a school's web name can change later, with a warning that old links stop working.

## Options considered

### Option 1: Setup checklist with small forms (chosen)

A "New school" form with the essentials, then the school's team page lists the parts of setup as a checklist; each part is a small form on its own page.

**Pros**:
- Short forms that each save on their own, so a dropped connection loses little.
- Later features (classes, teachers, grading, imports) add checklist items without redesign.
- The checklist shows at a glance what a school still needs before results day.

**Cons**:
- More pages than one long form.

### Option 2: One step by step wizard

A single flow walking through every part in order.

**Pros**:
- Guided for a first time user.

**Cons**:
- Hard to come back to one part later; a wizard interrupted halfway is confusing; every new feature changes the wizard.

### Option 3: One long settings form

Everything on one page.

**Pros**:
- Fewest pages.

**Cons**:
- Long on a phone, one failed field blocks the whole save, and images and terms don't fit well in one form.

## Rationale

Onboarding has to fit in about an hour and survive a patchy connection in a school office, which favours small forms that each save on their own over a wizard or one long form. The checklist also becomes the place later features plug into, so the team always sees what a school still needs. Uploads go through a route handler because server actions accept only 1 MB by default and images need their own size checks (spec 0001); shrinking in the browser keeps report card PDFs small. Signatures are kept off the web entirely because a principal's signature on a public address is easy to copy; the server reads it straight from the database when it makes a PDF. Switching the term by hand follows the engineer's choice: resumption dates move with strikes and holidays.

