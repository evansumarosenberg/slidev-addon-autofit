---
theme: default
colorSchema: light
comark: true
---

# Slidev Autofit Addon

A "What You See Is What You Mean" (WYSIWYM) Auto-Layout Framework

---

# Alignment: distributed (top-level list, no footer)

::auto::

- Main and footer content keep their natural height.
- AutoFit receives only the flexible middle track.
- Typography and the full gaps select one shared tier.
- Distributed alignment balances the outer padding and list boundaries.

---

# Distributed top-level list with footer

The fixed footer reduces the auto allocation; the same top-level list semantics are distributed within the smaller remaining region.

::auto::

- Source order does not move a named slot out of its layout track.
- Standalone siblings use full-size semantic boundaries.
- The footer stays anchored to the padded bottom edge.

::footer::

**Fixed footer:** this natural-height region is never scaled by AutoFit.

---

# Nested lists

::auto::

- Nested list items use half-size boundaries at every depth while root siblings remain full-size units.
- Root item one uses top-level spacing.
  - Its child uses a half gap.
    - Deeper nesting still uses a half gap.
  - A sibling child also uses a half gap.
  - A sibling child also uses a half gap.
- Root item two returns to a full boundary.
- Root item three confirms even top-level distribution.
- Root item four confirms even top-level distribution.

---

# Grouped paragraphs under headings

::auto::

## Measurement

The first supporting paragraph stays with its heading.

The second supporting paragraph uses another half gap.

## Communication

This paragraph begins a new heading-associated group.

The final paragraph keeps the visual relationship explicit.

---

# Grouped short sections under headings

::auto::

## First Group

This pattern uses alternating headings and content blocks.

## Second Group

Each group is spaced evenly in the available slide body.

## Third Group

Use this when the slide needs several comparable short sections.

---

# Grouped lists under headings

::auto::

- This is a top-level list
- Items should use full-size gaps

## Authoring

- Prefer ordinary Markdown.
- Reserve native markup for Slidev behavior.

## Verification

- Inspect the selected tier and diagnostics.
- Review the rendered deck before publishing.

---

# Grouped short sections under large headings

::auto::

# First Group

This pattern uses alternating headings and content blocks.

# Second Group

Each group is spaced evenly in the available slide body.

# Third Group

Use this when the slide needs several comparable short sections.


---

# Single grouped heading

::auto::

# First Group

This pattern uses alternating headings and content blocks.

---

# Grouped short sections under tiny headings

::auto::

###### First Group

This pattern uses alternating headings and content blocks.

###### Second Group

Each group is spaced evenly in the available slide body.

###### Third Group

Use this when the slide needs several comparable short sections.

---

# Sparse content selects a large tier

::auto::

## One clear idea

With abundant room, AutoFit searches above the neutral tier and chooses the largest configured size that still fits both axes.

---
autofit:
  alignment: top
---

# Dense wrapped content selects a small tier

::auto::

## A denser explanation

This deliberately wordier example wraps naturally. AutoFit measures the rendered geometry and selects a smaller configured tier without estimating characters or lines.

The fixed title remains at its normal theme size while only this managed content participates in tier selection. The paragraph wraps across the available inline dimension and contributes its actual line boxes to the fit decision.

Typography and numeric line height scale together, preserving the neutral relationship between letters and wrapped lines. The component also scales the semantic gap that connects this paragraph to its heading.

A second supporting point adds enough vertical demand to move below the base tier. The selected value still comes from the discrete configuration rather than continuous interpolation.

The browser checks horizontal and vertical geometry for every candidate. A tier is accepted only when the complete rendered bounds remain within the AutoFit viewport tolerance.

No emergency font size appears below the smallest configured tier. Content that cannot fit there becomes an explicit overflow instead of silently changing the authoring contract.

The semantic classifier also contributes real spacing demand. These consecutive paragraphs stay grouped beneath the heading and use scaled half gaps rather than arbitrary author-positioned offsets.

Candidate tiers are written and measured through the shared scheduler. That implementation detail keeps the result deterministic even when many mounted slides request work in the same animation frame.

Once a smaller tier fits, alignment is applied to the remaining block space. The chosen text, line height, and gaps remain a single coherent presentation instead of a collection of independent adjustments.

---

# Reveal Test 1: supported whole-list wrapper

::auto::

### Used when experiment has a more complex design

<v-clicks depth="2">

