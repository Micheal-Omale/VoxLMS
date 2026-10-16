# Design system: the mark book

Product: **VoxLMS**. Every screen borrows from what a Nigerian teacher already works with: exercise-book paper, blue biro, feint ruled lines, the red margin and the red pen. The audience is teachers on cheap Android phones (often outdoors, often at the end of term under pressure) and our team on laptops. The product's job is to get scores in without mistakes and print report cards that parents will check line by line.

Live reference: `/design` in development (and the previews `/design/score-entry`, `/design/sign-in`). They return 404 in production unless `SHOW_DESIGN_PREVIEWS=1`.

## Principles

1. **Numbers are sacred.** Tabular figures, large, in a face where 1/l/I and 0/O never look alike. A missing score is a dash and is never counted as 0.
2. **Mark like a teacher.** Red is for stopping to look: the field circled, the reason written underneath in plain words.
3. **Thumb first.** 44px controls, the main action at the bottom of the screen on phones, Enter moves to the next score.
4. **Never lose typed work.** Every keystroke is kept on the device until the server confirms the save.
5. **Spend boldness once.** The ruled score sheet and the red pen are the identity. Everything around them stays quiet: hairlines over shadows, no gradients, no decoration.

## Colour

Tokens live in `src/app/globals.css`. Each colour has one job everywhere.

| Name | Token | Hex | Job |
|---|---|---|---|
| Paper | `background` | `#F3F6F9` | The page. Cool, never cream. |
| Sheet | `card` / `popover` | `#FFFFFF` | Score sheets, forms, menus, inputs. |
| Biro ink | `foreground` | `#16224A` | All text and figures (14.2:1 on paper). |
| Pencil | `muted-foreground` | `#56627E` | Supporting text (5.6:1 on paper). |
| Biro blue | `primary` (+ `primary-hover`, `primary-active`) | `#1F3FA8` | The one action colour: buttons, links, focus. |
| Red pen | `destructive` (+ `destructive-wash`) | `#C8202F` | Stop and look: a score to fix, or an action that removes something. |
| Register green | `success` (+ `success-wash`) | `#0B6B4C` | Saved or complete. |
| Amber | `warning` (+ `warning-wash`, `warning-mark`) | `#8A4B00` | Typed but not saved yet. |
| Feint rule | `rule`, `border` | `#D3DDE8` | Ruled lines between rows. |
| Field edge | `input` | `#8292AC` | Field borders (3.1:1 on white, findable in sunlight). |
| Margin | `margin` | `#E8939B` | The red margin line on ruled sheets. Never text. |

Every text pair passes WCAG AA; most pass AAA. Status always comes with words, never colour alone. Light theme only for now: paper and print are the reference, and dark mode doubles the testing.

## Type

One family: **Atkinson Hyperlegible Next** (Google Fonts, SIL Open Font License), loaded with `next/font` in `src/app/layout.tsx`. It was designed by the Braille Institute so similar characters stay distinct, which matters most for scores and admission numbers. Use the `type-*` utilities, not `text-*` sizes, for text roles:

| Utility | Size / weight | Use |
|---|---|---|
| `type-display` | 28 to 40px, 800, tight | Page title (one per page) |
| `type-title` | 22 to 26px, 700 | Section and card titles |
| `type-heading` | 19px, 700 | Sub-sections |
| `type-body` | 16px, 400, 1.55 | Body copy (also the default) |
| `type-label` | 15px, 600 | Field labels |
| `type-caption` | 13px, 400 | Hints, meta, column headers |
| `type-score` | 20px, 700, tabular | Score cells and totals |
| `type-figure` | tabular lining figures only | Any number a parent might check |

Body text is never below 16px on phones (it also stops iOS zooming into fields). Sentence case everywhere; no all-caps labels.

## Logo

**Idea**: two pages of an open book, joined at the spine and standing on a ruled line. The short left page (ink) and the tall right page (biro blue) together make a teacher’s tick and the V of Vox: learning, marked and checked. Guidelines with examples: `/design/logo`.

