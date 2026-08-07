# Legacy Theme Cleanup Design

## Context

The project now ships as `slidev-addon-autofit`, but runtime diagnostics,
installation documentation, and the browser fixture retain identifiers and
loading conventions from the former `slidev-theme-umn-autolayout` package.
The cleanup must make the addon identity consistent without changing AutoFit
behavior, host-theme integration, or the existing diagnostic palette.

## Goals

- Identify runtime diagnostics as belonging to `slidev-addon-autofit`.
- Make installation and local-development documentation describe an addon.
- Exercise the repository as an addon in browser and production test builds.
- Remove explicit UMN branding from example prose.
- Prevent the diagnostic prefix from drifting across runtime surfaces.

## Design

### Diagnostic identity

Define the complete diagnostic prefix `[slidev-addon-autofit]` once in a shared
autofit utility. AutoFit, AutoImage, auto-image layout, and fixed-layout
overflow warnings will import and interpolate that shared value. Diagnostic
categories, reasons, explanatory text, warning timing, deduplication, and
visual badges remain unchanged.

Browser expectations and warning filters that assert the former
`[slidev-theme-umn-autolayout]` prefix will assert the new addon prefix.

### Addon-mode browser fixture

The browser fixture will select the default host theme and load the repository
as a local addon:

```yaml
theme: default
addons:
  - ../..
```

The existing Playwright development server and production-build helper will
continue to consume the same fixture. This makes both paths exercise Slidev's
addon resolver while retaining the host theme used by the current tests.

### README identity and terminology

The README badge, npm link, install command, and addon shorthand will use the
canonical `slidev-addon-autofit` / `autofit` identity established by
`package.json` and the repository name.

Migration-stale phrases in the installation and repository-development
instructions will refer to an addon rather than a theme. The local development
description will accurately explain that the deck selects the default theme
and discovers this repository's addon files locally; it will not claim that
the example uses `theme: ./`.

References to the consuming deck's theme-defined typography and styling will
remain. Those describe intentional host-theme inheritance rather than the old
package type.

### Example wording and color

The two intentional-overflow examples will describe their outline as a
`diagnostic-color outline` instead of a `UMN-red outline`.

All `#7a0019` values will remain unchanged, including the diagnostic CSS
custom-property default, the README badge color, and browser-fixture SVG fills.
The subtitle `A "What You See Is What You Mean" (WYSIWYM) Auto-Layout
Framework` will also remain unchanged because it describes behavior rather
than the former package identity.

## Scope

Expected affected areas are:

- Runtime diagnostic producers in `components/`, `layouts/`, and
  `utils/autofit/`.
- Prefix-sensitive browser tests.
- The browser fixture's initial headmatter.
- Installation and development guidance in `README.md`.
- Two UMN-specific phrases in `example.md`.

## Non-goals

- No changes to AutoFit, AutoImage, layout, coordination, or measurement
  behavior.
- No changes to diagnostic categories, reason strings, warning frequency, or
  badge presentation.
- No changes to colors, including fixture colors and `#7a0019`.
- No removal of legitimate host-theme terminology or `theme: default`.
- No changes to the example deck's subtitle.
- No broad renaming of `auto-column`, `auto-image`, or descriptive
  `auto-layout` terminology.
- No conversion of `example.md` into an executable test specification.

## Acceptance criteria

1. No tracked runtime or test string contains
   `slidev-theme-umn-autolayout`.
2. Runtime warnings use the centralized `[slidev-addon-autofit]` prefix.
3. The browser fixture loads `theme: default` and the local addon through
   `addons: - ../..`.
4. README installation examples consistently name `slidev-addon-autofit` and
   `autofit`, and migration-stale theme-installation wording is removed.
5. Explicit `UMN-red` prose is absent and replaced with
   `diagnostic-color outline`.
6. Every pre-existing `#7a0019` occurrence remains unchanged.
7. Legitimate host-theme language and the example subtitle remain intact.
8. Focused diagnostic tests, the full relevant test suite, and the example
   deck build pass.
9. Because the fixture and example deck affect rendered slides, final visual
   completion remains subject to the user's inspection of `example.md` and an
   explicit PASS, as required by `AGENTS.md`.

## Risks and mitigations

- **Addon resolver differences:** The relative addon path has been verified
  against the installed Slidev resolver. Retaining `theme: default` isolates
  the change to how this repository is loaded.
- **Inconsistent warning prefixes:** A shared constant and prefix-sensitive
  browser assertions prevent partial replacement.
- **Accidental branding-color cleanup:** Validation will compare all
  `#7a0019` occurrences before and after implementation.
- **Documentation overcorrection:** Only installation/development wording is
  converted to addon terminology; host-theme behavior remains documented.