- **Normality:** Sampled population is normally distributed
- **Homogeneity:** Equal variances across groups
- **Independence:** Individual samples must be independent

</v-clicks>

---

# Reveal Test 1 Control

::auto::

### Used when experiment has a more complex design

- **Normality:** Sampled population is normally distributed
- **Homogeneity:** Equal variances across groups
- **Independence:** Individual samples must be independent

---

# Reveal Test 2: block-wrapper limitation

This authoring pattern is outside AutoFit's nesting-equivalence guarantee. Slidev may emit ordinary supported sibling lists, which AutoFit does not stitch back into one nested list. Workaround: wrap the complete list in `<v-clicks depth="...">`, or use explicit HTML with one `ul`/`ol` tree and `v-click` on the intended `li`. See [Reveal stability](./README.md#reveal-stability).

::auto::

- Used when experiment has a more complex design

  - **Normality:** Sampled population is normally distributed

  - **Homogeneity:** Equal variances across groups

<v-click>

  - **Independence:** Individual samples must be independent

</v-click>

---

# Reveal Test 2 Control: continuous Markdown list

This continuously authored list documents the intended Markdown nesting for comparison only; matching its geometry is not an AutoFit guarantee for the block-wrapper limitation.

::auto::

- Used when experiment has a more complex design

  - **Normality:** Sampled population is normally distributed

  - **Homogeneity:** Equal variances across groups

  - **Independence:** Individual samples must be independent

---

# Reveal Test 3: block-wrapper limitation

This authoring pattern is outside AutoFit's nesting-equivalence guarantee. Slidev may emit ordinary supported sibling lists, which AutoFit does not stitch back into one nested list. Workaround: wrap the complete list in `<v-clicks depth="...">`, or use explicit HTML with one `ul`/`ol` tree and `v-click` on the intended `li`. See [Reveal stability](./README.md#reveal-stability).

::auto::

- Used when experiment has a more complex design

  - **Normality:** Sampled population is normally distributed

  - **Homogeneity:** Equal variances across groups

<v-clicks>

  - **Independence:** Individual samples must be independent

</v-clicks>

  - **Truthiness:** Samples must be truthy

---

# Reveal Test 3 Control: continuous Markdown list

This continuously authored list documents the intended Markdown nesting for comparison only; matching its geometry is not an AutoFit guarantee for the block-wrapper limitation.

::auto::

- Used when experiment has a more complex design

  - **Normality:** Sampled population is normally distributed

  - **Homogeneity:** Equal variances across groups

  - **Independence:** Individual samples must be independent

  - **Truthiness:** Samples must be truthy

---

# Mixed Markdown and local media

::auto::

Paragraphs, atomic blocks, and a local image coexist in one auto slot.

Text scales with the tier; the image keeps its computed media geometry.

> A blockquote is one atomic unit, so AutoFit preserves its internal theme styling.

```ts
const configuredTiers = { small: 4, large: 4 }
```

| Content | Boundary |
| --- | --- |
| Paragraph | Semantic text unit |
| Quote, code, table | Atomic unit |

![Placeholder image](/images/autofit_placeholder.jpg){width=5%}

---

# Mixed Markdown and local media with reveal

::auto::

<v-clicks>

Paragraphs, atomic blocks, and a local image coexist in one auto slot.

Text scales with the tier; the image keeps its computed media geometry.

> A blockquote is one atomic unit, so AutoFit preserves its internal theme styling.

```ts
const configuredTiers = { small: 4, large: 4 }
```

| Content | Boundary |
| --- | --- |
| Paragraph | Semantic text unit |
| Quote, code, table | Atomic unit |

![Placeholder image](/images/autofit_placeholder.jpg){width=5%}

</v-clicks>

---
autofit:
  alignment: top
---

# Alignment: top

::auto::

## Top edge

Top alignment places all unused block space after the managed content.

This group begins at the start of the AutoFit viewport.

The remaining space stays below it.

---
autofit:
  alignment: middle
---

# Alignment: middle

::auto::

## Balanced space

Middle alignment divides unused block space equally before and after the managed content.

This group sits halfway between the AutoFit viewport edges.

The semantic gap inside the group remains independent of alignment padding.

---
autofit:
  alignment: center
---

# Alignment: center alias

::auto::

## Same geometry as middle

Center is accepted as an author-facing alias; the effective alignment reported by AutoFit is the canonical value middle.

The alias changes neither horizontal positioning nor semantic gap counts.