- **Parts**: the two pages, the spine, where the blue page lies over the ink page (the pages always meet: an earlier version with a gap between them looked unfinished at small sizes), the shared baseline the wordmark sits on, and the wordmark: Atkinson Hyperlegible Next Bold, outlined, “Vox” tracked tight and the capitals “LMS” tracked open. The mark rises 26% above the capitals and its strokes match the letters’ stems.
- **Versions**: colour on paper or white; white on biro blue; black for report cards and anything printed or photocopied. Never other colours, effects, stretching, or a retyped wordmark.
- **Space and size**: clear space of half the logo’s height on every side. Lockup at least 18px tall on screen, 6mm in print; below that, use the app icon (the mark on a biro-blue tile, left page in a pale tint so the two pages still show).
- **In code**: `<Logo />` and `<LogoMark />` (`src/components/brand/logo.tsx`), `tone="mono"` takes `currentColor`. Files in `public/brand/`; favicon `src/app/icon.svg` + `favicon.ico`, `src/app/apple-icon.png` (full-bleed square, iOS rounds it).
- **Source**: the geometry is generated by `scripts/brand/build-logo.cjs` (centreline curves with set widths, clipped to the baseline; the wordmark outlined from the font). Change the logo there, never by hand-editing paths.

## Space, shape, depth

- Tailwind's 4px spacing scale. Page gutters: 16px on phones, 24px from `sm`.
- Radius: 4px small accents, 6px menu items and score cells, 8px buttons and fields, 12px sheets and dialogs, pill badges.
- Hairlines carry structure. Shadows only for things that float (menus, dialogs, toasts) and a faint one under a lone card.
- Controls: 44px default, 36px small, 48px large (buttons, fields, selects and toggles move together). Menu items are 44px tall on phones.
- Focus: a 2px Biro-blue outline on actions, a soft ring on fields.

## Components

shadcn/ui on Base UI (`components.json`, style `base-nova`, icons `lucide-react`), restyled through the tokens above and the control heights in `src/components/ui/*`. Our own components:

- `ScoreSheet` (`src/components/score-sheet/`): the signature. A ruled sheet with roll numbers in the red margin, three fields per student, a live total and grade, a progress line, and a sticky save bar. Typing is filtered to numbers; Enter moves along the row then to the next student; arrow keys move up and down a column. An over-maximum score is circled in red and explained underneath, and blocks the save until fixed. Missing scores show as a dash with "Exam not entered yet". Changed rows get an amber stripe. Unsaved changes are kept in `localStorage` and restored with a notice after a refresh or crash. Offline turns Save off and says so. Saves send only the changed rows.
- `RedPenCircle` (`src/components/red-pen.tsx`): the hand-drawn ring, drawn once in 420ms; reduced motion shows it instantly.
- `AppBar`, `SchoolMark` (`src/components/app-bar.tsx`): the school (logo, or initials on a crest tile) and current term on every school page, and the account menu.

## Motion

One signature moment: the red-pen stroke. Elsewhere, motion only answers an action (menus opening, toasts, the error line inking in over 220ms). No entrance animations, no hover effects on cards. `prefers-reduced-motion` turns all of it down to an instant change.

## Writing

- The teacher's words: score, class, term, report card, form teacher. Not record, entity, submit, sync.
- Buttons say what happens: "Save scores", "Print report cards", "Discard scores". The result echoes the button: "All scores saved at 2:14 pm".
- Errors say what happened and what to do, without apology: "CA 1 is out of 20. You wrote 25."
- Empty screens say what to do next: "No students in JSS 2 Gold yet. Add students one at a time, or upload the class list from Excel."
- Names are surname first, surname bold, as on the school register. Times are shown in Africa/Lagos time.

## Open items

- The product is named **VoxLMS** (`src/lib/brand.ts`). The support WhatsApp number there is still unset.
- The report card PDF uses its own layout engine; it should reuse these colours and the same font as static TTF files (Report card PDF spec).
- Dark mode is deferred.
