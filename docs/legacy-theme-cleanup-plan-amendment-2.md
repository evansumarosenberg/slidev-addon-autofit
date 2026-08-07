# Legacy Theme Cleanup Implementation Plan Amendment 2

## References and authority

This supplemental plan implements
`docs/legacy-theme-cleanup-design-amendment-2.md` and supplements all earlier
approved legacy-cleanup design and plan documents.

The earlier documents remain immutable. This plan supersedes only their
fixture-immutability gates for the 45 exact placeholder filename replacements
authorized by Design Amendment 2. The fixture must retain `theme: ../..`, must
not gain an addon entry, and remains subject to every other earlier constraint.

Before implementation, commit Design Amendment 2 and this Plan Amendment 2
together as workflow artifacts. That commit must contain only these two new
amendment files. All earlier approved documents must remain byte-identical to
their committed versions.

## Task: Repair renamed-asset fixture coverage and theme-color assertions

### Scope and expected outcome

Update the browser fixture to reference the renamed placeholder asset and make
the AutoImage color test validate rendered host-theme behavior without
asserting the raw caption-color custom-property implementation token.

### Relevant files

- `tests/fixtures/autofit.md`
- `tests/browser/auto-image-component.spec.ts`

### Boundaries and non-goals

- In the fixture, change only the 45 exact
  `../../public/images/placeholder.jpg` strings to
  `../../public/images/autofit_placeholder.jpg`.
- Preserve fixture headmatter, slide structure, prose, test identifiers,
  inline SVGs, and every color value.
- Remove only collection and expectations for the raw
  `--slidev-auto-image-caption-color` custom property.
- Preserve the behavioral comparisons proving rendered caption color follows
  the active theme and changes from light to dark mode.
- Do not change `styles/layout.css`, production code, README, `example.md`,
  package metadata, resolver infrastructure, or unrelated tests.
- Do not submit the recorded Slidev resolver issue in this task.

### Implementation and validation

This task corrects test infrastructure and expectations rather than production
behavior, so use proportionate validation rather than manufacturing a new
production test.

1. Record a before-state showing 45 old fixture paths and zero replacement
   paths.
2. Perform the exact 45 filename replacements.
3. Remove `captionColorInput` collection and raw light/dark expectations from
   the existing AutoImage default-properties test.
4. Confirm the rendered caption-color reference comparisons and light/dark
   change assertion remain intact.
5. Verify the fixture diff consists only of 45 old-to-new filename
   replacements; confirm `theme: ../..`, no addon entry, protected color-token
   counts, and all other fixture content remain unchanged.
6. Run the focused AutoImage default-properties browser test.
7. Run the production fixture build and production browser test.
8. Run the full relevant browser suite to confirm the former currentColor
   failure is absent and detect regressions.
9. Run unit tests and build `example.md` as final regression gates.

### Acceptance criteria

- The fixture contains zero old paths and exactly 45 renamed paths.
- The renamed asset resolves in the production fixture build.
- The AutoImage test contains no raw caption-color custom-property assertion.
- Rendered light/dark caption-color behavior remains covered and passes.
- Fixture headmatter and all non-path content remain unchanged.
- No protected color, production, README, or example source changes occur.
- Focused, production, unit, browser, and example-build validation pass apart
  from any newly discovered and independently verified pre-existing blocker.
- A fresh `code_reviewer` returns `PASS` for the task diff.
- Commit only the two task files.

### Dependencies

Design Amendment 2 and this plan amendment must be approved and committed.

## Final completion validation

1. Verify every prior source-of-truth document is unchanged from its committed
   approved version.
2. Verify the workflow-artifact commit contains only Amendment 2 documents and
   the task commit contains only the two authorized test-infrastructure files.
3. Confirm all active stale theme/UMN/package identifiers remain absent.
4. Confirm the centralized diagnostic identity and all protected product-color
   tokens remain unchanged.
5. Confirm `tests/fixtures/autofit.md` differs from commit `029da56` only by the
   45 approved placeholder filename replacements.
6. Remove only validation outputs created by this work; preserve pre-existing
   ignored `dist/` and user artifacts.
7. Record the previously supplied human visual `PASS` as still applicable:
   this amendment changes neither `example.md` nor production rendering, and
   the example build is rerun successfully.
8. Retain the unsubmitted Slidev resolver GitHub issue as a follow-up.

## Revised commit sequence

1. Supplemental Design Amendment 2 and Plan Amendment 2 artifacts.
2. Fixture-path and theme-color test corrections.

No commit may include production, README, example, color, resolver, or
unrelated changes.
