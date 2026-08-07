# Legacy Theme Cleanup Implementation Plan

## Source of truth

Implement the approved design in
`docs/legacy-theme-cleanup-design.md`. If implementation reveals a material
conflict or requires expanded scope, stop and use the minipowers amendment
workflow rather than changing the approved design or this plan in place.

Before Task 1, commit the approved design and plan together as workflow
artifacts. Each implementation task then receives its own implementation,
review, and commit gate.

Immediately after the workflow-artifact commit and before Task 1, record a
tracked-file baseline of every case-insensitive `7a0019` occurrence, including
plain `#7a0019`, the README badge's `color=7A0019`, and URL-encoded
`%237a0019` fixture SVG values. The workflow-artifact commit's tree is the
authoritative before-state for final comparison.

## Task 1: Exercise the package through Slidev's addon resolver

### Scope and expected outcome

Change the browser fixture's initial headmatter so it retains the default host
theme and loads this repository as a local addon. Both development-mode and
production-build Playwright configurations already consume this fixture, so no
runner configuration change is expected.

### Relevant files

- `tests/fixtures/autofit.md`
- `playwright.config.ts` and `playwright.production.config.ts` for validation
  context only
- `tests/helpers/serve-autofit-production.mjs` for validation context only

### Boundaries and non-goals

- Do not change any fixture slide, fixture color, image source, or test case.
- Do not change the example deck's headmatter.
- Do not add a test that asserts fixture Markdown or frontmatter prose.
- Do not alter Slidev server/build configuration unless addon-mode loading
  demonstrates a concrete configuration defect within the approved scope.

### Implementation and validation

This is test-harness configuration rather than production behavior, so use
proportionate validation rather than manufacturing a prose assertion:

1. Replace `theme: ../..` with `theme: default` and `addons: - ../..`.
2. Run a focused browser smoke test that proves addon-provided layouts and
   components load through the existing Playwright server.
3. Run the production browser test or its production fixture build to prove
   addon loading also works in the built deck.
4. If an unrelated pre-existing fixture error blocks either validation,
   document it without expanding this task.

### Acceptance criteria

- Fixture headmatter selects `theme: default` and declares `../..` as an
  addon.
- The `tests/fixtures/autofit.md` task diff is confined to its initial
  headmatter; fixture slides, inline SVGs, and colors are byte-for-byte
  unchanged.
- A focused browser path renders addon-provided behavior.
- The production-build path is exercised successfully, or any independently
  verified pre-existing blocker is reported without unrelated edits.
- A fresh `code_reviewer` returns `PASS` for the task diff.
- Commit only Task 1 changes.

### Dependencies

None.

## Task 2: Centralize and migrate the runtime diagnostic prefix

### Scope and expected outcome

Introduce one shared constant containing `[slidev-addon-autofit]`, use it in
all runtime warning producers, and update prefix-sensitive browser
expectations. Warning categories, reasons, message bodies, timing, and
deduplication must remain unchanged.

### Relevant files

- New shared utility under `utils/autofit/`
- `components/AutoFit.vue`
- `components/AutoImage.vue`
- `layouts/auto-image.vue`
- `utils/autofit/useLayoutOverflow.ts`
- `tests/browser/auto-image-component.spec.ts`
- `tests/browser/auto-image-layout.spec.ts`

### Boundaries and non-goals

- Do not change diagnostic badges or CSS.
- Do not change `#7a0019`.
- Do not rewrite message categories, reason strings, or explanatory prose.
- Do not generalize the diagnostic helper beyond the shared package prefix.
- Keep paired coordination specific to `auto-column`.

### TDD and validation

1. **Red:** Update the prefix-sensitive browser assertions and warning filters
   to expect `[slidev-addon-autofit]`; run the smallest relevant diagnostic
   test selection and confirm failure because runtime still emits the legacy
   prefix.
2. **Green:** Add the shared prefix constant and replace all runtime prefix
   literals with imports/interpolation; rerun the focused diagnostic tests.