Both outer padding values remain equal.

---
autofit:
  alignment: bottom
---

# Alignment: bottom

::auto::

## Bottom edge

Bottom alignment places all unused block space before the managed content.

This group finishes at the end of the AutoFit viewport.

Its internal half gap still scales with the selected tier.

A footer can also be included.

---
autofit:
  alignment: bottom
---

# Alignment: bottom with footer

::auto::

## Bottom edge

Bottom alignment places all unused block space before the managed content.

This group finishes at the end of the AutoFit viewport.

Its internal half gap still scales with the selected tier.

::footer::

A footer can also be included.

---

# Additional fixed main content

This first default-slot paragraph remains fixed above AutoFit.

This second default-slot paragraph consumes more natural height, leaving a visibly smaller flexible allocation for the managed list below.

::auto::

- AutoFit never expands the slide to recover fixed-region space.
- Its list still selects a tier and distributes within what remains.
- The footer keeps its own natural height.

::footer::

**Fixed footer:** both fixed regions reduce only the middle auto track.

---
layout: auto-image
---

# Auto-image: centered full-size image

The default center position and `100%` size give this image the complete remaining region.

::image::

![Placeholder image, centered at full size](/images/autofit_placeholder.jpg)

---
layout: auto-image
image:
  position: center
  size: 55%
---

# Auto-image: centered with blank side space

The smaller centered allocation leaves equal blank space on both sides.

::image::

![Placeholder image, centered at a smaller size](/images/autofit_placeholder.jpg)

Short centered caption.

---
layout: auto-image
image:
  position: left
  size: 35%
---

# Auto-image: left with sparse AutoFit

This fixed explanation remains above the flexible image and AutoFit regions.

::image::

![Placeholder image on the left](/images/autofit_placeholder.jpg)

Short left-image caption.

::auto::

- A sparse remainder leaves room for comfortable AutoFit typography.
- The image keeps its authoritative left allocation.

---
layout: auto-image
image:
  position: right
  size: 38%
---

# Auto-image: right with dense AutoFit

The right image and its longer caption reduce the space available to this denser list.

::image::

![Placeholder image on the right](/images/autofit_placeholder.jpg)

This longer caption demonstrates that caption text is fixed content inside the image region and wraps at the region width before the image is fitted.

::auto::

- Compare the evidence with the original question.
- Separate observations from interpretations.
- Record the detail a partner could verify.
- Name an alternative explanation.
- State what new evidence would change the conclusion.
- Keep the next question visible for discussion.

---
layout: auto-image
image:
  position: top
  size: 70%
---

# Auto-image: top position

::image::

![Placeholder image above AutoFit](/images/autofit_placeholder.jpg)

Top image caption.

::auto::

- The AutoFit region occupies the space below the image.
- The region gap remains layout-owned.

---
layout: auto-image
image:
  position: bottom
  size: 60%
---

# Auto-image: bottom position with footer

::auto::

- Bottom placement keeps the image at the lower edge of the remaining region.
- This content is measured in the space above it.

::image::

![Placeholder image below AutoFit](/images/autofit_placeholder.jpg)

Bottom image caption.

::footer::

**Fixed footer:** this text stays at the padded bottom edge.

---
layout: auto-image
image:
  position: left
  size: 30%
---

# Auto-image: declared empty AutoFit slot

An explicitly declared empty `auto` slot mounts AutoFit and reserves the region gap.

::image::

![Placeholder image beside an empty slot](/images/autofit_placeholder.jpg)

::auto::

---
layout: auto-image
image:
  position: right
  size: 100%
---

# Auto-image: full allocation without AutoFit

With no declared `auto` slot, the full image allocation does not reserve an unnecessary gap.

::image::

![Placeholder image without AutoFit](/images/autofit_placeholder.jpg)

---
layout: auto-image
image:
  position: right
  size: 75%
autofit:
  largeTiers: 0
  smallTiers: 0
  alignment: top
---

# Auto-image: constrained AutoFit overflow (intentional)

The image leaves a deliberately small AutoFit remainder. Expect the existing `AUTOFIT OVERFLOW` diagnostic.

::image::

![Placeholder image beside constrained AutoFit](/images/autofit_placeholder.jpg)

::auto::

