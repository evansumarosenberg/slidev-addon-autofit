# Browser Suite Repair Design

## Status

Proposed for user approval.

## Background

The Chromium browser suite currently completes with 181 passing and 12 failing
tests. Independent reproduction and diagnosis found no production AutoFit or
AutoImage regression. Eleven failures are caused by stale fixture geometry or
test expectations, and one is caused by repeated full-document navigation
through the large Slidev fixture deck exhausting browser resources.

The most recent fixture commit corrected 45 image paths from a nonexistent
asset to `autofit_placeholder.jpg`. That correction causes the affected image
fixtures to exercise real image geometry, exposing pre-existing caption-fit
assumptions. It did not change production fitting behavior.

## Goals

- Restore a reliable, fully passing browser suite without skips.
- Preserve every production behavior currently protected by the failing tests.
- Correct faulty assumptions about caption fit, exact tiers, coordination roles,
  and repeated Slidev route navigation.
- Keep strong behavioral assertions; relax an assertion only when it measures
  incidental geometry rather than the behavior named by the test.
- Continue exercising the real production component and layout chains.

## Non-goals

- No changes to production components, layouts, fitting algorithms,
  coordination algorithms, tolerances, diagnostics, or public behavior.
- No changes to `example.md`, README author guidance, or presentation examples.
- No skipped tests, quarantined failures, blanket retries, or increased global
  timeouts used to conceal an unreliable test.
- No broad rewrite of the browser suite or unrelated fixture cleanup.
- No tests that assert documentation or demonstrative-deck prose.

If a repaired test exposes a new reproducible production defect, that work is
outside this design and requires a separately approved scope change.

## Design principles

### Assert the behavior under test

Exact tier values belong only where tier selection itself is the contract.
Lifecycle, reveal, and coordination tests will assert stable state,
recomputation, ordering, source/target relationships, atomic publication, and
finite geometry without embedding incidental font-metric thresholds.

### Preserve valid-fit preconditions

Tests for AutoImage candidate retention, ordered multi-item geometry, unmount
safety, and reveal stability intentionally begin from valid fitted content.
Their fixtures will be calibrated so captions genuinely fit. The state
assertions will remain `fit`; production caption-overflow behavior will not be
weakened or bypassed.

### Exercise real integration paths without route churn

Configuration forwarding will continue to exercise the real
`auto-image.vue` -> `LayoutAutoFitBridge` -> `AutoFit` chain. The 20-case matrix
will run in one focused component harness that remounts the layout for each
case instead of performing 20 full-document navigations through a 160-slide
deck.

## Detailed design

### 1. AutoImage valid-fit fixtures

The affected component fixtures will receive the smallest practical geometry
or caption-presentation adjustments that create a comfortable fit margin under
the current browser environment:

- The finite row candidate fixture remains a two-image row and reaches `fit`
  after its non-finite measurement seam is released.
- The ordered multi-image row remains a two-item fit with its existing order,
  aspect-ratio, marker, and caption-alignment assertions.
- The unmount fixture remains a three-image fitted presentation before its
  detached media outcomes are exercised.
- The reveal harness keeps all 11 position/reveal combinations fitted before,
  during, and after navigation and reveal transitions.

Fixture calibration may adjust container dimensions or fixture-local caption
typography/copy. It must not change production CSS or suppress overflow
detection. Changes should retain meaningful captions and should provide enough
margin to avoid another subpixel boundary failure.

Existing dedicated overflow tests continue to cover
`caption-inline-overflow`, `caption-block-overflow`, and the related diagnostic
behavior.

### 2. AutoImage raw-configuration harness

A focused browser fixture component will replace the unstable 20-route matrix.
It will:

- Import and render the real `auto-image` layout.
- Represent the same cross-product currently covered: all four non-center
  positions and omitted, default, partial, custom, and invalid AutoFit
  configurations.
- Render one active case at a time and key/remount it between cases so config
  normalization and component initialization run freshly.
- Supply substantive default, image, and auto slots using a locally resolvable
  image source.
- Expose a stable case marker/control for Playwright.

The existing 20 Markdown route fixtures will remain in place and unchanged
except for any separately necessary calibration. They will not be removed or
reordered, so the established slide numbering and unrelated browser tests stay
stable. Only this matrix test's execution moves to the focused harness, which
will be mounted on one appended fixture slide.

The browser test will retain assertions for requested/effective alignment,
selected tier and scale where those are direct configuration outcomes,
invalid-configuration class/reason, complete-default fallback, and one warning
per invalid case.

At least one existing Markdown/frontmatter AutoImage test remains responsible
for proving Slidev layout-prop plumbing. The focused harness does not replace
that independent integration coverage.

### 3. Dedicated exact-tier coverage

The `Every default tier` fixture remains the authoritative browser test for the
largest-fitting-tier search contract. Its real-geometry boundaries will be
recalibrated so each labeled fixture selects its intended tier from `4` through
`-4` with a non-fragile margin.

The test retains exact tier, scale, fitted-state, and bounded-measurement-count
assertions. Calibration must verify both sides of each intended boundary rather
than merely relabeling the expected results to match the current accidental
mapping.