3. **Refactor:** Check import placement and message construction for clarity
   while keeping the focused tests green.
4. Search tracked runtime/test files to confirm
   `slidev-theme-umn-autolayout` is absent and the new prefix is not duplicated
   as independent runtime constants.

### Acceptance criteria

- All runtime warnings use the shared `[slidev-addon-autofit]` constant.
- Prefix-sensitive tests pass with the new identity.
- Diagnostic text following the prefix is unchanged.
- No tracked runtime or test string contains the former theme prefix.
- A fresh `code_reviewer` returns `PASS` for the task diff.
- Commit only Task 2 changes.

### Dependencies

- Task 1, so browser validation runs through addon-mode fixture loading.

## Task 3: Correct addon documentation and remove explicit UMN prose

### Scope and expected outcome

Update README installation/development guidance to the canonical addon
identity and replace the two `UMN-red outline` phrases in the example deck
with `diagnostic-color outline`.

### Relevant files

- `README.md`
- `example.md`

### Boundaries and non-goals

- Preserve the README badge's `color=7A0019` parameter.
- Preserve every other `#7a0019` occurrence and every fixture color.
- Preserve references to host-theme typography and styling.
- Preserve `theme: default` in the example deck.
- Preserve the `Auto-Layout Framework` subtitle.
- Keep README content concise and author-facing; do not document internals,
  tests, or the agent workflow.
- Do not add tests that assert README or example wording.

### Implementation and validation

Use proportionate documentation validation:

1. Update the npm badge target, install command, and addon shorthand to
   `slidev-addon-autofit` / `autofit` while retaining the badge color.
2. Convert only migration-stale installation and repository-development
   wording from theme to addon terminology, and accurately describe local
   example development without claiming `theme: ./`.
3. Replace both `UMN-red outline` phrases with
   `diagnostic-color outline`.
4. Search for stale package identifiers, explicit UMN prose, and accidental
   changes to protected host-theme wording or the subtitle.
5. Compare every tracked case-insensitive `7a0019` occurrence—including
   `#7a0019`, `color=7A0019`, and URL-encoded `%237a0019` values in fixture
   Markdown and component SVGs—against the pre-Task-1 workflow-artifact
   commit.
6. Build `example.md` as required by `AGENTS.md`.

### Acceptance criteria

- README package/install/addon identifiers match `slidev-addon-autofit` and
  `autofit`.
- README installation/development language accurately describes an addon.
- Both example phrases say `diagnostic-color outline`.
- All protected color values, host-theme language, and the example subtitle
  remain unchanged.
- The example deck builds successfully.
- A fresh `code_reviewer` returns `PASS` for the task diff.
- Commit only Task 3 changes.

### Dependencies

- Task 2, so documented diagnostic identity matches implemented runtime
  behavior.

## Final completion validation

After all three task commits and review gates:

1. Run the complete unit and browser test suite.
2. Run the production browser suite if it is not included by the default test
   command.
3. Build the example deck.
4. Verify the approved design's string, identity, and color-preservation
   acceptance criteria against tracked files. Compare the complete
   case-insensitive plain and URL-encoded `7a0019` occurrence set and contents
   with the workflow-artifact commit's tree, including every fixture file that
   supplied a baseline occurrence.
5. Confirm no generated output or debugging artifact appears in the tracked
   diff. Snapshot pre-existing ignored outputs before validation and remove
   only generated resources created by this work when safe and distinguishable;
   do not delete or modify pre-existing `dist/`, `test-results/`, or other user
   outputs merely to obtain a clean ignored-file state.
6. Ask the user to inspect `example.md`; completion requires the user's
   explicit visual `PASS` under `AGENTS.md`.

## Expected commit sequence

1. Approved design and implementation-plan artifacts.
2. Task 1: addon-mode browser fixture.
3. Task 2: centralized addon diagnostic identity.
4. Task 3: addon documentation and neutral diagnostic wording.

No commit should include unrelated pre-existing or user changes.
