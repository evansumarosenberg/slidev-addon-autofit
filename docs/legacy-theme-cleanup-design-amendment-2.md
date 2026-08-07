# Legacy Theme Cleanup Design Amendment 2

## References

This amendment supplements:

- `docs/legacy-theme-cleanup-design.md`
- `docs/legacy-theme-cleanup-plan.md`
- `docs/legacy-theme-cleanup-design-amendment-1.md`
- `docs/legacy-theme-cleanup-plan-amendment-1.md`

Those approved documents remain immutable. For implementation authority, this
amendment narrowly supersedes Amendment 1 and Plan Amendment 1 requirements
that prohibit every fixture change or require the complete fixture to remain
identical to commit `029da56`, but only for the 45 placeholder-path
replacements specified below. The fixture must retain `theme: ../..`, must not
gain an addon entry, and remains subject to every other earlier fixture,
resolver, color, and scope constraint. This amendment otherwise adds two
follow-up test-infrastructure corrections without altering the completed
legacy-identity behavior or documentation.

## Rationale

### Renamed placeholder asset

Commit `1b4631a` renamed the repository placeholder image to
`public/images/autofit_placeholder.jpg` and updated `example.md`, but
`tests/fixtures/autofit.md` retains 45 references to the nonexistent
`../../public/images/placeholder.jpg`. Development serving can defer these
requests, while the production fixture build rejects them as unresolved
imports.

### Theme-owned caption color

The addon intentionally defines the caption-color custom property with
`currentColor`, allowing the host theme to determine the actual foreground.
The browser test still expects the raw custom-property token stream to be
serialized as explicit light- and dark-theme hex colors. CSS custom properties
preserve their authored token stream, so that assertion is both incorrect and
coupled to `layout.css` implementation details.

The useful behavioral contract is that the rendered caption color follows the
active theme and changes between light and dark modes. Those checks remain.

## Precise design delta

- In `tests/fixtures/autofit.md`, replace all 45
  `../../public/images/placeholder.jpg` references with
  `../../public/images/autofit_placeholder.jpg`.
- In the existing AutoImage default-custom-properties browser test, stop
  collecting and asserting the raw
  `--slidev-auto-image-caption-color` custom-property value.
- Retain the test's rendered caption-color derivation and light/dark transition
  assertions.
- Do not modify `styles/layout.css` or introduce a replacement raw-color
  assertion.

## Scope

- `tests/fixtures/autofit.md`
- `tests/browser/auto-image-component.spec.ts`

## Non-goals

- No production component, layout, utility, or CSS changes.
- No color-value changes, including `#7a0019` and fixture SVG fills.
- No README or `example.md` changes.
- No addon-resolver or package-consumer infrastructure.
- No submission of the separately recorded Slidev resolver GitHub issue.
- No broad cleanup of unrelated fixture prose or test expectations.

## Acceptance criteria

1. No `../../public/images/placeholder.jpg` reference remains in the browser
   fixture.
2. Exactly 45 fixture references use
   `../../public/images/autofit_placeholder.jpg`.
3. The production fixture build no longer fails on the renamed placeholder
   asset.
4. The AutoImage browser test does not inspect or assert the raw caption-color
   custom property.
5. Behavioral rendered caption-color checks remain and pass in light and dark
   modes.
6. `styles/layout.css`, all protected product colors, README, and `example.md`
   remain unchanged.
7. The focused browser test, production browser path, and full relevant
   validation pass apart from independently documented pre-existing failures.
8. The previously supplied human visual `PASS` remains applicable because
   neither `example.md` nor rendered production behavior changes; the example
   build will still be rerun as a final regression gate.
