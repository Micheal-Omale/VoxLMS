# 0002. Design system and UI foundation

**Date**: 2026-10-16
**Status**: In Progress

## Summary

The app's look is "the mark book": exercise-book paper, blue biro ink, feint ruled lines, the red margin and the red pen. One legible typeface for every screen, thumb-sized controls, and one signature element, the ruled score sheet whose over-maximum scores are circled in red. The full rules are in [docs/design.md](../../design.md); the live reference is `/design` in development.

## Decision

- **Direction**: drawn from the teacher's own materials rather than a SaaS template. Colour roles are fixed (biro blue acts, red pen means stop and look, green means saved, amber means not saved yet). Light theme only for now.
- **Type**: Atkinson Hyperlegible Next for everything, chosen because similar characters (1/l/I, 0/O) never look alike in scores and admission numbers. Tabular figures for every number.
- **Components**: shadcn/ui on Base UI (style `base-nova`, `lucide-react` icons), restyled through tokens in `src/app/globals.css`; controls 44px by default.
- **Signature**: `ScoreSheet` and `RedPenCircle`, built as real components that Score entry (scope #9) uses directly, with draft-on-device, keyboard flow and an offline state already in place.
- **Logo**: two book pages joined at the spine, standing on a ruled line, forming a tick and the V of Vox; generated geometry in `scripts/brand/`.
- **Previews**: `/design`, `/design/logo`, `/design/score-entry`, `/design/sign-in` use made-up data and return 404 in production unless `SHOW_DESIGN_PREVIEWS=1`.

## Consequences

- Score entry (#9) only needs its data and Server Action; the sheet's behaviour is done.
- The Report card PDF (#12) must re-create the colours and font in react-pdf with static TTF files.
- Dark mode is deferred; adding it later means a `.dark` token block plus a full visual pass.
- The product is named VoxLMS; the name lives in `src/lib/brand.ts`.

## Build plan

- [x] Install shadcn/ui (Base UI) and base components; set thumb-sized control heights
- [x] Tokens, type scale and ruled-sheet utilities in `globals.css`; font in the root layout
- [x] `ScoreSheet`, `RedPenCircle`, `AppBar`
- [x] Previews: design system page, score entry, sign in
- [x] `docs/design.md`
- [x] VoxLMS logo: mark, outlined wordmark, versions, favicon and app icon, guidelines at `/design/logo`
- [ ] Unit tests for `score-math.ts` (missing never counts as 0; over-maximum; grade bands) with Vitest
