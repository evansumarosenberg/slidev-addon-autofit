# slidev-addon-autofit

[![NPM version](https://img.shields.io/npm/v/slidev-addon-autofit?color=7A0019&label=)](https://www.npmjs.com/package/slidev-addon-autofit)

A [Slidev](https://github.com/slidevjs/slidev) addon with a WYSIWYM `auto-default` layout: authors describe ordinary Markdown structure, and the optional AutoFit region selects the largest configured typography-and-spacing tier that fits its real browser geometry.

## Installation

This project requires Node.js 20.12 or newer. Add the addon to a Slidev project with pnpm:

```bash
pnpm add -D slidev-addon-autofit
```

Select it in the deck's headmatter:

```yaml
---
addons:
  - autofit
layout: cover
defaults:
  layout: auto-default
---
```

Slidev can also prompt to install the package when it first encounters that addon name.

To develop this addon repository:

```bash
pnpm install
pnpm dev
```

`pnpm dev` serves and opens the comprehensive [`example.md`](./example.md) deck. The local deck retains `theme: default` and discovers this repository's addon files directly, so edits are reflected immediately.

## Auto-default layout and named slots

The `auto-default` layout supports fixed content above and below an optional AutoFit
region:

| Slot | Purpose |
| --- | --- |
| Unnamed/default | Fixed content at the top, such as the slide title |
| `auto` | AutoFit content using the remaining height |
| `footer` | Fixed content at the bottom |

```markdown
---
autofit:
  alignment: bottom
---

# Fixed slide title

This text keeps the theme's normal size.

::auto::

- Managed point one
- Managed point two

::footer::

Fixed footer text
```

The fixed regions keep their natural height. The `auto` slot receives whatever
space remains. Either named slot may be omitted, and the order of named slots in
the Markdown source does not change their placement.

## Auto-image layout

Use `layout: auto-image` to place one or more managed images beside or above
an ordinary AutoFit region. The unnamed default slot remains fixed above
the remaining space, and `footer` remains fixed below it. Named-slot order in
the Markdown source does not affect visual placement.

```markdown
---
layout: auto-image
image:
  position: right
  size: 40%
---

# Evidence and image

The title and this paragraph keep their natural size.

::image::

![First placeholder image](/images/placeholder.jpg)

An optional caption belongs to the first image.

![Second placeholder image](/images/placeholder.jpg)

![Third placeholder image](/images/placeholder.jpg)

The third image has this longer optional caption.

::auto::

- AutoFit receives the remaining space to the left of the image group.
- It uses the same `autofit` configuration as the `auto-default` layout.

::footer::

Fixed footer text
```

The `image` object accepts these values:

| Property | Values | Default |
| --- | --- | --- |
| `position` | `left`, `right`, `top`, `bottom`, or `center` | `center` |
| `size` | A percentage string from `0%` through `100%` | `100%` |

`size` is authoritative and is applied before the inter-region gap. For
`left` and `right`, it is a percentage of the remaining width; for `top` and
`bottom`, it is a percentage of the remaining height. For `center`, it sets
the image area's width and, when `auto` is declared, its height as percentages
of the remaining stage. The default region gap is `1rem`, taken from the AutoFit
remainder and never silently shrunk. Managed images fit at the largest
uncropped, aspect-preserving size, including when they must be upscaled. A
caption is fixed content inside the image region and uses a separate `1rem`
image-to-caption gap.

Each direct Markdown image, or Markdown paragraph containing only one image,
starts an item. Its immediately following paragraph is its optional caption;
the next image root instead means the preceding item has no caption. Captions
may use ordinary inline Markdown formatting, and image `alt` text is preserved.
There is no fixed item limit: the managed group either fits its region or
reports an overflow diagnostic. `image.position` must be an exact supported
lowercase value, and `image.size` must be a percent string; invalid image
configuration warns and leaves the fixed content visible without mounting the
image or AutoFit stage.

For two or more usable images, `top`, `bottom`, and `center` arrange a row:
images share one fitted height, retain their own aspect ratios, and are centered
in variable-width cells. Captions span their complete cells, so a narrow image
does not constrain its caption. `left` and `right` arrange a column: images
share one fitted width, retain their aspect ratios, and every caption spans the
complete image region. A valid single image keeps the existing legacy fitting,
caption, loading, and failure behavior.

AutoFit behavior depends on the position and slot contents:

- With `center`, the image area is centered horizontally and AutoFit receives
  the remaining space below it, above the fixed footer.
- An omitted `auto` slot reserves no gap. A declared empty slot mounts AutoFit
  and reserves the gap.
- A `100%` image with no `auto` slot fills its allocation without split
  overflow. A declared `auto` slot still reserves the gap, so the layout can
  report split overflow rather than shrinking the image.
- AutoFit receives only the actual remainder and keeps its normal tier search;
  it does not add a fallback size when that remainder is too small.

The layout and caption spacing can be overridden for a presentation with CSS:

```css
:root {
  --slidev-auto-image-region-gap: 2rem;
  --slidev-auto-image-caption-gap: 0.5rem;
  --slidev-auto-image-item-gap: 2rem;
  --slidev-auto-image-caption-font-size: 0.875rem;
  --slidev-auto-image-caption-line-height: 1.25rem;
  --slidev-auto-image-caption-color: color-mix(in srgb, var(--slide-foreground) 70%, transparent);
}
```

`--slidev-auto-image-item-gap` separates items in a multiple-image group. It
defaults to `2rem`; values below `1rem` are clamped to `1rem`. It is independent
of the region and image-to-caption gaps.

Auto-image diagnostics include `AUTO IMAGE CONFIGURATION ERROR` for invalid
frontmatter, `AUTO IMAGE LAYOUT OVERFLOW` when the authoritative image size and
region gap cannot share the available space, and `AUTO IMAGE OVERFLOW` when an
image group, its required item gaps, or a caption cannot fit. `AUTO IMAGE
UNSUPPORTED` covers a structurally invalid image sequence, unavailable media,
or substantive center `auto` content. A valid multiple-image group remains
hidden without a warning until every image settles. Failed images and their
captions are omitted while successful peers stay managed, and the group reports
`image-unavailable` until the failed media recover. Fixed main/footer overflow
keeps the existing `LAYOUT OVERFLOW` precedence; AutoFit can independently
report its existing overflow or unsupported diagnostics.

Version 1 does not support image cropping, linked or nested image wrappers,
`<figure>`/`<picture>` or arbitrary figure wrappers, non-image media, more than
one caption paragraph per image, or direct author use of `<AutoImage>`.
Auto-image is not coordinated with `auto-column`; use ordinary Markdown and let
the layout manage image sizing, caption spacing, and AutoFit typography.

## Auto-column layout

Use `layout: auto-column` for two equal AutoFit columns. The default slot and
footer work as they do in the `auto-default` layout.

```markdown
---
layout: auto-column
autofit:
  alignment: distributed
---

# Fixed slide title

This fixed default-slot text sits above the columns.

::left::

- Left-column content

::right::

- Right-column content

::footer::

Fixed footer text
```

One `autofit` configuration applies to both columns. Each column is measured
independently, and both use the smaller selected tier so their typography stays
visually consistent. For an eligible `distributed` pair, the column selecting
the smaller tier supplies spacing first. If that spacing overflows the other
column, tighter spacing from the other column is used when both columns fit.
Spacing is evaluated at the shared tier, with first rendered lines aligned.
Equal-tier pairs use the tighter spacing. Text aligns by its first line; a
media-only or atomic first unit aligns by its visible top edge. Other pairs
retain the normal shared-tier behavior.

For predictable results, use ordinary Markdown and allow AutoFit to control
font size, line height, and spacing.

## AutoFit configuration

The default, auto-column, and auto-image layouts use the same nested `autofit`
object:

| Property | Type | Default | Meaning |
| --- | --- | ---: | --- |
| `largeTiers` | Non-negative safe integer | `4` | Tiers above neutral |
| `smallTiers` | Non-negative safe integer | `4` | Tiers below neutral |
| `tierIncrement` | Finite positive number | `10` | Percentage-point change between adjacent tiers |
| `alignment` | String | `distributed` | `top`, `middle`, `center`, `bottom`, or `distributed` |

Missing properties use their defaults. `center` is an alias for `middle`.
Invalid configuration produces a warning and falls back to the complete default
configuration.

The global `<AutoFit>` component can also be used directly. It accepts
`largeTiers`, `smallTiers`, `tierIncrement`, and `alignment` as props:

```markdown
<AutoFit :large-tiers="2" :small-tiers="6" alignment="bottom">

Content managed by this AutoFit instance.

</AutoFit>
```

## Tiers, spacing, and alignment

Tier `0` uses the theme's normal typography. With the defaults, AutoFit can
select scales from 60% through 140% in ten-percentage-point steps and uses the
largest tier that fits. Headings can shrink when necessary but do not grow
beyond their theme-defined size.

AutoFit preserves Markdown structure while applying consistent visual gaps.
Standalone paragraphs, lists, headings, and atomic blocks receive full gaps;
related content beneath a heading and nested list content use tighter half
gaps. List indentation, markers, and the internal styling of blockquotes, code,
tables, and other atomic content remain intact.

The base spacing can be customized with:

```css
--slidev-autofit-base-spacing: 1rem;
```

Alignment controls how unused vertical space is placed:

| Requested value | Result |
| --- | --- |
| `top` | Empty space follows the content |
| `middle` | Empty space is split equally before and after |
| `center` | Alias for effective `middle` |
| `bottom` | Empty space precedes the content |
| `distributed` | Empty space augments the outer padding and existing semantic boundaries |

If there is too little space to distribute safely, `distributed` falls back to
`middle`. Overflow uses top alignment.

## Media and supported content

In `auto-default`, `auto-image`, and `auto-column`, standalone `$$ ... $$`
LaTeX blocks participate in tier sizing and external spacing while retaining
KaTeX's equation formatting and horizontal centering. Use separate blocks for
separate spacing units; multiline equations remain one block. Equations too
wide for the smallest tier report overflow. Inline `$ ... $` math retains its
existing behavior in paragraphs and lists.

Ordinary Markdown headings, paragraphs, lists, blockquotes, fenced code,
tables, images, and media are supported. Text participates in tier sizing.
Images, video, diagrams, embedded players, and other graphical media keep their
authored or intrinsic dimensions; oversized media can therefore cause
overflow.

Custom components should render a measurable element root. Bare text roots and
`display: contents`-only roots are unsupported. Avoid components whose
dimensions change discontinuously in response to the selected scale, such as
tier-dependent breakpoints or container-query layout changes.

## Diagnostics

| Diagnostic | Meaning | Author action |
| --- | --- | --- |
| `AUTOFIT OVERFLOW` (smallest configured tier) | Ordinary content does not fit at the smallest configured tier | Reduce content or allow more small tiers |
| `AUTOFIT OVERFLOW` (coordinated semantic gaps) | Required shared gaps exceed the target viewport at the shared tier | Reduce the target content or allow more space |
| `AUTOFIT OVERFLOW` (coordinated start alignment) | Required first-line alignment exceeds the target viewport at the shared tier | Reduce the target content or allow more space |
| `AUTOFIT OVERFLOW` (gaps and start alignment) | Both coordinated requirements exceed the target viewport | Reduce the target content or allow more space |
| `AUTOFIT UNSUPPORTED` | The AutoFit content cannot be measured reliably | Prefer ordinary Markdown or simplify the custom component structure |
| `LAYOUT OVERFLOW` | Fixed title/footer content exceeds the slide | Shorten the fixed content or move more content into AutoFit |

## Click reveals

Default `v-click` and `v-clicks` reveals remain in the measured flow, so
advancing them preserves the selected tier, spacing, and element positions.
This works with every alignment, including the default `distributed` mode.

Use `<v-click>` around a complete block:

```markdown
<v-click>

This paragraph is revealed as one block.

</v-click>
```

For Markdown lists, wrap the complete list so each marker is revealed with its
text:

```markdown
<v-clicks depth="2">

- First point
  - Nested detail
- Second point

</v-clicks>
```

Do not insert a block reveal component between indented list items that are
intended to remain one nested list. Do not wrap only the text inside a list item
if its marker should also be hidden. Hide/display-removing modifiers,
transform/scale animations, `v-switch`, and explicit `display: none` can change
geometry and are not guaranteed to remain layout-stable.

## Examples

See [`example.md`](./example.md) for complete auto-default, auto-column, and
auto-image examples, including configuration, alignment, reveals, media,
overflow, and unsupported-content demonstrations.