- Intentional overflow item 01 keeps this list in the review deck.
- Intentional overflow item 02 adds another measured line.
- Intentional overflow item 03 uses the constrained remainder.
- Intentional overflow item 04 remains in authored flow.
- Intentional overflow item 05 makes the small region visibly busy.
- Intentional overflow item 06 demonstrates no emergency fallback size.
- Intentional overflow item 07 is still part of the ordinary Markdown list.
- Intentional overflow item 08 preserves the diagnostic state.
- Intentional overflow item 09 keeps the example unmistakably constrained.
- Intentional overflow item 10 completes the overflow case.

---
layout: auto-image
image:
  position: left
  size: 35%
---

# Auto-image: unsupported linked image (intentional)

Only one direct Markdown image and an optional following caption are supported. The linked image below should report `AUTO IMAGE UNSUPPORTED`.

::image::

[![Linked placeholder image](/images/autofit_placeholder.jpg)](#)

::auto::

- The neighboring AutoFit region remains ordinary Markdown.

---
layout: auto-image
image:
  position: center
  size: 0%
---

# Auto-image: zero image region overflow (intentional)

The managed image has no inline space, so expect `AUTO IMAGE OVERFLOW` while the fixed content remains visible.

::image::

![Placeholder image in a zero-width region](/images/autofit_placeholder.jpg)

---
layout: auto-image
image:
  position: top
  size: 100%
---

# Auto-image: split-geometry overflow (intentional)

The image keeps its full authoritative height while the declared AutoFit slot still requires the region gap. Expect `AUTO IMAGE LAYOUT OVERFLOW`.

::image::

![Placeholder image with no room for the gap](/images/autofit_placeholder.jpg)

::auto::

- This substantive AutoFit content has no remaining height after the full image allocation.

---
layout: auto-image
image:
  position: center
  size: 45%
---

# Auto-image: center with AutoFit content (intentional)

Center mode has no valid AutoFit placement. Substantive `auto` content should report `AUTO IMAGE UNSUPPORTED`.

::image::

![Placeholder image with unsupported center content](/images/autofit_placeholder.jpg)

::auto::

- Center mode cannot place this substantive AutoFit content.

---
layout: auto-image
image:
  position: top
  size: 62%
---

# Auto-image group: top row with adjacent images

This fixed introduction stays above a three-image group while the AutoFit list
uses the remaining region below it.

::image::

![Top-row first placeholder](/images/autofit_placeholder.jpg)

Short caption for the first image.

![Top-row second placeholder without a caption](/images/autofit_placeholder.jpg)

![Top-row third placeholder](/images/autofit_placeholder.jpg)

This longer third caption demonstrates that the adjacent second and third image roots omit the second caption.

::auto::

- The images share one fitted height.
- Their row cells can have different widths.
- Captions use their complete cell widths.

---
layout: auto-image
image:
  position: bottom
  size: 58%
---

# Auto-image group: bottom row without captions

The fixed introduction and footer leave the remaining region for AutoFit and a
captionless image group.

::auto::

- The AutoFit region is above the bottom image row.
- Adjacent image roots make every item captionless.

::image::

![Bottom-row first placeholder](/images/autofit_placeholder.jpg)

![Bottom-row second placeholder](/images/autofit_placeholder.jpg)

::footer::

**Fixed footer:** this optional content reduces the image-and-AutoFit allocation.

---
layout: auto-image
image:
  position: center
  size: 75%
---

# Auto-image group: centered row with captions

Two centered images show the image-only center placement with captions of
different lengths.

::image::

![Centered first placeholder](/images/autofit_placeholder.jpg)

Brief first caption.

![Centered second placeholder](/images/autofit_placeholder.jpg)

This longer second caption wraps within its complete variable-width cell while the two images share one height.

---
layout: auto-image
image:
  position: left
  size: 42%
---

# Auto-image group: left column with captions

This fixed context frames a two-image column beside ordinary AutoFit content.

::image::

![Left-column first placeholder](/images/autofit_placeholder.jpg)

First caption spans the complete image region.

![Left-column second placeholder](/images/autofit_placeholder.jpg)

The second caption is longer, but both column images share one fitted width.

::auto::

- Column captions keep the full image-region width.
- Images preserve their individual aspect ratios.
- Extra height becomes even spacing between items.

---
layout: auto-image
image:
  position: right
  size: 42%
---

# Auto-image group: right column with partial captions

This fixed context frames a three-image column beside a concise AutoFit
summary.

::image::

![Right-column first placeholder](/images/autofit_placeholder.jpg)

First caption remains associated by authored order.

![Right-column second placeholder without a caption](/images/autofit_placeholder.jpg)

![Right-column third placeholder](/images/autofit_placeholder.jpg)

Third caption follows the third image.

::auto::

- A missing caption does not change the item order.
- The right column remains separate from AutoFit.

---
layout: auto-image
---

# Auto image  group: dense row

::image::

![Placeholder image](/images/autofit_placeholder.jpg)

![Placeholder image](/images/autofit_placeholder.jpg)

![Placeholder image](/images/autofit_placeholder.jpg)

Image caption wraps inside container

![Placeholder image](/images/autofit_placeholder.jpg)

![Placeholder image](/images/autofit_placeholder.jpg)

---
layout: auto-image
image:
  position: left
---

# Auto image  group: dense column

::image::

![Placeholder image](/images/autofit_placeholder.jpg)

![Placeholder image](/images/autofit_placeholder.jpg)

![Placeholder image](/images/autofit_placeholder.jpg)

Image caption

![Placeholder image](/images/autofit_placeholder.jpg)

![Placeholder image](/images/autofit_placeholder.jpg)

---
layout: auto-image
---

# Auto-image group: centered row with v-clicks

::image::

<v-clicks>

![Centered first placeholder](/images/autofit_placeholder.jpg)

Brief first caption.

![Centered second placeholder](/images/autofit_placeholder.jpg)

This longer second caption wraps within its complete variable-width cell while the two images share one height.

</v-clicks>

---
layout: auto-image
---

# Auto-image group: centered row with v-click

::image::

<v-click>

![Centered first placeholder](/images/autofit_placeholder.jpg)

Brief first caption.

</v-click>

<v-click>

![Centered second placeholder](/images/autofit_placeholder.jpg)

This longer second caption wraps within its complete variable-width cell while the two images share one height.

</v-click>

---

::footer::

# Footer-only behavior

This slide has no default-slot or auto content. The named footer occupies its natural height at the padded bottom edge, leaving flexible blank space above it.

---

# Empty auto behavior

The named auto slot is mounted and validated, but its semantic content is empty. It deterministically reports tier 0, scale 1, zero gaps, and effective middle alignment.

::auto::

<!-- Intentionally empty named slot: only Slidev's ignored click-gap sentinel remains. -->
<div data-slidev-v-click-gap></div>

---

# Stable v-clicks list reveals

Default v-clicks targets stay in flow. AutoFit measures every item initially, so revealing them changes opacity without changing the selected tier, gaps, or positions.

::auto::

<v-clicks>

- The first point is already part of initial geometry.
- The second point reveals without scheduling a new fit pass.
- The third point keeps the distributed gap plan unchanged.
- The fourth point arrives at its premeasured position.

</v-clicks>

---

# Unsupported: nested-only list item (intentional)

This deliberately malformed HTML list has a nested-only parent item with no leading content. Expect authored neutral content in top flow, no selected tier, and an **AUTOFIT UNSUPPORTED** diagnostic with reason `list-item-missing-leading-content`.

::auto::

<ul>
  <li>
    <ul>
      <li>Nested content remains visible in the neutral fallback.</li>
    </ul>
  </li>
</ul>

---
autofit:
  largeTiers: 0
  smallTiers: 0
  alignment: bottom
---

# Overflow demonstration: vertical AutoFit (intentional)

This slide intentionally exceeds the auto track vertically at its only configured tier. Expect clipping, forced top alignment, a diagnostic-color outline, and an **AUTOFIT OVERFLOW** badge.

::auto::

- Intentional vertical overflow item 01
- Intentional vertical overflow item 02
- Intentional vertical overflow item 03
- Intentional vertical overflow item 04
- Intentional vertical overflow item 05
- Intentional vertical overflow item 06
- Intentional vertical overflow item 07
- Intentional vertical overflow item 08
- Intentional vertical overflow item 09
- Intentional vertical overflow item 10
- Intentional vertical overflow item 11
- Intentional vertical overflow item 12
- Intentional vertical overflow item 13
- Intentional vertical overflow item 14
- Intentional vertical overflow item 15

---
autofit:
  largeTiers: 0
  smallTiers: 0
  alignment: middle
---

# Overflow demonstration: horizontal AutoFit (intentional)

This slide intentionally disables wrapping for one managed text unit. Expect clipping, forced top alignment, and an **AUTOFIT OVERFLOW** badge because the inline geometry cannot fit.

::auto::

<p style="white-space: nowrap">INTENTIONAL_HORIZONTAL_AUTOFIT_OVERFLOW_DEMONSTRATION__THIS_AUTHORED_UNBREAKABLE_LINE_EXTENDS_FAR_BEYOND_THE_AVAILABLE_AUTO_TRACK__NO_EMERGENCY_SCALING_OR_SCROLL_CONTAINER_IS_ADDED</p>

---

# Overflow demonstration: fixed-region layout (intentional)

This slide intentionally puts too much ordinary Markdown in the fixed default slot. There is no auto slot: expect slide-boundary clipping, a diagnostic-color outline, and the distinct **LAYOUT OVERFLOW** badge.

1. Intentional fixed-region line 01
2. Intentional fixed-region line 02
3. Intentional fixed-region line 03
4. Intentional fixed-region line 04
5. Intentional fixed-region line 05
6. Intentional fixed-region line 06
7. Intentional fixed-region line 07
8. Intentional fixed-region line 08
9. Intentional fixed-region line 09
10. Intentional fixed-region line 10
11. Intentional fixed-region line 11
12. Intentional fixed-region line 12
13. Intentional fixed-region line 13
14. Intentional fixed-region line 14
15. Intentional fixed-region line 15
16. Intentional fixed-region line 16
17. Intentional fixed-region line 17
18. Intentional fixed-region line 18

---
layout: auto-column
---

# Auto-column: balanced Markdown lists

Balanced Markdown lists show the default shared tier across two equally sized teaching columns.

::left::

- Frame the question before collecting evidence.
- Name the decision students will make.
- Invite one concise prediction.

::right::

- Share the observation protocol.
- Compare the evidence with the prediction.
- Record one next question.

---
layout: auto-column
autofit:
  alignment: distributed
---

# Auto-column: balanced explanatory paragraphs

Balanced explanatory paragraphs use explicit distributed alignment while each column retains its own measured flow.

::left::

Begin the activity with a concrete classroom scenario. Students can identify the people, evidence, and decision before they encounter formal vocabulary.

Then pause for a short partner explanation. The pause keeps the prompt visible while students establish a shared interpretation.

::right::

Follow with a compact method statement. It tells students which observation matters without turning the slide into a procedural script.

Close by asking what evidence would change their conclusion. That question keeps the discussion tied to the scenario.

---
layout: auto-column
autofit:
  alignment: top
---

# Auto-column: left-dense, right-sparse

A denser left reading column and sparse right summary show why both columns publish the smaller shared tier.

::left::

## Evidence notes

- Compare each group's initial claim with the observation log.
- Mark statements that describe evidence separately from statements that infer a cause.
- Ask whether the sample, timing, or measurement process could explain the pattern.
- Keep the original claim visible while the group revises its explanation.

## Discussion prompt

Which detail would you bring to a skeptical audience first, and why?

::right::

## Summary

- Claim
- Evidence
- Revision

---
layout: auto-column
autofit:
  alignment: bottom
---

# Auto-column: left-sparse, right-dense

A sparse left summary waits for the dense right evidence column so both sides retain one coordinated scale.

::left::

## Quick check

- What changed?
- What stayed stable?

::right::

## Evidence walk

- Identify the baseline observation before the intervention.
- Describe the first result in language a community partner could verify.
- Compare the result with the original expectation rather than a new expectation.
- Separate a surprising measurement from a meaningful change in the underlying system.
- State one limitation that should travel with the conclusion.

---
layout: auto-column
---

# Auto-column: nested discussion lists

Nested Markdown lists preserve discussion hierarchy while the columns still share one coordinated presentation.

::left::

- Prepare the discussion
  - Read the scenario silently.
  - Underline the available evidence.
  - Name an assumption.
- Facilitate the exchange
  - Invite a claim.
  - Request supporting evidence.

::right::

- Listen for reasoning
  - Distinguish description from explanation.
  - Notice when a participant revises a claim.
- Close the loop
  - Summarize the strongest evidence.
  - Record the next investigation.

---
layout: auto-column
---

# Auto-column: grouped teaching sections

Grouped Markdown sections keep headings with their supporting material in two independently measured columns.

::left::

## Before class

Post the question and provide a two-minute quiet read.

## During class

Ask groups to annotate one claim and one piece of evidence.

::right::

## After class

Collect a short reflection that names one unresolved question.

## Next meeting

Use the reflections to select a contrasting case.

---
layout: auto-column
---

# Auto-column: ordered steps and checklist

Ordered preparation steps and a Markdown checklist demonstrate distinct but realistic instructional structures.

::left::

1. Introduce the community question.
2. Model how to annotate one source.
3. Give teams time to compare annotations.
4. Gather one claim from each team.

::right::

- [ ] Scenario is visible.
- [ ] Evidence source is linked.
- [ ] Discussion roles are assigned.
- [ ] Exit prompt is ready.

---
layout: auto-column
---

# Auto-column: blockquotes and code

A quoted design principle and fenced implementation notes demonstrate atomic Markdown blocks in the paired layout.

::left::
> “Make the evidence visible before asking learners to defend a conclusion.”

Use the quotation as a facilitation reminder: students need shared access to the material they will discuss.

::right::

```ts
const discussionPlan = {
  prompt: 'What evidence supports this claim?',
  waitTimeSeconds: 30,
}
```

Keep the implementation note short enough to support the teaching decision rather than replace it.

---
layout: auto-column
autofit:
  alignment: middle
---

# Auto-column: table and local media

A Markdown comparison table and local University mark demonstrate mixed table and media content without authored HTML.

::left::

| Facilitation move | Student purpose |
| --- | --- |
| Silent read | Notice details |
| Partner talk | Test an interpretation |
| Whole-group share | Compare evidence |

::right::

![Placeholder image](/images/autofit_placeholder.jpg){width=40%}

Use the local mark as a compact visual anchor beside the planning table.

---
layout: auto-column
---

# Auto-column: default shared behavior

Default configuration lets both columns search privately and publish the verified smaller shared tier together.

::left::

- Private search measures this column.
- Shared publication waits for its partner.

::right::

- Private search measures this column.
- Shared publication releases both results.

---
layout: auto-column
autofit:
  alignment: distributed
---

# Auto-column: fitted coordinated starting lines

This eligible distributed pair keeps its selected source fixed while the target shares authoritative semantic gaps and aligns its first rendered line. The different opening typography and semantic-boundary counts make the coordinated start position visible without authored spacing.

::left::

## Evidence prompt

What evidence would make you reconsider the claim?

## Partner pause

Invite each partner to name one detail.

Record the detail before comparing explanations.

::right::

Begin with the observation that each group can verify.

Then ask partners to compare their observations before they name a conclusion.

## Share

Compare the details before naming a conclusion.

## Reflect

Write one question for the next source.

---
layout: auto-column
autofit:
  alignment: top
---

# Auto-column: top alignment

Top alignment keeps concise content at the start of each independently measured column.

::left::

Short left prompt for a think-pair-share activity.

::right::

Short right prompt for an evidence check.

---
layout: auto-column
autofit:
  alignment: bottom
---

# Auto-column: bottom alignment

Bottom alignment keeps concise content at the lower edge of each independently measured column.

::left::

Conclude with the most useful left-column observation.

::right::

Conclude with the most useful right-column observation.

---
layout: auto-column
autofit:
  largeTiers: 0
  smallTiers: 2
  tierIncrement: 15
  alignment: top
---

# Auto-column: custom dense small tiers

Custom dense small tiers demonstrate a constrained, shared scale search for a detailed comparison.

::left::

## Evidence review protocol

- Identify the claim before deciding whether the source uses evidence or interpretation.
- Mark an observation that makes the claim independently checkable for a partner.
- Note an alternative explanation related to timing, sampling, or collection method.
- Compare the observation log with the original prediction before revising it.
- Prepare one follow-up question that clarifies a missing detail without assuming an answer.
- Select the detail that a skeptical audience should see before accepting the conclusion.

::right::

## Discussion synthesis protocol

- Compare the groups' evidence tables before discussing a conclusion with a partner.
- Ask which measurement is most sensitive to the collection method in this case.
- Record an uncertainty that remains after the comparison and the evidence needed next.
- Choose a next source that could reduce uncertainty while preserving the question.
- Draft a concise claim that separates the strongest evidence from the inference.
- Plan how the presenter will invite a challenge and return to the evidence table.

---
layout: auto-column
---

# Auto-column: additional fixed content

Additional fixed default-slot context reduces only the remaining paired column allocation.

This fixed paragraph gives learners a shared scenario before the two measured columns present their different roles.

::left::

- Facilitator prompt
- Evidence cue
- Time check

::right::

- Student role
- Partner response
- Reflection note

---
layout: auto-column
---

# Auto-column: fixed content and footer

Fixed context and a fixed footer reduce only the remaining paired column allocation.

Use the title and this fixed explanation to frame the evidence review before learners move to the two columns.

::left::

- Read the scenario.
- Mark one observation.

::right::

- Compare interpretations.
- Prepare a revision.

::footer::

**Facilitation note:** reserve one minute for the exit reflection.

---
layout: auto-column
---

# Auto-column: omitted left column

The omitted left column remains an empty half-width allocation while the right column keeps its track.

::right::

- The right track stays half width.
- The column pair keeps its fixed gap.
- The empty left track still participates in coordination.

---
layout: auto-column
---

# Auto-column: omitted right column

The omitted right column remains an empty half-width allocation while the left column keeps its track.

::left::

- The left track stays half width.
- The column pair keeps its fixed gap.
- The empty right track still participates in coordination.

---
layout: auto-column
autofit:
  alignment: top
---

# Auto-column reveal: left v-click, top alignment

A left-column v-click reveal advances in flow without changing the coordinated tier, scale, or geometry.

::left::

- This line should be visible.

<v-click>

- Evidence prompt stays in flow.

</v-click>

::right::

- Partner notes stay visible.
- Shared scale stays fixed.

---
layout: auto-column
autofit:
  alignment: bottom
---

# Auto-column reveal: right v-clicks

A right-column v-clicks sequence advances in flow without changing the coordinated tier, scale, or geometry.

::left::

- Partner notes stay visible.
- Shared scale stays fixed.

::right::

<v-clicks>

- Evidence prompt
- Compare notes
- Reflection

</v-clicks>

---
layout: auto-column
---

# Auto-column reveal: both columns (1)

Both columns reveal together while their coordinated presentation remains stable through every click.

::left::

This line should be visible.

<v-click>

Left evidence stays in flow.

</v-click>

::right::

- This line should be visible.

<v-click>

- Right evidence stays in flow.

</v-click>

---
layout: auto-column
---

# Auto-column reveal: asymmetric columns

Asymmetric left and right reveal counts retain one coordinated scale and stable premeasured geometry.

::left::

<v-clicks>

- Left context
- Left evidence
- Left reflection

</v-clicks>

::right::

<v-click>

Right synthesis stays in flow.

</v-click>

---
layout: auto-column
autofit:
  largeTiers: 0
  smallTiers: 4
  tierIncrement: 10
  alignment: distributed
---

# Overflow demonstration: coordinated auto-column start alignment (intentional)

This intentional Markdown-authored right target needs more vertical movement than its distributed outer-padding budget permits to align its first rendered line with the fixed source. Only the target shows **AUTOFIT OVERFLOW**; the healthy source remains fitted with the shared tier and coordinated semantic gaps.

::left::

- Compare the baseline observation with the first field note from the neighborhood study.
- Explain how the collection method shaped the measurement before interpreting the difference.
- Identify the strongest competing explanation raised during the community listening session.
- Record the source, date, and observer for every reported value in the evidence log.
- Distinguish a missing observation from an observation that contradicts the working claim.
- Ask which participants were not represented in the sample and how that absence matters.
- Translate the numerical trend into language that a family advisory group can question.
- Mark the revision that would be required if the next measurement reverses the pattern.
- Prepare a transparent summary that names both the result and its remaining uncertainty.
- Plan a follow-up observation that could help the class choose between the two explanations.
- Share the draft conclusion with a partner who did not collect the original data.
- Capture the partner's question before finalizing the presentation for the next class.

::right::

Begin with the field note that the group can verify before it interprets the
pattern.

Then compare the observation with the original prediction and name one
alternative explanation.

- Identify the collection detail that could change the measurement.
- Separate the reported value from the conclusion it might support.
- Record the question a skeptical family advisory group would ask first.
- State the new evidence that would revise the working claim.
- Choose the next source the class should examine before making a final recommendation.

---
layout: auto-column
---

# Unsupported: auto-column left fallback (intentional)

This intentional unsupported left column uses its authored neutral fallback and **AUTOFIT UNSUPPORTED** diagnostic while the right column remains independently fitted.

::left::

<ul><li><ul><li>Nested-only content triggers the documented fallback.</li></ul></li></ul>

::right::

The healthy right column remains a normal fitted result.

