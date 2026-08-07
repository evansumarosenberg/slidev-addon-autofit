# Legacy Theme Cleanup Implementation Plan Amendment 1

## References and authority

This supplemental plan implements the approved delta in
`docs/legacy-theme-cleanup-design-amendment-1.md`. It supplements the original
approved plan in `docs/legacy-theme-cleanup-plan.md`.

The original design and plan remain immutable records. Where this amendment
conflicts with their addon-mode browser-fixture requirements, this amendment
controls. All other original requirements remain in force.

Before implementation resumes, commit the approved design and plan amendment
documents together as supplemental workflow artifacts. Preserve commit
`029da56` as the authoritative pre-implementation color baseline.
That supplemental workflow-artifact commit must contain only the two new
amendment files. The original `docs/legacy-theme-cleanup-design.md` and
`docs/legacy-theme-cleanup-plan.md` must remain byte-identical to `029da56`.

## Canceled task: addon-mode browser fixture

Original Task 1, “Exercise the package through Slidev's addon resolver,” is
canceled.

- `tests/fixtures/autofit.md` must remain unchanged at `theme: ../..` with no
  addon entry.
- Do not add workspace-consumer metadata, resolver workarounds, package-link
  helpers, junctions, or related infrastructure.
- Do not create a Task 1 implementation commit.
- Record the Slidev relative-addon resolver issue as a completion follow-up;
  do not submit an external issue in this task.

## Supplemental Task A: Centralize and migrate the runtime diagnostic prefix

This task is original Task 2 with its addon-fixture dependency removed.

### Scope and expected outcome

Introduce one shared constant containing `[slidev-addon-autofit]`, use it in
all runtime warning producers, and update prefix-sensitive browser
expectations. Warning categories, reasons, message bodies, timing, and
deduplication remain unchanged.

### Relevant files

- New shared utility under `utils/autofit/`
- `components/AutoFit.vue`
- `components/AutoImage.vue`
- `layouts/auto-image.vue`
- `utils/autofit/useLayoutOverflow.ts`
- `tests/browser/auto-image-component.spec.ts`
- `tests/browser/auto-image-layout.spec.ts`
- `tests/browser/default-layout.spec.ts`

### Boundaries and non-goals

- Do not change `tests/fixtures/autofit.md`.
- Do not change diagnostic badges, CSS, `#7a0019`, categories, reason strings,
  explanatory message bodies, warning timing, or deduplication.
- Do not generalize the helper beyond the package prefix.
- Keep paired coordination specific to `auto-column`.

### TDD and validation

1. **Red:** Update prefix-sensitive browser assertions and filters to expect
   `[slidev-addon-autofit]`; run the smallest relevant diagnostic selection and
   confirm failure because runtime still emits the old prefix.
   Extend the existing fixed-layout overflow-warning test to assert its
   complete new warning string, so `useLayoutOverflow.ts` has prefix-sensitive
   runtime coverage alongside AutoFit and AutoImage producers.
2. **Green:** Add the shared constant and replace all runtime prefix literals
   with imports/interpolation; rerun focused diagnostic tests.
3. **Refactor:** Improve import/message construction clarity without changing
   behavior and keep focused tests green.
4. Search tracked runtime/test files to confirm the old prefix is absent and
   the new runtime identity is centralized.

### Acceptance criteria

- All runtime warnings use the shared `[slidev-addon-autofit]` constant.
- Prefix-sensitive tests expect the new identity.
- Diagnostic text after the prefix is unchanged.
- No tracked runtime or test string contains the former theme prefix.
- `tests/fixtures/autofit.md` remains identical to commit `029da56`.
- A fresh `code_reviewer` returns `PASS`.
- Commit only Supplemental Task A changes.

### Dependencies

The approved supplemental design and this supplemental plan must be committed.
There is no addon-fixture migration dependency.

## Supplemental Task B: Correct addon documentation and remove UMN prose

