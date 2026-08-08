# Browser Suite Repair Implementation Plan

## Status

Proposed for user approval.

## Source of truth

This plan implements the approved
`docs/minipowers/browser-suite-repair-design.md`. The design is immutable. If
implementation requires production changes or another material deviation, stop
and use the Minipowers amendment workflow.

## Execution rules

- Execute tasks sequentially in the order below.
- Use a fresh task-scoped `implementer` for each initial implementation or
  remediation round and a fresh `code_reviewer` for each review gate.
- Each task receives one review gate and must reach explicit `PASS` before it is
  committed.
- Create one commit per completed task containing only that task's changes.
- Before Task 1, commit the approved design and approved plan together as a
  workflow-artifact commit containing no implementation changes.
- Do not modify production components, layouts, utilities, CSS, README, or
  `example.md`.
- Do not add tests that assert fixture prose, slide titles, slide order, or
  other demonstrative content. Test runtime behavior through focused fixtures.
- Do not skip tests, add blanket retries, or increase global timeouts.
- Existing focused failures provide the red baseline. Because these tasks
  repair test infrastructure and expectations without changing production
  behavior, proportionate focused browser validation replaces a production
  TDD cycle.

## Task 1: Restore AutoImage fitted baselines

### Scope and expected outcome

Calibrate the AutoImage component and reveal fixtures so the tests for
candidate retention, ordered multi-item geometry, unmount safety, and reveal
stability start from genuine fitted presentations with comfortable caption-fit
margins.

### Relevant files

- `tests/fixtures/components/AutoImageHarness.vue`
- `tests/fixtures/components/AutoImageRevealHarness.vue`
- `tests/browser/auto-image-component.spec.ts` only if a non-faulty assertion
  needs a fixture-aware clarification
- `tests/browser/auto-image-layout.spec.ts` only for the reveal-settlement test
  if fixture calibration requires a corresponding non-faulty assertion update

### Boundaries and non-goals

- Keep the affected state assertions at `fit`.
- Retain two-image row ordering, aspect-ratio, marker, caption-alignment,
  pending/retained, and non-finite recovery assertions.
- Retain the three-image unmount presentation, detached media outcome checks,
  and no-post-unmount-measure assertion.
- Retain all 11 reveal combinations and their finite offsets, managed markers,
  transition, forward/backward navigation, and direct-entry assertions.
- Use fixture-local dimensions, meaningful caption copy, or fixture-local
  caption typography with adequate fit margin.
- Do not change production overflow tolerances, geometry, CSS, or diagnostics.
- Do not modify or weaken dedicated caption-overflow cases.

### Required validation

1. Run the three formerly failing AutoImage component tests together.
2. Run the AutoImage reveal lifecycle test.
3. Run the existing dedicated AutoImage overflow-reason tests to confirm
   overflow coverage remains intact.
4. Run the combined focused selection three consecutive times, with every run
   completing successfully.
5. Run `git diff --check`.

### Dependencies

- Approved design and plan artifact commit.

### Acceptance criteria

- Every affected fixture reaches `fit` with a non-subpixel margin.
- All existing non-faulty lifecycle and geometry assertions remain.
- Dedicated caption-overflow tests still exercise their exact reasons.
- The focused selection passes three consecutive runs.
- A fresh `code_reviewer` returns `PASS`.
- The task is committed separately.

## Task 2: Replace route churn with a focused raw-configuration harness

### Scope and expected outcome

Replace the 20 sequential full-document navigations in the raw AutoFit
configuration test with one focused fixture component that remounts the real
AutoImage layout for each case.

### Relevant files

- New `tests/fixtures/components/AutoImageLayoutRawConfigHarness.vue`
- `tests/fixtures/autofit.md`
- `tests/browser/auto-image-layout.spec.ts`

### Boundaries and non-goals

- Preserve the same 20 cases: four non-center positions crossed with omitted,
  default, partial, custom, and invalid AutoFit configuration.
- Exercise the real `layouts/auto-image.vue` -> `LayoutAutoFitBridge` ->
  `AutoFit` chain.
- Render one keyed case at a time and expose stable controls and case markers.
- Use a locally resolvable image source.
- Preserve requested/effective alignment, tier, scale, invalid-class/reason,
  complete-default fallback, and warning-deduplication assertions.
- Remove per-case console listeners after each case or use one scoped listener
  so the harness does not introduce listener accumulation.
- Append one harness slide; do not remove, reorder, or repurpose the existing
  20 Markdown route fixtures.
- Retain existing independent Markdown/frontmatter integration coverage.
- Do not change route-loading behavior, Slidev internals, production layout
  code, global timeouts, or Playwright retries.

### Required validation

1. Run the repaired raw-configuration test three consecutive times.
2. Run the existing focused Markdown/frontmatter AutoImage layout test that
   proves layout-prop plumbing.
3. Build the fixture deck if required by the focused harness integration and
   confirm the appended slide compiles.
4. Run `git diff --check`.

### Dependencies

- Task 1 completed and committed.

### Acceptance criteria

- All 20 configuration cases execute without full-document route churn.
- Every original behavioral assertion remains represented.
- The real production layout/component chain is mounted freshly per case.
- Existing route fixtures and slide numbering remain unchanged; the new slide
  is appended.
- The focused test passes three consecutive runs without resource exhaustion.
- A fresh `code_reviewer` returns `PASS`.
- The task is committed separately.

## Task 3: Recalibrate authoritative exact-tier geometry

### Scope and expected outcome

Adjust the `Every default tier` fixture boundaries so each labeled AutoFit
instance selects its intended exact tier from `4` through `-4` through real
geometry under the current theme.

### Relevant files

