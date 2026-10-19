# 0012. Report card PDF: decision record

## Context

Release 1 is done when the pilot school enters one class's scores and prints every report card for that class. Scores (spec 0009), results (spec 0010), remarks (spec 0011) and the signer (spec 0007) exist. Nothing yet turns them into paper. Exams end in early December 2026, and the team is one developer.

The forces:
- **Parents check line by line.** A card that disagrees with the teacher's sheet, or shows a provisional position, starts a dispute the school has to answer. Figures must come from the one computation, and a class still missing scores must not print.
- **Paper, not screens.** Cards are printed in black and white at a business centre and often photocopied. Colour, grey fills and thin text vanish. The card must stay on one A4 page per student with up to 20 subjects and 5 score parts (spec 0006).
- **Phones and Vercel.** The form master downloads on a cheap Android phone. The file is made in a Vercel function, so it must render in seconds and stay well under the 4.5 MB response limit (spec 0001).
- **Plans mean something.** The basic plan carries VoxLMS branding and the school logo plan carries the school's own logo (scope #12, pricing in planning).
- **Reuse ahead.** The single student reprint (#15) and the PIN result page (#21) need the same card. Ratings (#14) and attendance (deferred) will add blocks later.

No photo of the pilot school's paper card was available. The engineer asked for the layout to be designed from standard Nigerian report cards instead.

## Options considered

### Option 1: react-pdf route from a pure card model (chosen)

One snapshot read, a pure function that formats every card, and a `@react-pdf/renderer` document rendered in a Node route handler.

**Pros**:
- The same file on every device and printer; page size and fit are under our control and testable.
- Already chosen in spec 0001; a project skill exists; it is in Next's built in external packages.
- No extra service or binary; small, fast functions.

**Cons**:
- react-pdf's layout is a subset of CSS; the card is designed separately from the app's components.
- Overflow is only caught by tests and a page count check, not by the layout itself.

### Option 2: An HTML print page and the browser's print to PDF

A page styled for `@page` A4 printing; the teacher taps Print.

**Pros**:
- Reuses Tailwind and the app's components; least new code.

**Cons**:
- Android browsers print differently (margins, scaling, headers), so one page per student can't be guaranteed.
- No single file to send to a business centre, and #21 needs a downloadable card anyway.

### Option 3: Headless Chromium on the server (Puppeteer) printing HTML to PDF

Render the HTML page and print it with a bundled Chromium.

**Pros**:
- Full CSS; one design for screen and paper.

**Cons**:
- A Chromium binary near Vercel's function size limit, slow cold starts and high memory, for one developer to operate.
- Fit still depends on Chromium's print layout and needs the same tests.

### Option 4: Make the PDFs once when results are final, and store them

Generate files when the class turns final and keep them in storage.

**Pros**:
- Downloads are instant.

**Cons**:
- A stored file goes stale the moment a score, comment or band changes (spec 0010 stores nothing for this reason).
- Needs a storage service and a rule for when to make files again.

## Rationale

Option 1 is the only one that guarantees the result the scope asks for (exactly one A4 page per student, the same everywhere) without new infrastructure. Spec 0001 picked react-pdf for this reason, and nothing since has changed that: the layout is fixed, the data is small (45 students by 20 subjects), and a few seconds per download is fine. Option 2 fails the one page rule on phones. Option 3 buys full CSS at an operating cost that a one person team on Vercel shouldn't take. Option 4 contradicts the rule that nothing computed is stored, and the moment a late score lands it hands parents an old card.

A pure card model between the loader and the PDF keeps every string testable without parsing PDFs, and lets #15 and #21 reuse the card by passing one model.

## Calls made for the engineer

The engineer answered the first round (refuse a provisional class and name who is missing; reprint earlier terms without a warning; register order) and then asked for the rest to be decided. Each call below is open to change at review:

| Call | Pick | Why | Runner up |
|---|---|---|---|
| Layout source | A standard Nigerian report card, designed here | No photo of the school's card was available | Match the pilot's paper card once a photo arrives |
| Basic plan header | No school logo; "Powered by VoxLMS" with the black logo in the footer | Keeps the school's name prominent while making the plans differ | VoxLMS logo in the header's logo slot |
| Signature on basic | Printed on both plans | A card without the head's signature isn't official, which would make basic unusable | Signature only on the school logo plan |
| Student photo | Left out | Optional data, greys badly when photocopied, costs space | A passport photo box on the right of the student block |
| Age and date of birth | Left out | Date of birth is optional, and age needs a rule (as at when) | Age at the end of the term |
| Columns | Parts, total, grade, position, class average, highest, lowest, remark | What Nigerian terminal cards carry, and spec 0010 already works out each | Drop highest and lowest to free width |
| Grade key | One line under the table | Parents read grades against it; costs one line | Leave it out |
| Empty teacher's comment | Print two blank lines to write on, and warn before download | Lets the class print while letting the form master finish by hand | Refuse until every comment is in |
| No signer name | Refuse to print | A card with no head named can't go home; the setup checklist already asks for it | Print with blank name |
| No signature image | Blank line to sign by hand | Some schools sign by hand anyway | Refuse |
| Ink | Black only, no fills | Survives photocopying; design.md says black for print | Biro blue headings |
| Font | Atkinson Hyperlegible Next, static TTF | design.md's single family, OFL licence allows embedding | Original Atkinson Hyperlegible |
| Overflow | Page count check after render, refuse the file | Never sends a spilled card, even for data the tests missed | Clip with `wrap={false}` (silently hides text) |
| Refusal at download | Redirect to the class page with the reason | The person sees why, in the app's own words | A plain text error response |
| Download style | Attachment with a readable file name | On Android, inline PDFs open in odd viewers; a named file is easy to find and send | Open inline in the browser |
| Download log | One server log line, no audit table | Reads only; logs cover "it was slow" or "it failed" | An audit row per download |
| Preview | `/design/report-card` on made up worst case data | Lets the layout be checked without a database | Check only against the demo school |
