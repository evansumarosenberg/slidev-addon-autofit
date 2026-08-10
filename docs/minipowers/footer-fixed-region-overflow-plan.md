# Fixed-Region Structural Overflow Implementation Plan

Status: Proposed

Source of truth:
[`footer-fixed-region-overflow-design.md`](./footer-fixed-region-overflow-design.md)

## Execution constraints

- Execute the production change with test-driven development.
- Keep the approved design specification immutable.
- Preserve the user's existing `example.md` additions and all unrelated
  worktree changes.
- Do not change `README.md`, public configuration, layout allocation, AutoFit
  measurement, direct `<AutoFit>` behavior, auto-column coordination, or
  auto-image sizing and diagnostics.
- Do not add text-range, text-node, pseudo-element, or replacement scroll
  measurement machinery.
- Do not use `example.md` as an automated test fixture or assert its prose,
  headings, order, structure, or slide count.
- Do not use screenshots for visual verification unless the user requests
  them.

## Task 1: Correct shared fixed-region overflow measurement

### Scope and expected outcome

Change the shared fixed-region detector so `auto-default`, `auto-column`, and
`auto-image` decide layout overflow from structural region and qualifying
descendant rectangles only. Fitting footer links and headings must stop
reporting `LAYOUT OVERFLOW`, while genuine structural overflow and every
existing diagnostic transition remain intact.

This is one task because the focused regression tests and the shared production
change form one independently reviewable behavioral correction.

### Relevant files and components

- `utils/autofit/useLayoutOverflow.ts`
- `tests/fixtures/autofit.md`
- A focused browser specification for shared layout-overflow behavior, expected
  to be `tests/browser/layout-overflow.spec.ts`
- Existing layout regression specifications where targeted validation is
  needed:
  - `tests/browser/auto-default-layout.spec.ts`
  - `tests/browser/auto-column-layout.spec.ts`
  - `tests/browser/auto-image-layout.spec.ts`
- The already approved design and plan documents under `docs/minipowers/`
- The user's existing `example.md` demonstration slides, for build and later
  human visual validation only

The implementer may choose an equivalently focused test filename or fixture
organization when repository conventions make it clearer, but must not turn
`example.md` into an executable specification.

### Boundaries and explicit non-goals

- Keep the existing layout coordinate-space conversion, padded content bounds,
  and inclusive `0.5px` tolerance.
- Keep existing clipping through intervening `auto`, `clip`, `hidden`, and
  `scroll` overflow ancestors.
- Keep observer binding, request-animation-frame scheduling, warning entry
  transitions, and reactive state publication unchanged.
- Keep the three layout components on the existing shared hook; do not add
  per-layout fixes or footer-only branching.
- Do not retain raw `scrollWidth` or `scrollHeight` as a fallback on either
  axis.
- Do not measure ordinary static inline formatting rectangles when they have no
  effective transform, no positioning, no negative margin, and are not media
  or replaced content.
- Do not ignore atomic inline, media/replaced, positioned, transformed, or
  negative-margin descendants.
- Text-only, generated-content-only, and paint-only overflow remain deliberate
  non-goals.
- Do not change diagnostic strings, attributes, classes, badges, or precedence.
- Do not edit `README.md`.

### Test-driven implementation

#### Red

1. Add focused runtime fixtures for a fitting footer hyperlink and fitting
   footer heading under each of the three custom layouts. Use public layout and
   slot syntax. Any fixture-only styling needed to reproduce the decorated
   inline rectangle and excess scroll metric must be deterministic and narrowly
   scoped.
2. Add a parameterized browser regression test covering both cases in all three
   layouts. For every fixture, verify that:
   - The footer's structural rectangle remains inside the padded content box.
   - The relevant decorated-inline or excess-scroll condition is present, so
     the fixture would catch the original defect.
   - The layout is expected not to publish `data-layout-overflow="true"`, show
     the overflow class, or render the `LAYOUT OVERFLOW` badge.