- `tests/fixtures/autofit.md`
- `tests/browser/autofit-fitting.spec.ts` only if additional behavioral
  boundary evidence is required

### Boundaries and non-goals

- Retain exact tier, exact scale, `fit`, and bounded measurement-count
  assertions in this dedicated test.
- Calibrate fixture heights/content with comfortable margins; do not relabel
  expected tiers to match the accidental mapping.
- Confirm the selected tier fits and the next larger configured tier does not,
  using the production search result and, if needed, focused DOM evidence.
- Do not change the tier search algorithm, typography scaling, production CSS,
  tolerances, or unrelated fixture slides.

### Required validation

1. Run `selects every authoritative default tier through real geometry`.
2. Confirm all nine tier/scale mappings and measurement-count bounds.
3. Run the adjacent custom-tier and zero-side-search test.
4. Run the focused exact-tier selection three consecutive times.
5. Run `git diff --check`.

### Dependencies

- Task 2 completed and committed because both tasks append or modify
  `tests/fixtures/autofit.md`.

### Acceptance criteria

- Labels `tier-4` through `tier--4` select exactly their labeled tiers and
  scales.
- Each mapping represents a largest-fitting-tier boundary with a stable margin.
- Measurement counts remain within the existing bound.
- The focused exact-tier test passes three consecutive runs.
- A fresh `code_reviewer` returns `PASS`.
- The task is committed separately.

## Task 4: Replace incidental reactivity/reveal constants with invariants

### Scope and expected outcome

Repair the two reactivity failures by comparing recomputed presentations with
captured baselines rather than requiring incidental exact tier numbers.

### Relevant files

- `tests/browser/autofit-reactivity.spec.ts`

### Boundaries and non-goals

- For prop reactivity, retain held-frame behavior, prior visible stable
  presentation, batch replacement, viewport visibility, and final recomputation.
- Require the final tier to be positive and greater than the captured original
  tier, and require rendered font size to increase from its captured baseline.
- For non-neutral reveal behavior, require fitted negative/non-neutral tiers and
  compare all later presentations with the captured stable baseline.
- Retain exact transition, reveal class, opacity, pointer-event, rectangle,
  visual-gap, scheduler-work, and restoration assertions.
- Do not change the component fixtures solely to manufacture the former exact
  tier values.
- Do not alter runtime lifecycle, scheduler, or reveal behavior.

### Required validation

1. Run both formerly failing reactivity tests together.
2. Run nearby held-presentation and reveal-class invalidation tests that share
   the same lifecycle seams.
3. Run the combined focused selection three consecutive times.
4. Run `git diff --check`.

### Dependencies

- Task 3 completed and committed so the authoritative exact-tier test remains
  the sole exact selection contract.

### Acceptance criteria

- The tests prove replacement and reveal behavior using relational invariants.
- No transition, geometry, lifecycle, or scheduler coverage is removed.
- The focused selection passes three consecutive runs.
- A fresh `code_reviewer` returns `PASS`.
- The task is committed separately.

## Task 5: Repair coordination tests around authority and fallback contracts

### Scope and expected outcome

Remove incidental `-2` and fixed-left assumptions while preserving normal
common-tier synchronization, derived-gap provenance, synchronized overflow,
candidate-anchor fallback localization, and atomic publication.

### Relevant files

- `tests/browser/autofit-coordination.spec.ts`

### Boundaries and non-goals

- In normal unequal-content cases, assert that the source private tier is
  strictly smaller than the target private tier and both publish the same
  finite common tier with distributed alignment.
- Retain source-plan role, full/half provenance, boundary kind, and realized
  target equality assertions.
- For candidate-anchor failure, separately assert typed source unsupported
  state without a public tier, unaffected-target fit at its valid local tier,
  private-tier ordering, and atomic publication.
- Derive synchronized overflow target role from coordinator observation or
  authority metadata recorded before terminal assertions; then independently
  assert exactly that target overflows and its sibling source fits.
- Retain common tier/alignment, rendered-anchor tolerance, terminal kind,
  bounded final error, exact warning combination, and absence of smallest-tier
  fallback warnings.
- Do not change coordination fixtures merely to force the former roles or
  private tiers.
- Do not alter production coordinator selection, fallback, or warning logic.

### Required validation

1. Run the four formerly failing coordination tests together.
2. Run adjacent authority-order, synchronized-overflow, verification-failure,
   and atomic-publication tests that exercise the same seams.
3. Run the combined focused coordination selection three consecutive times.
4. Run `git diff --check`.

### Dependencies

- Task 4 completed and committed.

### Acceptance criteria

- Normal synchronization proves relative authority and shared common-tier
  publication without an incidental exact tier.
- Candidate-anchor fallback proves localized unsupported behavior and atomic
  publication without incorrectly requiring a public common tier.
- Overflow target selection is independently observed before its state is
  asserted.
- Warning specificity and alignment tolerances remain unchanged.
- The focused selection passes three consecutive runs.
- A fresh `code_reviewer` returns `PASS`.
- The task is committed separately.

## Completion validation

After all five task commits and review gates:

1. Verify the approved design against the final diff and confirm no production,
   README, or `example.md` changes.
2. Run `pnpm test:unit`.
3. Run `pnpm test:browser` twice consecutively. Let both complete; each must
   pass without skips or retries introduced by this work.
4. Run `pnpm build`.
5. Run `git diff --check` and inspect repository status for generated or
   unrelated artifacts.
6. Shut down development servers, watchers, and temporary browser processes.
7. Ask the user to inspect `example.md`; completion requires their explicit
   visual `PASS`. Do not use screenshots unless the user requests them.
8. Report the workflow-artifact commit, five task commits, validation results,
   approved deviations, and remaining follow-ups.