### 4. Reactivity and reveal invariants

The prop-reactivity test will continue proving that:

- the prior stable presentation remains visible while replacement frames are
  held;
- expanding the configured tier range produces a new batch;
- the final presentation selects a larger positive tier and increases the
  rendered font size; and
- the viewport remains visible throughout the replacement.

It will compare the final tier and typography with the captured baseline rather
than requiring one exact incidental tier/font size.

The non-neutral reveal test will require negative/non-neutral fitted tiers and
then compare every transition, geometry, gap, class, opacity, pointer-event,
and scheduler observation with its captured stable baseline. It will not
require a specific negative tier.

### 5. Coordination invariants

Unequal-content coordination tests will preserve the following contracts:

- the authoritative source has a strictly smaller private tier than its target;
- both participants publish the same finite common tier;
- effective distributed alignment is retained;
- the expected source plan/provenance and target boundary kind are recorded;
- the realized target boundary matches the authoritative target.

They will not require the source's private tier or the common tier to equal
`-2`.

Candidate-anchor failure is a distinct fallback terminal rather than a normal
common-tier publication. Its test will preserve these separate contracts:

- the selected source publishes the forced typed `unsupported` reason without
  a public tier;
- the unaffected target remains fitted at its valid local tier;
- private-tier ordering still proves which participant was selected as the
  source; and
- the pair publishes atomically without exposing an intermediate mixed state.

For gap-only, alignment-only, and combined synchronized overflow scenarios, the
test will derive the synchronized target role from coordinator observation or
authority metadata recorded before terminal-state assertions. It will then
independently verify that:

- exactly the selected target overflows while its sibling source fits;
- the target retains its common tier and distributed alignment;
- rendered starting anchors remain aligned within tolerance;
- the terminal observation is `synchronized-overflow` with bounded final error;
- the warning identifies the correct overflow combination; and
- no smallest-tier fallback warning occurs.

### 6. Reliability and failure classification

Each formerly failing focused cluster will pass three consecutive runs to catch
subpixel or navigation flakes before full validation. The final browser gate is
two consecutive complete suite runs, each completing without failures, skips,
or retries introduced by this work. Every run will be allowed to finish.

Because fixture geometry affects rendered slides, completion also follows the
project visual gate: build `example.md`, ask the user to inspect it, and require
an explicit visual `PASS`. No screenshot substitutes for that inspection, and
`example.md` remains unchanged.

Wake Lock permission warnings emitted by Slidev in headless Chromium are known
environment noise and are not part of this repair unless they begin affecting
test outcomes.

## Expected file scope

- `tests/browser/auto-image-component.spec.ts`
- `tests/browser/auto-image-layout.spec.ts`
- `tests/browser/autofit-coordination.spec.ts`
- `tests/browser/autofit-fitting.spec.ts`
- `tests/browser/autofit-reactivity.spec.ts`
- `tests/fixtures/autofit.md`
- `tests/fixtures/components/AutoImageHarness.vue`
- `tests/fixtures/components/AutoImageRevealHarness.vue`
- one new focused AutoImage raw-configuration harness under
  `tests/fixtures/components/`

Production files are excluded.

## Risks and mitigations

- **Overfitting to one Chromium run:** use comfortable fixture margins and
  relational assertions outside the exact-tier contract.
- **Weakening coverage while removing constants:** explicitly retain each
  lifecycle, geometry, coordination, warning, and publication invariant listed
  above.
- **Losing Markdown integration coverage:** retain an existing focused
  frontmatter/layout test alongside the component harness.
- **Hiding a product defect with fixture changes:** do not change runtime code;
  require each repaired fixture to agree with existing production overflow and
  tier-selection contracts.
- **Creating another large fixture matrix:** keep one active harness case and
  remount between cases rather than rendering all 20 simultaneously.

## Acceptance criteria

1. All 12 diagnosed browser failures are repaired without production changes.
2. The complete browser suite passes with no skipped tests and no retries or
   global timeout increases introduced by this work.
3. Every formerly failing focused cluster passes three consecutive runs.
4. AutoImage lifecycle, ordering, unmount, and reveal tests retain fitted
   preconditions and all existing non-faulty geometry/lifecycle assertions.
5. Dedicated caption-overflow coverage remains intact.
6. The dedicated tier-selection test proves every exact default tier and scale
   through real geometry with bounded measurements.
7. Reactivity and reveal tests preserve replacement, transition, finite
   geometry, and scheduler invariants without incidental exact tiers.
8. Coordination tests preserve authority selection, normal common-tier
   publication, candidate-anchor fallback semantics, provenance, boundary
   realization, localization, atomicity, alignment, and warning specificity
   without assuming an incidental role or private tier.
9. Raw AutoFit configuration coverage includes all 20 existing cases through a
   focused harness using the real production layout/component chain.
10. Existing Markdown/frontmatter integration coverage remains.
11. The worktree contains only approved test, fixture, design, and later plan
    artifacts; no generated browser output is committed.
12. The complete browser suite passes twice consecutively, with every run
    allowed to finish.
13. `pnpm build` succeeds and the user gives an explicit visual `PASS` after
    inspecting the built `example.md` deck.