3. Add focused classification-boundary coverage proving that a comparable
   atomic, media/replaced, positioned, transformed, or negative-margin box is
   still eligible for structural overflow, and that intervening clipping still
   constrains descendant bounds. Reuse existing focused fixtures when they
   already prove a requirement; do not duplicate coverage merely to increase
   test count.
4. Run the narrow new or changed browser test and confirm it fails against the
   pre-fix production code for the expected false-overflow reason. Record the
   red result for the task handoff.

#### Green

1. Update `useLayoutOverflow.ts` to initialize each fixed region's measured
   bounds from its structural rectangle without expanding them from raw scroll
   dimensions.
2. Add a narrow, internal classification for geometry-transparent inline
   formatting that follows the approved rules:
   - computed `display: inline`;
   - static positioning;
   - no effective transform, translate, rotate, or scale;
   - no negative computed margin;
   - not media or replaced content.
3. Skip independent rectangle contribution only for descendants meeting all of
   those transparent-inline conditions. Treat unknown, invalid, or unsupported
   computed geometry conservatively as measurable.
4. Preserve the existing rectangle conversion and ancestor-clipping path for
   every qualifying descendant.
5. Run the narrow regression test until it passes, then run the directly
   affected layout specifications.

#### Refactor

1. Keep the classification and media/replaced-element knowledge local to the
   fixed-region detector unless an existing dependency-free helper can be
   reused without changing AutoFit behavior or expanding scope.
2. Remove obsolete scroll-bound calculations and keep naming aligned with the
   structural-box semantics.
3. Avoid broad classifier extraction, public exports, or changes to
   `utils/autofit/geometry.ts` unless the approved-deviation process is invoked.
4. Re-run the narrow and affected tests after cleanup.

### Required validation

Before review, run:

1. The new focused layout-overflow browser specification.
2. The affected existing browser specifications for `auto-default`,
   `auto-column`, and `auto-image`.
3. The complete unit and browser test suite with `pnpm test`.
4. The example build with `pnpm build`.
5. `git diff --check` and a worktree review confirming no unrelated user edits
   were overwritten.

The automated checks must not assert example-slide prose or structure.

### Acceptance criteria

Task 1 is complete when:

1. Fitting footer hyperlink and heading fixtures remain non-overflowing in all
   three custom layouts.
2. The focused fixtures prove the pre-fix metric artifacts are present while
   their structural boxes fit.
3. Fixed main and footer regions share one structural-box measurement path.
4. Raw scroll extents and geometry-transparent inline rectangles cannot trigger
   fixed-region overflow.
5. Genuine structural overflow on every side, qualifying descendant geometry,
   clipping, and the inclusive `0.5px` tolerance remain covered and green.
6. Existing diagnostic attributes, classes, warnings, badges, precedence, and
   lifecycle tests remain green.
7. No public API, layout allocation, README, AutoFit, auto-column coordination,
   or auto-image behavior changes.
8. No text or pseudo-element measurement machinery is added.
9. The relevant full test suite and example build pass.
10. A fresh `code_reviewer` returns explicit `PASS` for the task diff.
11. The parent creates one task-scoped commit after the review gate, including
    the approved workflow artifacts and the in-scope user-authored example
    slides without unrelated worktree changes.

### Dependencies

- The approved fixed-region structural overflow design specification.
- The user's existing hyperlink and heading demonstration slides in
  `example.md`.
- No other implementation task.

## Completion validation and human handoff

After Task 1 passes review and is committed:

1. Run the complete validation command, `pnpm validate`.
2. Confirm the final implementation against every acceptance criterion in the
   approved design and this plan.
3. Clean up temporary fixtures, generated debugging artifacts, and development
   processes that are not part of the reviewed change.
4. Serve the built example deck for the user to inspect `example.md` in the
   browser.
5. Ask the user for explicit visual-verification `PASS`. Completion must wait
   for that response.
6. Report the implementation, automated validation, commit, approved
   deviations, and any remaining follow-up work.
