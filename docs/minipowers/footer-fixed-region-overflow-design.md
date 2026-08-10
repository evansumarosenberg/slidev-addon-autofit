# Fixed-Region Structural Overflow Design

Status: Proposed

## Context

The `auto-default`, `auto-column`, and `auto-image` layouts share a fixed-region
overflow detector for their main and footer slots. The detector currently
combines structural element rectangles with raw region scroll extents and every
rendered descendant rectangle.

Two ordinary footer patterns expose false positives under the default Slidev
theme:

- A Markdown hyperlink contributes an inline rectangle and scroll extent that
  includes its painted bottom border beyond the containing line box.
- A Markdown heading can report a scroll height slightly larger than its fitted
  block rectangle because of browser font metrics.

In both cases, the footer's structural layout rectangle fits exactly inside the
padded slide content box, but the incidental painted or scrollable extent
crosses the existing `0.5px` threshold and incorrectly activates `LAYOUT
OVERFLOW`.

## Objective

Make fixed-region overflow diagnostics represent structural DOM box overflow,
so fitting hyperlinks and headings do not report overflow in any custom layout.
Preserve existing diagnostics for genuine structural overflow without adding a
new text-measurement subsystem.

## Definitions

### Structural overflow

Structural overflow occurs when the rectangle of a fixed region or a qualifying
descendant extends beyond the layout's padded content box by more than `0.5px`
on any side.

Qualifying descendants include:

- Block-level boxes.
- Atomic inline boxes such as `inline-block`, `inline-flex`, and `inline-grid`.
- Replaced or media elements.
- Positioned elements.
- Elements with an effective transform, translate, rotate, or scale.
- Ordinary elements with negative margins or other geometry that makes them
  non-transparent to layout measurement.

### Geometry-transparent inline formatting

An ordinary inline formatting wrapper is geometry-transparent when it:

- Uses `display: inline`.
- Uses static positioning.
- Has no effective transform, translate, rotate, or scale.
- Has no negative margins.
- Is not a replaced or media element.

Examples include normally styled `a`, `em`, `strong`, and `span` elements. The
wrapper's independent rectangle does not contribute to fixed-region overflow.
Changing such an element into an atomic, positioned, transformed, or
negative-margin box makes it qualifying again.

### Paint-only and scroll-only extent

Paint-only extent includes glyph overhang, text decoration, borders on
geometry-transparent inline formatting, and shadows that do not change a
qualifying structural rectangle.

Scroll-only extent is content visible only through `scrollWidth` or
`scrollHeight` when no qualifying structural rectangle crosses the padded
content box.

Neither paint-only nor scroll-only extent is structural overflow.

## Required behavior

1. The shared fixed-region detector must use the same structural overflow
   semantics for both the fixed main and footer regions.
2. The behavior must apply consistently to `auto-default`, `auto-column`, and
   `auto-image` through their existing shared detector.
3. A fitting Markdown hyperlink in a footer must not activate layout overflow,
   even when theme styling paints an inline border or decoration beyond its line
   box.
4. A fitting Markdown heading in a footer must not activate layout overflow
   when its structural block rectangle fits but its scroll height includes
   additional font ink.
5. Raw `scrollWidth` and `scrollHeight` must not be authoritative inputs to the
   fixed-region overflow decision on either axis.
6. Geometry-transparent inline formatting rectangles must not independently
   expand the measured bounds.
7. The region rectangle and all qualifying descendant rectangles must continue
   to contribute to the measured bounds.
8. The existing `0.5px` tolerance must remain unchanged and inclusive: an
   excursion of at most `0.5px` fits, while an excursion greater than `0.5px`
   overflows.
9. Existing ancestor clipping semantics must remain unchanged. A descendant's
   contribution is clipped on an axis by intervening ancestors whose computed
   overflow on that axis is `auto`, `clip`, `hidden`, or `scroll`.
10. Genuine positive-, negative-, horizontal-, and vertical-side structural
    overflow must continue to activate the existing diagnostic.
11. Positioned and transformed structural descendants must continue to be
    measured, including leading-side and top excursions.
12. The detector's scheduling, observation, warning transition behavior, and
    public reactive result must remain unchanged.

## Diagnostics and layout behavior

This change does not introduce or rename public diagnostics. When structural
overflow is present, each layout retains its existing:

- Overflow class and `data-layout-overflow="true"` attribute.
- `LAYOUT OVERFLOW` badge.
- Console warning behavior on entry into overflow.
- Diagnostic precedence over inner AutoFit or auto-image diagnostics.

The grid tracks, fixed-region natural sizing, layout padding, and clipping
styles remain unchanged.

## Scope

The production behavior change is limited to the shared fixed-region overflow
measurement used by the three custom layouts. Focused fixtures and automated
tests may be added or updated to cover the corrected behavior and protect the
existing structural-overflow contract.

The two user-authored slides in `example.md` remain human-review demonstrations.
They are not executable specifications or automated test fixtures.

## Non-goals

- Detecting text-only overflow, including long unbreakable or `nowrap` text
  whose overflow appears only in scroll metrics.
- Measuring `::before` or `::after` pseudo-elements or other generated content.
- Detecting glyph ink, text decoration, inline-formatting borders, shadows, or
  other paint-only effects outside structural boxes.
- Adding text-node `Range` measurement or another text geometry subsystem.
- Changing AutoFit content measurement, direct `<AutoFit>` behavior, typography
  tier selection, alignment, or spacing.
- Changing `auto-column` coordination.
- Changing `auto-image` sizing, split allocation, or image diagnostics.
- Adding public configuration, syntax, diagnostics, or author controls.
- Handling every possible custom HTML or CSS edge case.
- Changing `README.md`.

## Validation

Automated validation must use focused runtime fixtures rather than assertions
against `example.md`.

Required coverage includes:

- Fitting footer hyperlinks do not report layout overflow in all three custom
  layouts.
- Fitting footer headings do not report layout overflow in all three custom
  layouts.
- The fixtures reproduce the relevant decorated-inline and excess-scroll-metric
  conditions while their structural footer boxes remain inside the padded
  content box.
- Genuine fixed-region vertical and horizontal structural overflow remains
  detected.
- Leading-side and top transformed-descendant transitions retain the inclusive
  `0.5px` tolerance.
- Qualifying atomic, media, positioned, or transformed descendants remain
  measurable.
- Intervening clipping ancestors continue to constrain descendant bounds.
- Existing warning transitions, diagnostic precedence, and layout lifecycle
  behavior remain green.

The complete relevant unit and browser test suite must pass. The example deck
must build successfully. Because the change affects rendered slides, final
completion additionally requires the user's visual inspection of `example.md`
and explicit `PASS`; screenshots are not a substitute unless the user requests
them.

## Acceptance criteria

The design is satisfied when:

1. The two reported footer examples render without `LAYOUT OVERFLOW` in their
   fitting state.
2. Equivalent hyperlink and heading footer cases remain non-overflowing in
   `auto-default`, `auto-column`, and `auto-image`.
3. Fixed main and footer regions use one consistent structural-box measurement
   rule.
4. Scroll-only and geometry-transparent inline paint no longer cause layout
   overflow.
5. Existing structural overflow, clipping, tolerance, diagnostic, and lifecycle
   behavior is preserved.
6. No new text or pseudo-element measurement machinery is introduced.
7. No public API, layout allocation, README, or unrelated behavior changes.
8. Automated validation and the example build pass, followed by the required
   user visual-verification `PASS`.
