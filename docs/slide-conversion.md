# Autofit Addon

This presentation uses a [Slidev](https://github.com/slidevjs/slidev) addon with three layouts that fit ordinary Markdown to the available slide space. Activate it in the deck's headmatter:

```yaml
---
addons:
  - autofit
layout: cover
defaults:
  layout: auto-default
---
```

## Slide frontmatter shared by all three layouts

During conversion, set only `alignment` in the optional `autofit` object:

```yaml
---
autofit:
  alignment: distributed
---
```

| Property | Default | Accepted values |
| --- | --- | --- |
| `alignment` | `distributed` | `distributed`, `top`, `middle` (or `center`), `bottom` |

Leave AutoFit's tier settings at their defaults. Use `distributed` for most slides; consider another alignment only when `distributed` cannot produce the slide's intended layout. `distributed` shares spare space across outer padding and content gaps. Invalid `autofit` values warn and fall back to defaults.

## Auto-default layout and named slots

The `auto-default` layout supports fixed content above and below an optional AutoFit region. Because it is already set presentation-wide under `defaults`, do not declare `layout: auto-default` in individual slide frontmatter.

| Slot            | Purpose                                           |
| --------------- | ------------------------------------------------- |
| Unnamed/default | Fixed content at the top, such as the slide title |
| `auto`          | AutoFit content using the remaining height        |
| `footer`        | Fixed content at the bottom                       |

```markdown
---
autofit:
  alignment: distributed
---

# Fixed slide title

This text keeps the theme's normal size.

::auto::

- Managed point one
- Managed point two

::footer::

Fixed footer text
```

The fixed regions keep their natural height. The `auto` slot receives whatever space remains. Either named slot may be omitted, and the order of named slots in the Markdown source does not change their placement. Omit `autofit` to use its defaults.

## Auto-column layout

Use `layout: auto-column` for two equal AutoFit columns. The default slot and footer work as they do in the `auto-default` layout.

```markdown
---
layout: auto-column
autofit:
  alignment: distributed
---

# Fixed slide title

::left::

- Left-column item 1
- Left-column item 2

::right::

- Right-column item 1

::footer::

Fixed footer text
```

One `autofit.alignment` value applies to both columns; omit `autofit` to use the default. Each column is measured independently, and both use the smaller selected tier. With `distributed` alignment, eligible pairs also coordinate spacing and align their first rendered lines.

## Auto-image layout

Use `layout: auto-image` to place one or more managed images beside, above, or below an AutoFit region, or centered without one. The unnamed default slot remains fixed above the remaining space, and `footer` remains fixed below it. Named-slot order in the Markdown source does not affect visual placement.

```markdown
---
layout: auto-image
image:
  position: right
  size: 40%
autofit:
  alignment: distributed
---

# Evidence and image

::image::

![First placeholder image](/images/autofit_placeholder.jpg)

An optional caption belongs to the first image.

![Second placeholder image](/images/autofit_placeholder.jpg)

![Third placeholder image](/images/autofit_placeholder.jpg)

The third image has this longer optional caption.

::auto::

- AutoFit receives the remaining space to the left of the image group.
- It uses the same `autofit` configuration as the `auto-default` layout.

::footer::

Fixed footer text
```

The `image` object accepts these values:

| Property | Default | Accepted values |
| --- | --- | --- |
| `position` | `center` | `left`, `right`, `top`, `bottom`, or `center` |
| `size` | `100%` | A percentage string from `0%` through `100%` |

Omit `image` when using both defaults and include only properties that differ. Omit `autofit` when its defaults suffice; it applies when an `::auto::` slot is declared. With `center`, the AutoFit region sits below the centered image area and above the fixed footer. Omit `::auto::` if the slide has only images.

`size` is authoritative and is applied before the inter-region gap. For `left`, `right`, and `center`, it is a percentage of the remaining width; for `top` and `bottom`, it is a percentage of the remaining height. A declared `::auto::` reserves a gap, so `size: 100%` with `::auto::` can overflow.

Managed images fit at the largest uncropped, aspect-preserving size, including when they must be upscaled. A caption is fixed content inside the image region.

Each direct Markdown image, or Markdown paragraph containing only one image, starts an item. Its immediately following paragraph is its optional caption; another image starts the next item without a caption. Captions may use inline Markdown. There is no fixed image limit, but the group must fit its region. Invalid `image` configuration warns and leaves only fixed content visible.

For two or more usable images, `top`, `bottom`, and `center` arrange a row: images share one fitted height, retain their own aspect ratios, and are centered in variable-width cells. Captions span their complete cells, so a narrow image does not constrain its caption. `left` and `right` arrange a column: images share one fitted width, retain their aspect ratios, and every caption spans the complete image region.

## PDF slide conversion

When converting slides from a PDF:

1. Skip the cover slide.
2. Ignore Beautiful.ai watermarks that appear on slides.
3. Export each source image to `public/images` at its original resolution.
4. Reproduce all written slide text verbatim. Do not add content or alter its language.
5. Assess whether each slide's content and relationships can be represented cleanly by the supported slots and frontmatter of `auto-default`, `auto-column`, or `auto-image`. For example, `auto-image` gives multiple images a shared height in a row or a shared width in a column. Images whose differing displayed sizes or irregular placement matter, or vector artwork interwoven with text, may need manual placement. Do not force such slides into an automatic arrangement.
6. When an automatic arrangement fits, adapt the slide using only supported slots and frontmatter. Adjust `autofit.alignment` and `image.position`/`image.size` as needed; let the layout control font sizes and spacing. Do not create collages, merge images, rasterize slide content, crop or otherwise modify images to force a fit, split the slide, or add custom layouts, components, HTML, or CSS.
7. When no automatic arrangement fits, or reasonable configuration changes still leave an image or content overflow, use `auto-default` with only its fixed unnamed content and optional `::footer::` slot; do not use `::auto::`. Arrange the content manually as needed, including with HTML/CSS or modified imagery. The restrictions for automatic arrangements do not apply. Keep the result consistent with the template's typography and visual style.
8. Run the development server and verify every converted slide in the in-app browser. Resolve display or fit problems and verify again.