This task is original Task 3 without a dependency on the canceled fixture
task.

### Scope and expected outcome

Update README installation/development guidance to the canonical addon
identity and replace the two `UMN-red outline` phrases in the example deck
with `diagnostic-color outline`.

### Relevant files

- `README.md`
- `example.md`

### Boundaries and non-goals

- Preserve the README badge's `color=7A0019` parameter.
- Preserve every other plain or URL-encoded `7a0019` value and every fixture
  color.
- Preserve host-theme typography/styling language, `theme: default` in the
  example, and the `Auto-Layout Framework` subtitle.
- Keep README content concise and author-facing.
- Do not add tests for README or example wording.
- Do not change `tests/fixtures/autofit.md`.

### Implementation and validation

1. Update the npm badge target, installation command, and addon shorthand to
   `slidev-addon-autofit` / `autofit`, retaining the badge color.
2. Convert only stale installation and repository-development wording from
   theme to addon terminology. Accurately describe local example development
   without claiming the example uses `theme: ./`.
3. Replace both `UMN-red outline` phrases with
   `diagnostic-color outline`.
4. Search for stale package identifiers and explicit UMN prose, and verify
   protected host-theme language and the subtitle remain.
5. Compare the pre-existing protected product-color occurrences against commit
   `029da56`: the README badge's `color=7A0019` token,
   `styles/layout.css`'s `#7a0019`, and every `%237a0019` fixture SVG token in
   `tests/fixtures/autofit.md` and `tests/fixtures/components/`. Allow the
   README badge's surrounding package URL to change while requiring its color
   token to remain exact. Descriptive `7a0019` mentions added by workflow
   documents are excluded because they are not product color values.
6. Build `example.md` as required by `AGENTS.md`.

### Acceptance criteria

- README package/install/addon identifiers match `slidev-addon-autofit` and
  `autofit`.
- README installation/development wording describes an addon.
- Both example phrases say `diagnostic-color outline`.
- Protected colors, host-theme language, and the example subtitle remain.
- `tests/fixtures/autofit.md` remains identical to commit `029da56`.
- The example deck builds successfully.
- A fresh `code_reviewer` returns `PASS`.
- Commit only Supplemental Task B changes.

### Dependencies

Supplemental Task A must be complete so documentation and runtime use the same
addon identity.

## Final completion validation

After both supplemental task commits and review gates:

1. Run the complete unit and browser test suite.
2. Run the production browser suite if it is not included by the default test
   command.
3. Build the example deck.
4. Verify original requirements that were not superseded plus every
   supplemental acceptance criterion.
5. Confirm `tests/fixtures/autofit.md` is identical to commit `029da56`.
6. Compare only the pre-existing protected product-color paths and tokens
   against commit `029da56`: exact README `color=7A0019`, exact
   `styles/layout.css` `#7a0019`, and all URL-encoded `%237a0019` fixture SVG
   occurrences. Exclude additive descriptive mentions in workflow artifacts.
7. Confirm no generated artifact appears in the tracked diff. Preserve
   pre-existing ignored `dist/`; remove only outputs created by this work when
   safe and distinguishable.
8. Ask the user to inspect `example.md`; completion requires an explicit visual
   `PASS` under `AGENTS.md`.
9. Record, without submitting, the follow-up to report Slidev 52.19 relative
   addon paths resolving from `dirname(userRoot)` rather than `userRoot`.
10. Verify `docs/legacy-theme-cleanup-design.md` and
    `docs/legacy-theme-cleanup-plan.md` are byte-identical to commit `029da56`.

## Revised commit sequence

1. Approved supplemental design and plan amendment artifacts.
2. Supplemental Task A: centralized addon diagnostic identity.
3. Supplemental Task B: addon documentation and neutral diagnostic wording.

No commit may contain fixture changes, resolver infrastructure, unrelated
pre-existing work, or generated output.
