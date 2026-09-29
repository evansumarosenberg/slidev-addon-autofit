---
theme: ../..
title: AutoFit browser fixture
defaults:
  layout: auto-default
autofit:
  largeTiers: -1
  unexpected: ignored-without-auto
---

# Main-only baseline

<div data-testid="main-only">The default slot stays at its normal top position.</div>

---

# Auto then footer

<div data-testid="auto-footer-order">Main region</div>

::auto::

<div data-testid="auto-content">Auto region</div>

::footer::

<div data-testid="footer-content">Footer region</div>

---

# Footer then auto

<div data-testid="footer-auto-order">Main region</div>

::footer::

<div data-testid="reverse-footer-content">Footer region</div>

::auto::

<div data-testid="reverse-auto-content">Auto region</div>

---

# Additional fixed main content

<div data-testid="additional-main">Main region</div>

<div style="height: 96px">Additional fixed-height main content</div>

::auto::

<div>Auto region</div>

::footer::

<div>Footer region</div>

---

::footer::

<div data-testid="footer-only">Footer-only region</div>

---

# Semantically empty auto

<div data-testid="empty-auto-slide">Main region</div>

::auto::

<!-- whitespace, comments, and Slidev sentinels are semantically empty -->
<div data-slidev-v-click-gap></div>

---
autofit:
  largeTiers: 2
  smallTiers: 1
  tierIncrement: 25
  alignment: center
---

# Valid configuration

<div data-testid="valid-config-slide">Main region</div>

::auto::

<p>Neutral structural content</p>

---
autofit:
  largeTiers: -1
  alignment: bottom
---

# Invalid configuration A

<div data-testid="invalid-config-a">Main region</div>

::auto::

<p data-testid="invalid-config-content">Configuration falls back completely.</p>

---

# Warning separator A

<div data-testid="warning-separator-a">No auto slot.</div>

---

# Warning separator B

<div data-testid="warning-separator-b">No auto slot.</div>

---
autofit:
  tierIncrement: 0
  alignment: top
---

# Invalid configuration B

<div data-testid="invalid-config-b">Main region</div>

::auto::

<p>Distinct invalid configuration.</p>

---

# Layout overflow transitions

<div data-testid="layout-transition-slide">Main region</div>
<div data-testid="layout-overflow-probe" style="height: 1px; width: 1px"></div>

::auto::

<p>Auto region</p>

::footer::

<div>Footer region</div>

---

# Overflow separator

<div data-testid="overflow-separator">No intentional overflow.</div>

---

# Intentional vertical layout overflow

<div data-testid="vertical-layout-overflow" style="height: 800px">Oversized fixed main region</div>

::auto::

<p>Auto receives a zero-height track.</p>

---

# Intentional horizontal layout overflow

<div data-testid="horizontal-layout-overflow" style="width: 1200px; white-space: nowrap">Oversized fixed-width main region</div>

---

# Auto without footer

<div data-testid="auto-only-slide">Natural-height main region</div>

::auto::

<div data-testid="auto-only-content">Auto reaches the padded bottom edge.</div>

---
autofit:
  smallTiers: -1
  alignment: bottom
---

# Invalid configuration with empty auto

<div data-testid="invalid-empty-auto-slide">Main region</div>

::auto::

<div data-slidev-v-click-gap></div>

---
autofit:
  largeTiers: -1
  alignment: top
---

# Direct reusable AutoFit

<div data-testid="direct-autofit-slide">Main region with a standalone component.</div>

<AutoFit
  data-testid="direct-autofit"
  :large-tiers="2"
  :small-tiers="1"
  :tier-increment="15"
  alignment="center"
>
  <p>Direct AutoFit content</p>
</AutoFit>

::auto::

<p data-testid="layout-managed-auto">The layout-managed instance consumes invalid frontmatter.</p>

---

<h1 data-testid="fixed-main-h1">Fixed main h1</h1>
<h6 data-testid="fixed-main-h6">Fixed main h6</h6>

::footer::

<h1 data-testid="fixed-footer-h1">Fixed footer h1</h1>
<h6 data-testid="fixed-footer-h6">Fixed footer h6</h6>

---

<div data-testid="auto-heading-slide">Fixed main content</div>

::auto::

<h1 data-testid="auto-h1">Neutral auto h1</h1>
<h6 data-testid="auto-h6">Neutral auto h6</h6>

---

# Every default tier

<div style="display: grid; grid-template-columns: repeat(3, 180px); gap: 8px">
  <AutoFit data-testid="tier-4" style="width: 180px; height: 170px" alignment="top">
    <p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
  </AutoFit>
  <AutoFit data-testid="tier-3" style="width: 180px; height: 154px" alignment="top">
    <p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
  </AutoFit>
  <AutoFit data-testid="tier-2" style="width: 180px; height: 144px" alignment="top">
    <p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
  </AutoFit>
  <AutoFit data-testid="tier-1" style="width: 180px; height: 133px" alignment="top">
    <p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
  </AutoFit>
  <AutoFit data-testid="tier-0" style="width: 180px; height: 122px" alignment="top">
    <p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
  </AutoFit>
  <AutoFit data-testid="tier--1" style="width: 180px; height: 112px" alignment="top">
    <p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
  </AutoFit>
  <AutoFit data-testid="tier--2" style="width: 180px; height: 101px" alignment="top">
    <p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
  </AutoFit>
  <AutoFit data-testid="tier--3" style="width: 180px; height: 90px" alignment="top">
    <p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
  </AutoFit>
  <AutoFit data-testid="tier--4" style="width: 180px; height: 80px" alignment="top">
    <p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
  </AutoFit>
</div>

<div style="display: grid; grid-template-columns: repeat(3, 170px); gap: 12px; margin-top: 8px">
  <AutoFit
    data-testid="distributed-positive-tier"
    style="width: 170px; height: 150px; --slidev-autofit-base-spacing: 8px"
    :large-tiers="2"
    :small-tiers="0"
    alignment="distributed"
  >
    <p data-visual-unit="text" style="font-size: 12px; line-height: 16px">Positive one</p>
    <p data-visual-unit="text" data-gap-kind="full" style="font-size: 12px; line-height: 16px">Positive two</p>
  </AutoFit>

  <AutoFit
    data-testid="distributed-negative-tier"
    style="width: 170px; height: 105px; --slidev-autofit-base-spacing: 8px"
    :large-tiers="0"
    :small-tiers="4"
    alignment="distributed"
  >
    <p data-visual-unit="text" style="font-size: 30px; line-height: 36px">A</p>
    <p data-visual-unit="text" data-gap-kind="full" style="font-size: 30px; line-height: 36px; position: relative; top: 20px">B</p>
    <p data-visual-unit="text" data-gap-kind="full" style="font-size: 30px; line-height: 36px">C</p>
  </AutoFit>

  <AutoFit
    data-testid="distributed-mixed-media"
    style="width: 170px; height: 150px; --slidev-autofit-base-spacing: 8px"
    :large-tiers="0"
    :small-tiers="0"
    alignment="distributed"
  >
    <p data-visual-unit="text" style="font-size: 10px; line-height: 14px">
      Mixed
      <img
        alt=""
        width="12"
        height="20"
        src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='20'%3E%3Crect width='12' height='20' fill='black'/%3E%3C/svg%3E"
      >
    </p>
    <p data-visual-unit="media" data-gap-kind="full">
      <img
        alt=""
        width="18"
        height="18"
        src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18'%3E%3Ccircle cx='9' cy='9' r='9' fill='black'/%3E%3C/svg%3E"
      >
    </p>
    <blockquote data-visual-unit="atomic" data-gap-kind="full" style="padding: 2px">
      <p style="margin: 0">Atomic</p>
    </blockquote>
  </AutoFit>
</div>

---

# Custom and zero-side tiers

<div style="display: grid; grid-template-columns: repeat(3, 220px); gap: 16px">
  <AutoFit
    data-testid="custom-tier"
    style="width: 220px; height: 150px"
    :large-tiers="2"
    :small-tiers="1"
    :tier-increment="25"
    alignment="top"
  >
    <p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
  </AutoFit>
  <AutoFit
    data-testid="zero-large"
    style="width: 220px; height: 130px"
    :large-tiers="0"
    :small-tiers="2"
    alignment="top"
  >
    <p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
  </AutoFit>
  <AutoFit
    data-testid="zero-small"
    style="width: 220px; height: 90px"
    :large-tiers="2"
    :small-tiers="0"
    alignment="bottom"
  >
    <p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
  </AutoFit>
</div>

---

# Both-axis and fixed-media overflow

<div style="display: grid; grid-template-columns: repeat(4, 180px); gap: 12px">
  <AutoFit data-testid="dense-overflow" style="width: 180px; height: 60px" alignment="middle">
    <p style="font-size: 24px; line-height: 30px">
      Dense wrapping copy remains far taller than this viewport even at the smallest supported tier.
    </p>
  </AutoFit>
  <AutoFit data-testid="code-overflow" style="width: 180px; height: 100px" alignment="top">
    <pre data-testid="wide-code" style="font-size: 24px; line-height: 30px; white-space: pre">const_unbreakable_identifier_is_far_too_wide_for_the_viewport = true</pre>
  </AutoFit>
  <AutoFit data-testid="table-overflow" style="width: 180px; height: 100px" alignment="top">
    <table data-testid="wide-table" style="font-size: 24px; line-height: 30px; white-space: nowrap">
      <tbody><tr><td>unbreakable_table_cell_that_cannot_fit_the_viewport</td></tr></tbody>
    </table>
  </AutoFit>
  <AutoFit data-testid="media-overflow" style="width: 180px; height: 100px" alignment="bottom">
    <p><img data-testid="fixed-media" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='160'%3E%3Crect width='300' height='160' fill='%237a0019'/%3E%3C/svg%3E" style="width: 300px; height: 160px; max-width: none !important" /></p>
  </AutoFit>
</div>

---

# Non-distributed alignment

<div style="display: grid; grid-template-columns: repeat(4, 180px); gap: 12px">
  <AutoFit data-testid="align-top" style="width: 180px; height: 120px" alignment="top">
    <p data-testid="align-top-copy" style="font-size: 20px; line-height: 30px">Copy</p>
  </AutoFit>
  <AutoFit data-testid="align-middle" style="width: 180px; height: 120px" alignment="middle">
    <p data-testid="align-middle-copy" style="font-size: 20px; line-height: 30px">Copy</p>
  </AutoFit>
  <AutoFit data-testid="align-center" style="width: 180px; height: 120px" alignment="center">
    <p data-testid="align-center-copy" style="font-size: 20px; line-height: 30px">Copy</p>
  </AutoFit>
  <AutoFit data-testid="align-bottom" style="width: 180px; height: 120px" alignment="bottom">
    <p data-testid="align-bottom-copy" style="font-size: 20px; line-height: 30px">Copy</p>
  </AutoFit>
</div>

---

# Semantic gaps and margin carriers

<AutoFit data-testid="semantic-fit" style="width: 760px; height: 430px" alignment="top">
  <p data-testid="opening-copy" style="font-size: 16px; line-height: 20px">Standalone-list introduction.</p>
  <ul data-testid="root-gap-list">
    <li data-testid="root-first-item">
      Root point
      <ul data-testid="nested-gap-list">
        <li data-testid="nested-first-item">Nested point one</li>
        <li>Nested point two</li>
      </ul>
    </li>
    <li>Root point two</li>
  </ul>
  <h2 data-testid="group-heading" style="font-size: 20px; line-height: 24px">Grouped topic</h2>
  <p data-testid="group-copy" style="font-size: 16px; line-height: 20px">Grouped explanation.</p>
  <blockquote><p>Atomic quotation.</p></blockquote>
  <p>Paragraph after the atomic reset.</p>
  <pre><code>const semantic = true</code></pre>
  <table><tbody><tr><td>Atomic table</td></tr></tbody></table>
</AutoFit>

---

# AutoFit overflow transitions

<AutoFit data-testid="overflow-transition" style="width: 200px; height: 90px" alignment="bottom">
  <p
    data-testid="overflow-transition-copy"
    style="font-size: 100px; line-height: 90px; white-space: nowrap"
  >I</p>
</AutoFit>

---

# Distributed list and text structures

<div style="display: grid; grid-template-columns: repeat(4, 170px); gap: 12px">
  <AutoFit
    data-testid="distributed-standalone"
    style="width: 170px; height: 180px; --slidev-autofit-base-spacing: 8px"
    :large-tiers="0"
    :small-tiers="0"
    alignment="distributed"
  >
    <ul data-testid="distributed-standalone-list" style="font-size: 12px; line-height: 18px">
      <li data-visual-unit="text">Standalone one</li>
      <li data-visual-unit="text" data-gap-kind="full" data-testid="distributed-standalone-second">Standalone two</li>
      <li data-visual-unit="text" data-gap-kind="full" data-testid="distributed-standalone-third">Standalone three</li>
    </ul>
  </AutoFit>

  <AutoFit
    data-testid="distributed-heading-list"
    style="width: 170px; height: 180px; --slidev-autofit-base-spacing: 8px"
    :large-tiers="0"
    :small-tiers="0"
    alignment="distributed"
  >
    <h2 data-visual-unit="text" data-testid="distributed-heading-list-title" style="font-size: 14px; line-height: 18px">Heading</h2>
    <ul data-testid="distributed-heading-list-carrier" style="font-size: 12px; line-height: 18px">
      <li data-visual-unit="text" data-gap-kind="half">Nested one</li>
      <li data-visual-unit="text" data-gap-kind="half" data-testid="distributed-heading-list-second">Nested two</li>
    </ul>
  </AutoFit>

  <AutoFit
    data-testid="distributed-deep-list"
    style="width: 170px; height: 180px; --slidev-autofit-base-spacing: 8px"
    :large-tiers="0"
    :small-tiers="0"
    alignment="distributed"
  >
    <ul data-testid="distributed-deep-root" style="font-size: 10px; line-height: 14px">
      <li data-visual-unit="text">
        Root one
        <ul data-testid="distributed-deep-level-two">
          <li data-visual-unit="text" data-gap-kind="half">
            Level two one
            <ul data-testid="distributed-deep-level-three">
              <li data-visual-unit="text" data-gap-kind="half">Level three one</li>
              <li data-visual-unit="text" data-gap-kind="half" data-testid="distributed-deep-level-three-second">Level three two</li>
            </ul>
          </li>
          <li data-visual-unit="text" data-gap-kind="half" data-testid="distributed-deep-level-two-second">Level two two</li>
        </ul>
      </li>
      <li data-visual-unit="text" data-gap-kind="full" data-testid="distributed-deep-root-second">Root two</li>
    </ul>
  </AutoFit>

  <AutoFit
    data-testid="distributed-grouped-paragraphs"
    style="width: 170px; height: 180px; --slidev-autofit-base-spacing: 8px"
    :large-tiers="0"
    :small-tiers="0"
    alignment="distributed"
  >
    <h2 data-visual-unit="text" style="font-size: 12px; line-height: 16px">First topic</h2>
    <p data-visual-unit="text" data-gap-kind="half" data-testid="distributed-grouped-copy-one" style="font-size: 10px; line-height: 16px">First explanation.</p>
    <p data-visual-unit="text" data-gap-kind="half" data-testid="distributed-grouped-copy-two" style="font-size: 10px; line-height: 16px">Second explanation.</p>
    <h2 data-visual-unit="text" data-gap-kind="full" data-testid="distributed-grouped-second-heading" style="font-size: 12px; line-height: 16px">Second topic</h2>
    <p data-visual-unit="text" data-gap-kind="half" data-testid="distributed-grouped-copy-three" style="font-size: 10px; line-height: 16px">Third explanation.</p>
  </AutoFit>
</div>

---

# Distributed atomic and unequal structures

<div style="display: grid; grid-template-columns: repeat(4, 170px); gap: 12px">
  <AutoFit
    data-testid="distributed-grouped-lists"
    style="width: 170px; height: 180px; --slidev-autofit-base-spacing: 8px"
    :large-tiers="0"
    :small-tiers="0"
    alignment="distributed"
  >
    <h2 data-visual-unit="text" style="font-size: 12px; line-height: 16px">Grouped list</h2>
    <ul data-testid="distributed-grouped-list-one" style="font-size: 10px; line-height: 14px">
      <li data-visual-unit="text" data-gap-kind="half">First point</li>
      <li data-visual-unit="text" data-gap-kind="half" data-testid="distributed-grouped-list-one-second">Second point</li>
    </ul>
    <ul data-testid="distributed-grouped-list-two" style="font-size: 10px; line-height: 14px">
      <li data-visual-unit="text" data-gap-kind="half">Third point</li>
      <li data-visual-unit="text" data-gap-kind="half" data-testid="distributed-grouped-list-two-second">Fourth point</li>
    </ul>
  </AutoFit>

  <AutoFit
    data-testid="distributed-atomic"
    style="width: 170px; height: 180px; --slidev-autofit-base-spacing: 8px"
    :large-tiers="0"
    :small-tiers="0"
    alignment="distributed"
  >
    <p data-visual-unit="text" style="font-size: 10px; line-height: 14px">Opening copy.</p>
    <blockquote data-visual-unit="atomic" data-gap-kind="full" data-testid="distributed-atomic-quote" style="font-size: 10px; line-height: 14px; padding: 2px">
      <p style="margin: 0">Quotation.</p>
    </blockquote>
    <pre data-visual-unit="atomic" data-gap-kind="full" data-testid="distributed-atomic-code" style="font-size: 9px; line-height: 12px; padding: 2px"><code>const x = 1</code></pre>
    <table data-visual-unit="atomic" data-gap-kind="full" data-testid="distributed-atomic-table" style="font-size: 9px; line-height: 12px"><tbody><tr><td>Table</td></tr></tbody></table>
  </AutoFit>

  <AutoFit
    data-testid="distributed-single"
    style="width: 170px; height: 180px; --slidev-autofit-base-spacing: 8px"
    :large-tiers="0"
    :small-tiers="0"
    alignment="distributed"
  >
    <p data-visual-unit="text" data-testid="distributed-single-copy" style="font-size: 12px; line-height: 20px">One semantic unit.</p>
  </AutoFit>

  <AutoFit
    data-testid="distributed-unequal"
    style="width: 170px; height: 180px; --slidev-autofit-base-spacing: 8px"
    :large-tiers="0"
    :small-tiers="0"
    alignment="distributed"
  >
    <p data-visual-unit="text" style="font-size: 10px; line-height: 12px">Short.</p>
    <p data-visual-unit="text" data-gap-kind="full" data-testid="distributed-unequal-tall" style="font-size: 10px; line-height: 18px">A deliberately taller semantic unit that wraps over several lines in this narrow viewport.</p>
    <p data-visual-unit="text" data-gap-kind="full" data-testid="distributed-unequal-last" style="font-size: 10px; line-height: 12px">Short again.</p>
  </AutoFit>
</div>

---

# Distributed v-clicks list identity

<AutoFit
  data-testid="distributed-v-clicks"
  style="width: 320px; height: 240px; --slidev-autofit-base-spacing: 8px"
  :large-tiers="0"
  :small-tiers="0"
  alignment="distributed"
>
  <v-clicks>
    <ul data-testid="distributed-v-clicks-list" style="font-size: 14px; line-height: 20px">
      <li data-visual-unit="text" data-testid="distributed-v-clicks-one">Reveal one</li>
      <li data-visual-unit="text" data-gap-kind="full" data-testid="distributed-v-clicks-two">Reveal two</li>
      <li data-visual-unit="text" data-gap-kind="full" data-testid="distributed-v-clicks-three">Reveal three</li>
    </ul>
  </v-clicks>
</AutoFit>

---

# Distributed threshold

<div style="display: flex; gap: 24px">
  <AutoFit
    data-testid="distributed-threshold"
    style="width: 200px; height: 44px; --slidev-autofit-base-spacing: 0px"
    :large-tiers="0"
    :small-tiers="0"
    alignment="distributed"
  >
    <p style="font-size: 20px; line-height: 40px">Threshold</p>
  </AutoFit>

  <AutoFit
    data-testid="distributed-above-threshold"
    style="width: 200px; height: 45px; --slidev-autofit-base-spacing: 0px"
    :large-tiers="0"
    :small-tiers="0"
    alignment="distributed"
  >
    <p style="font-size: 20px; line-height: 40px">Distributed</p>
  </AutoFit>
</div>

---

# Distributed final-verification fallback

<AutoFit
  data-testid="distributed-final-fallback"
  style="width: 240px; height: 180px; --slidev-autofit-base-spacing: 2px"
  :large-tiers="0"
  :small-tiers="0"
  alignment="distributed"
>
  <h2 data-visual-unit="text" style="font-size: 12px; line-height: 20px">Grouped fallback</h2>
  <p
    data-visual-unit="text"
    data-gap-kind="half"
    data-testid="distributed-final-fallback-list"
    style="font-size: 10px; line-height: 18px"
  >Grouped copy</p>
  <blockquote
    data-visual-unit="atomic"
    data-gap-kind="full"
    data-testid="distributed-final-fallback-atomic"
    style="padding: 2px; font-size: 10px; line-height: 18px"
  ><p style="margin: 0">atomic reset</p></blockquote>
</AutoFit>

---

# Reactive lifecycle harness

<AutofitLifecycleHarness />

---

# Hidden AutoFit deferral

<div data-testid="hidden-autofit-host" style="display: none">
  <AutoFit
    data-testid="hidden-autofit"
    style="width: 220px; height: 120px"
    alignment="top"
  >
    <p style="font-size: 80px; line-height: 90px; white-space: nowrap">I</p>
  </AutoFit>
</div>

---

# Reveal stability and best effort

<AutoFit
  data-testid="reveal-autofit"
  style="width: 360px; height: 300px; --slidev-autofit-base-spacing: 8px"
  :large-tiers="0"
  :small-tiers="2"
  alignment="distributed"
>
  <p v-click data-testid="single-reveal" style="font-size: 16px; line-height: 22px">
    Single reveal
  </p>
  <v-clicks>
    <ul style="font-size: 16px; line-height: 22px">
      <li data-testid="multi-reveal-one">Multi reveal one</li>
      <li data-testid="multi-reveal-two">Multi reveal two</li>
    </ul>
  </v-clicks>
  <p
    data-testid="geometry-removing-reveal"
    style="font-size: 16px; line-height: 22px"
  >
    Best-effort geometry removal
  </p>
</AutoFit>

---

# Reactive DOM, media, fonts, and styles

<style>
.autofit-class-context {
  --slidev-autofit-base-spacing: 8px;
}

.autofit-class-context [data-testid="class-context-copy"],
.autofit-class-context [data-testid="class-context-second"] {
  font-size: 10px;
  line-height: 12px;
}

.autofit-class-context--large [data-testid="class-context-copy"],
.autofit-class-context--large [data-testid="class-context-second"] {
  font-size: 20px;
  line-height: 24px;
}

.autofit-class-context--spaced {
  --slidev-autofit-base-spacing: 24px;
}
</style>

<div data-testid="reactive-dom-slide" style="display: grid; grid-template-columns: repeat(4, 210px); gap: 16px">
  <AutoFit
    data-testid="text-reactive"
    style="width: 210px; height: 110px"
    :large-tiers="0"
    :small-tiers="4"
    alignment="top"
  >
    <p data-testid="text-reactive-copy" style="font-size: 24px; line-height: 30px">
      Short copy.
    </p>
  </AutoFit>

  <AutoFit
    data-testid="media-reactive"
    style="width: 180px; height: 100px"
    :large-tiers="0"
    :small-tiers="0"
    alignment="top"
  >
    <p>
      <img
        data-testid="media-reactive-image"
        src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3Crect width='20' height='20' fill='%237a0019'/%3E%3C/svg%3E"
        style="width: 20px; height: 20px; max-width: none !important"
      />
    </p>
  </AutoFit>

  <AutoFit
    data-testid="theme-reactive"
    style="width: 210px; height: 100px"
    alignment="top"
  >
    <p
      class="autofit-reactive-theme-copy"
      data-testid="theme-reactive-copy"
      style="font-size: 20px; line-height: 24px"
    >
      Theme recapture
    </p>
  </AutoFit>

  <AutoFit
    data-testid="spacing-reactive"
    style="width: 210px; height: 180px; --slidev-autofit-base-spacing: 8px"
    :large-tiers="4"
    :small-tiers="0"
    alignment="top"
  >
    <p data-testid="spacing-reactive-copy" style="font-size: 10px; line-height: 12px">
      First unit.
    </p>
    <p data-testid="spacing-reactive-second" style="font-size: 10px; line-height: 12px">
      Second unit.
    </p>
  </AutoFit>

  <div class="autofit-class-context" data-testid="class-context">
    <AutoFit
      data-testid="class-context-reactive"
      style="width: 210px; height: 180px"
      :large-tiers="4"
      :small-tiers="0"
      alignment="top"
    >
      <p data-testid="class-context-copy">
        Class context first unit.
      </p>
      <p data-testid="class-context-second">
        Class context second unit.
      </p>
    </AutoFit>
  </div>
</div>

---

# Isolated unmount cleanup

<AutofitUnmountHarness />

---

# Empty-to-content fitting

<AutofitEmptyTransitionHarness />

---

# Visual gap compensation cases

<div data-testid="visual-gap-cases" style="display: grid; grid-template-columns: repeat(3, 240px); gap: 12px">
  <AutoFit
    data-testid="visual-neutral"
    style="width: 240px; height: 260px; --slidev-autofit-base-spacing: 16px"
    :large-tiers="0"
    :small-tiers="0"
    alignment="top"
  >
    <p data-visual-unit="text" style="font-size: 18px; line-height: 80px">First</p>
    <p data-visual-unit="text" data-gap-kind="full" style="font-size: 12px; line-height: 50px">Second</p>
    <blockquote data-visual-unit="atomic" data-gap-kind="full" style="padding: 7px">
      <p style="margin: 0">Atomic</p>
    </blockquote>
    <p data-visual-unit="text" data-gap-kind="full" style="font-size: 16px; line-height: 34px">Last</p>
  </AutoFit>
  <AutoFit
    data-testid="visual-positive"
    style="width: 240px; height: 360px; --slidev-autofit-base-spacing: 16px"
    :large-tiers="2"
    :small-tiers="0"
    alignment="top"
  >
    <h2 data-visual-unit="text" style="font-size: 16px; line-height: 30px">Heading</h2>
    <p data-visual-unit="text" data-gap-kind="half" style="font-size: 12px; line-height: 28px">Grouped copy</p>
    <p data-visual-unit="text" data-gap-kind="half" style="font-size: 10px; line-height: 14px">Grouped copy two</p>
    <blockquote data-visual-unit="atomic" data-gap-kind="full" style="padding: 4px">
      <p style="margin: 0">Positive atomic</p>
    </blockquote>
  </AutoFit>
  <AutoFit
    data-testid="visual-negative"
    style="width: 240px; height: 70px; --slidev-autofit-base-spacing: 16px"
    :large-tiers="0"
    :small-tiers="4"
    alignment="top"
  >
    <h2 data-visual-unit="text" style="font-size: 36px; line-height: 44px">A</h2>
    <p data-visual-unit="text" data-gap-kind="half" style="font-size: 36px; line-height: 44px">B</p>
    <h2 data-visual-unit="text" data-gap-kind="full" style="font-size: 36px; line-height: 44px">C</h2>
    <p data-visual-unit="text" data-gap-kind="half" style="font-size: 36px; line-height: 44px">D</p>
  </AutoFit>
  <AutoFit
    data-testid="visual-nested"
    style="width: 240px; height: 300px; font-family: Arial, sans-serif; --slidev-autofit-base-spacing: 16px"
    :large-tiers="0"
    :small-tiers="0"
    alignment="top"
  >
    <ul>
      <li data-visual-unit="text">Root first</li>
      <li data-visual-unit="text" data-gap-kind="full">
        Root parent
        <ul>
          <li data-visual-unit="text" data-gap-kind="half">Nested first</li>
          <li data-visual-unit="text" data-gap-kind="half">Nested sibling</li>
        </ul>
      </li>
      <li data-visual-unit="text" data-gap-kind="full">Root sibling</li>
    </ul>
  </AutoFit>
  <AutoFit
    data-testid="visual-mixed"
    style="width: 240px; height: 360px; font-family: Arial, sans-serif; --slidev-autofit-base-spacing: 16px"
    :large-tiers="0"
    :small-tiers="0"
    alignment="top"
  >
    <p data-visual-unit="text">
      Mixed text
      <img
        alt=""
        width="12"
        height="40"
        style="position: relative; top: 100px; vertical-align: middle"
        src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='40'%3E%3Crect width='12' height='40' fill='black'/%3E%3C/svg%3E"
      >
      tail
    </p>
    <p data-visual-unit="media" data-gap-kind="full">
      <img
        alt=""
        width="18"
        height="18"
        src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18'%3E%3Ccircle cx='9' cy='9' r='9' fill='black'/%3E%3C/svg%3E"
      >
    </p>
    <blockquote data-testid="visual-transparent-atomic" data-visual-unit="atomic" data-gap-kind="full" style="padding: 9px; border: 0; background: transparent">
      <p style="margin: 0">Transparent atomic</p>
    </blockquote>
    <p data-visual-unit="text" data-gap-kind="full">After transparent</p>
    <table data-testid="visual-boxed-atomic" data-visual-unit="atomic" data-gap-kind="full" style="border: 4px solid black">
      <tbody><tr><td>Boxed atomic</td></tr></tbody>
    </table>
    <p data-visual-unit="text" data-gap-kind="full">After boxed</p>
  </AutoFit>
</div>

---

# Unsupported state harness

<AutofitUnsupportedHarness />

---

# Unsupported diagnostic separator

<div data-testid="unsupported-separator">No unsupported content.</div>

---

# Fixed overflow and unsupported precedence

<div style="height: 800px">Fixed content forces layout overflow.</div>

::auto::

<ul>
  <li data-testid="fixed-overflow-unsupported">
    <ul><li>Nested-only item</li></ul>
  </li>
</ul>

---

# Stable presentation topology

<AutofitTopologyHarness />

---

# Transition-safe reveal probes

<div style="display: grid; grid-template-columns: repeat(2, 260px); gap: 24px">
  <AutoFit
    data-testid="root-v-click-autofit"
    style="width: 260px; height: 112px; --slidev-autofit-base-spacing: 12px"
    :large-tiers="0"
    :small-tiers="4"
    alignment="bottom"
  >
    <v-click>
      <div
        data-testid="root-v-click-target"
        style="transition: all 370ms linear"
      >
        <p
          data-testid="root-v-click-first"
          style="font-size: 38px; line-height: 44px; transition: all 370ms linear"
        >
          Root reveal first
        </p>
        <p
          data-testid="root-v-click-second"
          style="font-size: 38px; line-height: 44px; transition: all 370ms linear"
        >
          Root reveal second
        </p>
      </div>
    </v-click>
  </AutoFit>

  <AutoFit
    data-testid="whole-list-v-clicks-autofit"
    style="width: 260px; height: 132px; --slidev-autofit-base-spacing: 12px"
    :large-tiers="0"
    :small-tiers="4"
    alignment="distributed"
  >
    <v-clicks>
      <ul
        data-testid="whole-list-v-clicks-list"
        style="font-size: 34px; line-height: 40px; transition: all 370ms linear"
      >
        <li data-testid="whole-list-v-clicks-one" style="transition: all 370ms linear">List reveal one</li>
        <li data-testid="whole-list-v-clicks-two" style="transition: all 370ms linear">List reveal two</li>
        <li data-testid="whole-list-v-clicks-three" style="transition: all 370ms linear">List reveal three</li>
      </ul>
    </v-clicks>
  </AutoFit>
</div>

---

# Reveal probe invalidation

<style>
.autofit-reveal-typography.slidev-vclick-current,
.autofit-reveal-typography.slidev-vclick-prior {
  font-size: 30px !important;
  line-height: 36px !important;
}

.autofit-reveal-geometry.slidev-vclick-current,
.autofit-reveal-geometry.slidev-vclick-prior {
  position: relative;
  inset-inline-start: 24px;
}
</style>

<div style="display: grid; grid-template-columns: repeat(3, 220px); gap: 16px">
  <AutoFit
    data-testid="probe-failure-autofit"
    style="width: 220px; height: 76px; --slidev-autofit-base-spacing: 10px"
    :large-tiers="0"
    :small-tiers="3"
    alignment="bottom"
  >
    <p
      data-testid="probe-failure-target"
      style="font-size: 30px; line-height: 36px; transition: all 410ms ease-in"
    >
      Failure first
    </p>
    <p
      data-testid="probe-failure-second"
      style="font-size: 30px; line-height: 36px; transition: all 410ms ease-in"
    >
      Failure second
    </p>
  </AutoFit>

  <AutoFit
    data-testid="typography-reveal-autofit"
    style="width: 220px; height: 150px"
    :large-tiers="0"
    :small-tiers="3"
    alignment="top"
  >
    <p
      v-click
      class="autofit-reveal-typography"
      data-testid="typography-reveal-target"
      style="font-size: 16px; line-height: 22px"
    >
      Typography reveal
    </p>
    <p style="font-size: 16px; line-height: 22px">Second unit</p>
  </AutoFit>

  <AutoFit
    data-testid="geometry-reveal-autofit"
    style="width: 220px; height: 150px"
    :large-tiers="0"
    :small-tiers="3"
    alignment="top"
  >
    <p
      v-click
      class="autofit-reveal-geometry"
      data-testid="geometry-reveal-target"
      style="font-size: 20px; line-height: 26px"
    >
      Geometry reveal
    </p>
    <p style="font-size: 20px; line-height: 26px">Second unit</p>
  </AutoFit>
</div>

---

# Accepted split-list reveal DOM

<div data-testid="split-list-reveal-slide">
  The block click intentionally interrupts indented Markdown list source.
</div>

::auto::

- Parent before

  - Nested before

<v-click>

  - Accepted block click

</v-click>

  - Emitted sibling list

---

# Positive-tier heading cap

<AutoFit
  data-testid="heading-cap-positive"
  style="width: 600px; height: 300px; --slidev-autofit-base-spacing: 8px"
  :large-tiers="4"
  :small-tiers="0"
  alignment="top"
>
  <h2
    data-testid="heading-cap-heading"
    style="font-size: 30px; line-height: 36px"
  >
    Capped heading
    <span
      data-testid="heading-cap-inline"
      style="font-size: 12px; line-height: 18px"
    >inline detail</span>
  </h2>
  <p
    data-testid="heading-cap-body"
    style="font-size: 20px; line-height: 30px"
  >
    Ordinary body copy grows with the selected global tier.
  </p>
</AutoFit>

---

# AutoFit heading optical scope

<div data-testid="heading-optical-scope" style="display: flex; gap: 16px">
  <AutoFit
    data-testid="direct-heading-ltr"
    style="width: 220px; height: 120px; direction: ltr"
    alignment="top"
  >
    <h1 data-testid="direct-heading-ltr-h1">Direct LTR h1</h1>
    <h6 data-testid="direct-heading-ltr-h6">Direct LTR h6</h6>
  </AutoFit>
  <AutoFit
    data-testid="direct-heading-rtl"
    style="width: 220px; height: 120px; direction: rtl"
    alignment="top"
  >
    <h1 data-testid="direct-heading-rtl-h1">Direct RTL h1</h1>
    <h6 data-testid="direct-heading-rtl-h6">Direct RTL h6</h6>
  </AutoFit>
</div>

::auto::

<div style="direction: ltr">
  <h1 data-testid="managed-heading-ltr-h1">Managed LTR h1</h1>
  <h6 data-testid="managed-heading-ltr-h6">Managed LTR h6</h6>
</div>
<div style="direction: rtl">
  <h1 data-testid="managed-heading-rtl-h1">Managed RTL h1</h1>
  <h6 data-testid="managed-heading-rtl-h6">Managed RTL h6</h6>
</div>

---

# Formatted heading equivalence

<div
  data-testid="formatted-heading-matrix"
  style="display: grid; grid-template-columns: repeat(4, 180px); gap: 8px"
>
  <AutoFit data-testid="formatted-h1-direct" style="width: 180px; height: 80px" alignment="top">
    <h1 data-testid="formatted-h1-direct-heading">Alpha</h1>
  </AutoFit>
  <AutoFit data-testid="formatted-h1-strong" style="width: 180px; height: 80px" alignment="top">
    <h1><strong data-testid="formatted-h1-strong-inline">Alpha</strong></h1>
  </AutoFit>
  <AutoFit data-testid="formatted-h1-link" style="width: 180px; height: 80px" alignment="top">
    <h1><a data-testid="formatted-h1-link-inline" href="#formatted-heading-equivalence">Alpha</a></h1>
  </AutoFit>
  <AutoFit data-testid="formatted-h1-code" style="width: 180px; height: 80px" alignment="top">
    <h1><code data-testid="formatted-h1-code-inline">Alpha</code></h1>
  </AutoFit>
  <AutoFit data-testid="formatted-h1-span" style="width: 180px; height: 80px" alignment="top">
    <h1><span data-testid="formatted-h1-span-inline">Alpha</span></h1>
  </AutoFit>
  <AutoFit data-testid="formatted-h1-reveal" style="width: 180px; height: 80px" alignment="top">
    <h1><span v-click data-testid="formatted-h1-reveal-inline">Alpha</span></h1>
  </AutoFit>
  <AutoFit data-testid="formatted-h1-inline-block" style="width: 180px; height: 80px" alignment="top">
    <h1><span v-click data-testid="formatted-h1-inline-block-box" style="display: inline-block">Alpha</span></h1>
  </AutoFit>
  <AutoFit data-testid="formatted-h6-direct" style="width: 180px; height: 80px" alignment="top">
    <h6>Alpha</h6>
  </AutoFit>
  <AutoFit data-testid="formatted-h6-strong" style="width: 180px; height: 80px" alignment="top">
    <h6><strong data-testid="formatted-h6-strong-inline">Alpha</strong></h6>
  </AutoFit>
  <AutoFit data-testid="formatted-h6-link" style="width: 180px; height: 80px" alignment="top">
    <h6><a data-testid="formatted-h6-link-inline" href="#formatted-heading-equivalence">Alpha</a></h6>
  </AutoFit>
  <AutoFit data-testid="formatted-h6-code" style="width: 180px; height: 80px" alignment="top">
    <h6><code data-testid="formatted-h6-code-inline">Alpha</code></h6>
  </AutoFit>
  <AutoFit data-testid="formatted-h6-span" style="width: 180px; height: 80px" alignment="top">
    <h6><span data-testid="formatted-h6-span-inline">Alpha</span></h6>
  </AutoFit>
  <AutoFit data-testid="formatted-h6-reveal" style="width: 180px; height: 80px" alignment="top">
    <h6><span v-click data-testid="formatted-h6-reveal-inline">Alpha</span></h6>
  </AutoFit>
  <AutoFit data-testid="formatted-h6-inline-block" style="width: 180px; height: 80px" alignment="top">
    <h6><span v-click data-testid="formatted-h6-inline-block-box" style="display: inline-block">Alpha</span></h6>
  </AutoFit>
</div>

---

# Authored heading geometry

<div
  data-testid="authored-heading-geometry"
  style="display: grid; grid-template-columns: repeat(4, 180px); gap: 12px"
>
  <AutoFit data-testid="authored-heading-margin" style="width: 180px; height: 80px" alignment="top">
    <h1
      data-testid="authored-heading-margin-root"
      style="margin-inline-start: -220px"
    >Margin</h1>
  </AutoFit>
  <AutoFit data-testid="nested-negative-margin" style="width: 180px; height: 80px" alignment="top">
    <h1><span
      data-testid="nested-negative-margin-inline"
      style="margin-left: -220px"
    >Nested</span></h1>
  </AutoFit>
  <AutoFit data-testid="negative-indent-direct" style="width: 180px; height: 80px" alignment="top">
    <h1
      data-testid="negative-indent-direct-heading"
      style="text-indent: -80px"
    >Indent</h1>
  </AutoFit>
  <AutoFit data-testid="negative-indent-inline" style="width: 180px; height: 80px" alignment="top">
    <h1
      data-testid="negative-indent-inline-heading"
      style="text-indent: -80px"
    ><span data-testid="negative-indent-inline-span">Indent</span></h1>
  </AutoFit>
  <AutoFit data-testid="negative-indent-independent" style="width: 180px; height: 80px" alignment="top">
    <h1 style="text-indent: -220px"><span
      data-testid="negative-indent-independent-box"
      style="display: inline-block"
    >Indent</span></h1>
  </AutoFit>
  <AutoFit data-testid="positioned-heading-control" style="width: 180px; height: 80px" alignment="top">
    <h1><span
      data-testid="positioned-heading-control-inline"
      style="position: relative; left: -220px"
    >Positioned</span></h1>
  </AutoFit>
  <AutoFit data-testid="transformed-heading-control" style="width: 180px; height: 80px" alignment="top">
    <h1><span
      data-testid="transformed-heading-control-inline"
      style="display: inline-block; transform: translateX(-220px)"
    >Transformed</span></h1>
  </AutoFit>
  <AutoFit data-testid="oversized-heading-control" style="width: 180px; height: 80px" alignment="top">
    <h1><span
      data-testid="oversized-heading-control-box"
      style="display: inline-block; width: 400px"
    >Oversized</span></h1>
  </AutoFit>
</div>

---

# Coordinated static left-first harness

<AutofitCoordinationHarness :left-dense="false" />

---

# Coordinated static right-first harness

<AutofitCoordinationHarness :left-dense="true" />

---

# Coordinated balanced fit harness

<AutofitCoordinationHarness mode="balanced" />

---

# Coordinated one-sided overflow harness

<AutofitCoordinationHarness mode="one-overflow" />

---

# Coordinated two-sided overflow harness

<AutofitCoordinationHarness mode="two-overflow" />

---

# Coordinated empty plus managed harness

<AutofitCoordinationHarness mode="empty-managed" />

---

# Coordinated both empty harness

<AutofitCoordinationHarness mode="both-empty" />

---

# Coordinated unsupported plus fit harness

<AutofitCoordinationHarness mode="unsupported-fit" />

---

# Coordinated unsupported plus overflow harness

<AutofitCoordinationHarness mode="unsupported-overflow" />

---

# Coordinated unsupported plus empty harness

<AutofitCoordinationHarness mode="unsupported-empty" />

---

# Coordinated unsupported pair harness

<AutofitCoordinationHarness mode="unsupported-unsupported" />

---

# Coordinated fit plus unsupported harness

<AutofitCoordinationHarness mode="fit-unsupported" />

---

# Coordinated overflow plus unsupported harness

<AutofitCoordinationHarness mode="overflow-unsupported" />

---

# Coordinated empty plus unsupported harness

<AutofitCoordinationHarness mode="empty-unsupported" />

---

# Coordinated semantic distribution harness

<AutofitCoordinationHarness mode="semantic" />

---

# Coordinated unbalanced fitted harness

<AutofitCoordinationHarness mode="unbalanced-both-fit" />

---

# Coordinated managed plus right empty harness

<AutofitCoordinationHarness mode="managed-empty" />

---

# Coordinated left empty plus overflow harness

<AutofitCoordinationHarness mode="empty-overflow" />

---

# Coordinated overflow plus right empty harness

<AutofitCoordinationHarness mode="overflow-empty" />

---

# Coordinated distributed overflow harness

<AutofitCoordinationHarness mode="semantic-overflow" />

---

# Coordinated reactive epoch

<AutofitCoordinationHarness mode="reactive" />

---
layout: auto-column
autofit:
  largeTiers: 0
  smallTiers: 4
  tierIncrement: 10
  alignment: top
---

# Auto-column geometry

<div data-testid="auto-column-geometry">Fixed main</div>

::right::

<p style="font-size: 28px; line-height: 34px">Right column</p>

::footer::

<div>Fixed footer</div>

::left::

<p style="font-size: 28px; line-height: 34px">Left column</p>

---
layout: auto-column
autofit:
  largeTiers: 2
  smallTiers: 1
  tierIncrement: 25
  alignment: center
---

# Auto-column valid configuration

<div data-testid="auto-column-valid-config">Configuration is shared.</div>

::left::

<p>Left</p>

::right::

<p>Right</p>

---
layout: auto-column
autofit:
  smallTiers: -1
  alignment: top
---

# Auto-column invalid configuration

<div data-testid="auto-column-invalid-config">Invalid configuration falls back for both roles.</div>

::left::

<p>Left</p>

::right::

<p>Right</p>

---
layout: auto-column
autofit:
  largeTiers: 0
  smallTiers: 4
  tierIncrement: 10
  alignment: top
---

# Auto-column unbalanced shared tier

<div data-testid="auto-column-unbalanced">Both columns publish the smaller verified tier.</div>

::left::

<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>

::right::

<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>

---
layout: auto-column
---

# Auto-column omitted right

<div data-testid="auto-column-omitted">The omitted right slot keeps its half-width track.</div>

::left::

<p>Left only</p>

---
layout: auto-column
autofit:
  largeTiers: 0
  smallTiers: 4
  tierIncrement: 10
  alignment: top
---

# Auto-column localized overflow

<div data-testid="auto-column-column-overflow">Column overflow stays local.</div>

::left::

<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>

::right::

<p style="font-size: 28px; line-height: 34px">Right fits.</p>

---
layout: auto-column
---

# Auto-column fixed vertical overflow

<div data-testid="auto-column-fixed-vertical" style="height: 800px">Fixed main overflows vertically.</div>

::left::

<ul><li><ul><li>Nested-only unsupported left</li></ul></li></ul>

::right::

<p style="font-size: 100px; line-height: 500px; white-space: nowrap">I</p>

---
layout: auto-column
---

# Auto-column fixed horizontal overflow

<div data-testid="auto-column-fixed-horizontal" style="width: 1200px; white-space: nowrap">Fixed main overflows horizontally.</div>

::left::

<ul><li><ul><li>Nested-only unsupported left</li></ul></li></ul>

::right::

<p>Right column</p>

---
layout: auto-column
---

# Auto-column optical offsets

<div data-testid="auto-column-optical-offsets">Fixed optical-offset region.</div>

<h1 data-testid="auto-column-fixed-h1">Fixed h1</h1>

::left::

<h1 data-testid="auto-column-left-h1">Left h1</h1>

::right::

<h6 data-testid="auto-column-right-h6">Right h6</h6>

---
layout: auto-column
autofit:
  alignment: bottom
---

# Auto-column partial configuration

<div data-testid="auto-column-partial-config">Partial configuration shares defaults and alignment.</div>

::left::

<p>Left</p>

::right::

<p>Right</p>

---
layout: auto-column
---

# Auto-column default balanced pair

<div data-testid="auto-column-default-config">Default configuration balances identical columns.</div>

::left::

<p>Left</p>

::right::

<p>Right</p>

---
layout: auto-column
---

# Auto-column additional fixed content

<div data-testid="auto-column-additional-fixed">Fixed main</div>
<div style="height: 96px">Additional fixed-height content.</div>

::left::

<p>Left</p>

::right::

<p>Right</p>

::footer::

<div>Fixed footer</div>

---
layout: auto-column
---

# Auto-column both empty

<div data-testid="auto-column-empty">Both columns are semantically empty.</div>

---
layout: auto-column
---

# Auto-column unsupported fallback

<div data-testid="auto-column-unsupported">Unsupported stays localized beside a managed role.</div>

::left::

<ul><li><ul><li>Nested-only unsupported left</li></ul></li></ul>

::right::

<p>Right fits.</p>

---
layout: auto-column
autofit:
  largeTiers: 4
  smallTiers: 0
  tierIncrement: 10
  alignment: distributed
---

# Auto-column equivalent geometry

<div data-testid="auto-column-equivalent-geometry">Equivalent fixed main</div>

::left::

<p style="font-size: 28px; line-height: 34px">Equivalent measured content</p>

::right::

<p style="font-size: 28px; line-height: 34px">Equivalent measured content</p>

::footer::

<div>Equivalent fixed footer</div>

---
layout: auto-column
autofit:
  largeTiers: 2
  smallTiers: 0
  tierIncrement: 25
  alignment: center
---

# Auto-column custom sparse dense configuration

<div data-testid="auto-column-config-custom">Sparse and dense columns share custom configuration.</div>

::left::

<p style="font-size: 32px; line-height: 38px">Sparse content</p>

::right::

<p style="font-size: 32px; line-height: 38px">Dense one</p>
<p style="font-size: 32px; line-height: 38px">Dense two</p>
<p style="font-size: 32px; line-height: 38px">Dense three</p>
<p style="font-size: 32px; line-height: 38px">Dense four</p>

---
layout: auto-column
---

# Auto-column default sparse dense configuration

<div data-testid="auto-column-config-default">Sparse and dense columns share default configuration.</div>

::left::

<p style="font-size: 32px; line-height: 38px">Sparse content</p>

::right::

<p style="font-size: 32px; line-height: 38px">Dense one</p>
<p style="font-size: 32px; line-height: 38px">Dense two</p>
<p style="font-size: 32px; line-height: 38px">Dense three</p>
<p style="font-size: 32px; line-height: 38px">Dense four</p>

---
layout: auto-column
autofit:
  alignment: bottom
---

# Auto-column partial sparse dense configuration

<div data-testid="auto-column-config-partial">Partial configuration retains default tiers and increment.</div>

::left::

<p style="font-size: 32px; line-height: 38px">Sparse content</p>

::right::

<p style="font-size: 32px; line-height: 38px">Dense one</p>
<p style="font-size: 32px; line-height: 38px">Dense two</p>
<p style="font-size: 32px; line-height: 38px">Dense three</p>
<p style="font-size: 32px; line-height: 38px">Dense four</p>

---
layout: auto-column
autofit:
  largeTiers: invalid
  smallTiers: 0
  tierIncrement: 25
  alignment: center
---

# Auto-column invalid sparse dense configuration

<div data-testid="auto-column-config-invalid">Invalid complete configuration uses the default contract.</div>

::left::

<p style="font-size: 32px; line-height: 38px">Sparse content</p>

::right::

<p style="font-size: 32px; line-height: 38px">Dense one</p>
<p style="font-size: 32px; line-height: 38px">Dense two</p>
<p style="font-size: 32px; line-height: 38px">Dense three</p>
<p style="font-size: 32px; line-height: 38px">Dense four</p>

---
layout: auto-column
autofit:
  largeTiers: 0
  smallTiers: 4
  tierIncrement: 10
  alignment: top
---

# Auto-column held left completion

<div data-testid="auto-column-held-left-first">The sparse left search completes before the dense right search.</div>

::left::

<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>

::right::

<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>

---
layout: auto-column
autofit:
  largeTiers: 0
  smallTiers: 4
  tierIncrement: 10
  alignment: top
---

# Auto-column held right completion

<div data-testid="auto-column-held-right-first">The sparse right search completes before the dense left search.</div>

::left::

<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>

::right::

<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>

---
layout: auto-column
---

# Auto-column omitted voting behavior

<div data-testid="auto-column-omitted-vote">The omitted right column remains empty and non-voting.</div>

::left::

<p>Only the left column votes.</p>

---
layout: auto-column
---

# Auto-column both-empty tier zero

<div data-testid="auto-column-both-empty-tier-zero">Both empty columns resolve at the neutral tier.</div>

---
layout: auto-column
autofit:
  largeTiers: 0
  smallTiers: 4
  tierIncrement: 10
  alignment: top
---

# Auto-column one-sided overflow

<div data-testid="auto-column-one-sided-overflow">Only the left column overflows.</div>

::left::

<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>

::right::

<p>Healthy right column</p>

---
layout: auto-column
autofit:
  largeTiers: 0
  smallTiers: 4
  tierIncrement: 10
  alignment: top
---

# Auto-column two-sided overflow

<div data-testid="auto-column-two-sided-overflow">Both columns overflow at the smallest tier.</div>

::left::

<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>

::right::

<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>
<p style="font-size: 100px; line-height: 100px; white-space: nowrap">I</p>

---
layout: auto-default
autofit:
  largeTiers: 4
  smallTiers: 0
  tierIncrement: 10
  alignment: distributed
---

# Default equivalent geometry

<div data-testid="default-equivalent-geometry">Equivalent fixed main</div>

::auto::

<p style="font-size: 28px; line-height: 34px">Equivalent measured content</p>

::footer::

<div>Equivalent fixed footer</div>

---
layout: auto-column
---

# Auto-column unsupported terminal

<div data-testid="auto-column-unsupported-terminal">Unsupported content uses neutral fallback beside a healthy column.</div>

::left::

<ul><li><ul><li>Nested unsupported left</li></ul></li></ul>

::right::

<p>Healthy right column</p>

---
layout: auto-column
---

# Auto-column fixed vertical precedence

<div data-testid="auto-column-fixed-vertical-precedence" style="height: 800px">Fixed vertical overflow</div>

::left::

<ul><li><ul><li>Nested unsupported left</li></ul></li></ul>

::right::

<p style="font-size: 100px; line-height: 500px; white-space: nowrap">I</p>

---
layout: auto-column
---

# Auto-column fixed horizontal precedence

<div data-testid="auto-column-fixed-horizontal-precedence" style="width: 1200px; white-space: nowrap">Fixed horizontal overflow</div>

::left::

<ul><li><ul><li>Nested unsupported left</li></ul></li></ul>

::right::

<p style="font-size: 100px; line-height: 500px; white-space: nowrap">I</p>

---
layout: auto-column
---

# Auto-column optical equivalent

<div data-testid="auto-column-optical-equivalent">Fixed main optical offsets.</div>
<h1 data-testid="auto-column-main-h1">Main h1</h1>
<h6 data-testid="auto-column-main-h6">Main h6</h6>

::left::

<h1 data-testid="auto-column-left-h1">Left h1</h1>
<h6 data-testid="auto-column-left-h6">Left h6</h6>

::right::

<h1 data-testid="auto-column-right-h1">Right h1</h1>
<h6 data-testid="auto-column-right-h6">Right h6</h6>

::footer::

<h1 data-testid="auto-column-footer-h1">Footer h1</h1>
<h6 data-testid="auto-column-footer-h6">Footer h6</h6>

---
layout: auto-default
---

# Default optical equivalent

<div data-testid="default-optical-equivalent">Fixed main optical offsets.</div>
<h1 data-testid="default-main-h1">Main h1</h1>
<h6 data-testid="default-main-h6">Main h6</h6>

::auto::

<h1>Managed h1</h1>
<h6>Managed h6</h6>

::footer::

<h1 data-testid="default-footer-h1">Footer h1</h1>
<h6 data-testid="default-footer-h6">Footer h6</h6>

---
layout: auto-column
autofit:
  alignment: distributed
---

# Auto-column reveal stability fixture

<p data-testid="auto-column-reveal-stability">This fixture exercises in-flow Slidev reveals through one coordinated pair.</p>

::left::

<v-click>
  <p data-testid="auto-column-reveal-paragraph" style="transition: all 370ms linear">A non-list reveal target remains in flow.</p>
</v-click>

::right::

<v-clicks>
  <ul style="transition: all 370ms linear">
    <li data-testid="auto-column-reveal-list-one" style="transition: all 370ms linear">First list reveal keeps its marker in the target.</li>
    <li data-testid="auto-column-reveal-list-two" style="transition: all 370ms linear">Second list reveal keeps its marker in the target.</li>
  </ul>
</v-clicks>

---

# AutoImage component harness

<AutoImageHarness />

---
layout: auto-image
image:
  position: left
  size: 35%
---

::auto::

<p data-testid="auto-image-left-auto">Auto content</p>

::footer::

<div data-testid="auto-image-left-footer">Fixed footer</div>

::image::

![Auto image left](../../public/images/autofit_placeholder.jpg)

<div data-testid="auto-image-left-main">Fixed main</div>

---
layout: auto-image
image:
  position: center
  size: 50%
autofit:
  smallTiers: -1
---

<div data-testid="auto-image-center">Centered image</div>

::image::

![Auto image center](../../public/images/autofit_placeholder.jpg)

---
layout: auto-image
image:
  position: right
  size: 45%
---

<div data-testid="auto-image-right-main">Right image</div>

::image::

![Auto image right](../../public/images/autofit_placeholder.jpg)

::auto::

<p>Right remainder</p>

---
layout: auto-image
image:
  position: top
  size: 40%
---

<div data-testid="auto-image-top">Top image</div>

::image::

![Auto image top](../../public/images/autofit_placeholder.jpg)

::auto::

<p>Top remainder</p>

---
layout: auto-image
image:
  position: bottom
  size: 40%
---

<div data-testid="auto-image-bottom">Bottom image</div>

::auto::

<p>Bottom remainder</p>

::image::

![Auto image bottom](../../public/images/autofit_placeholder.jpg)

---
layout: auto-image
image:
  position: left
  size: 100%
---

<div data-testid="auto-image-omitted">No auto slot</div>

::image::

![Auto image omitted auto](../../public/images/autofit_placeholder.jpg)

---
layout: auto-image
image:
  position: center
  size: 40%
---

<div data-testid="auto-image-center-content">Center content</div>

::image::

![Auto image center content](../../public/images/autofit_placeholder.jpg)

::auto::

<p data-testid="center-auto-content">Substantive center auto content</p>

::footer::

<p data-testid="center-footer-content">Fixed center footer</p>

---
layout: auto-image
image:
  position: left
  size: 30%
---

<div data-testid="auto-image-empty">Explicitly empty auto</div>

::image::

![Auto image empty auto](../../public/images/autofit_placeholder.jpg)

::auto::

<!-- declared but semantically empty -->


---
layout: auto-image
image:
  position: sideways
  size: 40px
  extra: true
---

<div data-testid="auto-image-invalid-main">Invalid image configuration</div>

::image::

![Invalid configuration image](../../public/images/autofit_placeholder.jpg)

::auto::

<p>Must not mount</p>

::footer::

<div data-testid="auto-image-invalid-footer">Invalid footer remains</div>

---
layout: auto-image
image:
  position: right
  size: 30%
autofit:
  largeTiers: 4
  smallTiers: -1
  tierIncrement: 10
  alignment: top
---

<div data-testid="auto-image-raw-config">Raw config bridge</div>

::image::

![Auto image raw config](../../public/images/autofit_placeholder.jpg)

::auto::

<p>Invalid AutoFit configuration</p>

---
layout: auto-image
image:
  position: top
  size: 100%
---

<div data-testid="auto-image-split-overflow">Declared auto receives no height after the authoritative image allocation.</div>

::image::

![Auto image split overflow](../../public/images/autofit_placeholder.jpg)

::auto::

<p>Zero-height AutoFit track</p>

---
layout: auto-image
image:
  position: left
  size: 25%
---

<div data-testid="auto-image-unsupported-main">Unsupported authored image content remains in flow.</div>

::image::

<p data-testid="auto-image-authored-fallback">No image here</p>

::auto::

<p>Healthy auto content</p>

---
layout: auto-image
image:
  position: center
  size: 75%
---

<div data-testid="auto-image-center-empty">Empty declared center auto</div>

::image::

![Auto image center empty](../../public/images/autofit_placeholder.jpg)

::auto::

<!-- declared but semantically empty -->
---
layout: auto-image
image:
  position: right
  size: 30%
---

<h1 data-testid="auto-image-shell-h1">Fixed main heading</h1>

::image::

![Auto image shell](../../public/images/autofit_placeholder.jpg)

::auto::

<p data-testid="auto-image-shell-auto">Shell auto content</p>

::footer::

<h6 data-testid="auto-image-shell-h6">Fixed footer heading</h6>

---
layout: auto-image
image:
  position: top
  size: 35%
---

<div data-testid="auto-image-fixed-overflow-main" style="height: 1000px">Fixed main overflow</div>

::image::

<p data-testid="auto-image-fixed-overflow-image">No image in the image slot</p>

::auto::

unsupported auto text

::footer::

<div data-testid="auto-image-fixed-overflow-footer" style="height: 160px">Fixed footer overflow</div>

---
layout: auto-image
image:
  position: center
  size: 50%
---

<div data-testid="auto-image-center-whitespace">Whitespace center auto</div>

::image::

![Center whitespace image](../../public/images/autofit_placeholder.jpg)

::auto::

&nbsp;

---
layout: auto-image
image:
  position: center
  size: 50%
---

<div data-testid="auto-image-center-comment">Comment center auto</div>

::image::

![Center comment image](../../public/images/autofit_placeholder.jpg)

::auto::

<!-- comment-only center auto -->

---
layout: auto-image
image:
  position: center
  size: 50%
---

<div data-testid="auto-image-center-sentinel">Sentinel center auto</div>

::image::

![Center sentinel image](../../public/images/autofit_placeholder.jpg)

::auto::

<div data-slidev-v-click-gap></div>

---
layout: auto-image
image:
  position: center
  size: 50%
---

<div data-testid="auto-image-center-component-empty">Component-empty center auto</div>

::image::

![Center component-empty image](../../public/images/autofit_placeholder.jpg)

::auto::

<AutoImageSemanticEmpty />

---
layout: auto-image
image:
  position: center
  size: 50%
---

<div data-testid="auto-image-center-reveal-hidden">Reveal-hidden center auto</div>

::image::

![Center reveal-hidden image](../../public/images/autofit_placeholder.jpg)

::auto::

<p v-click data-testid="center-reveal-hidden-content">Reveal-hidden substantive content</p>

---
layout: auto-image
image:
  position: center
  size: 50%
autofit:
  smallTiers: -1
---

<div data-testid="auto-image-center-visible">Visible center auto</div>

::image::

![Center visible image](../../public/images/autofit_placeholder.jpg)

::auto::

<p data-testid="center-visible-content">Visible substantive content</p>

---
layout: auto-image
image:
  position: left
  size: 25%
---

<div data-testid="auto-image-bridge-left-omitted">Bridge left omitted</div>

::image::

![Bridge left omitted image](../../public/images/autofit_placeholder.jpg)

::auto::

<p>Bridge content</p>

---
layout: auto-image
image:
  position: right
  size: 25%
autofit: {}
---

<div data-testid="auto-image-bridge-right-default">Bridge right default</div>

::image::

![Bridge right default image](../../public/images/autofit_placeholder.jpg)

::auto::

<p>Bridge content</p>

---
layout: auto-image
image:
  position: top
  size: 25%
autofit:
  alignment: bottom
---

<div data-testid="auto-image-bridge-top-partial">Bridge top partial</div>

::image::

![Bridge top partial image](../../public/images/autofit_placeholder.jpg)

::auto::

<p>Bridge content</p>

---
layout: auto-image
image:
  position: bottom
  size: 25%
autofit:
  largeTiers: 0
  smallTiers: 0
  tierIncrement: 10
  alignment: center
---

<div data-testid="auto-image-bridge-bottom-custom">Bridge bottom custom</div>

::image::

![Bridge bottom custom image](../../public/images/autofit_placeholder.jpg)

::auto::

<p>Bridge content</p>

---
layout: auto-image
image:
  position: left
  size: 25%
autofit:
  largeTiers: 4
  smallTiers: -1
  tierIncrement: 10
  alignment: top
---

<div data-testid="auto-image-bridge-left-invalid">Bridge left invalid</div>

::image::

![Bridge left invalid image](../../public/images/autofit_placeholder.jpg)

::auto::

<p>Bridge content</p>

---
layout: auto-image
image:
  position: right
  size: 25%
---

<div data-testid="auto-image-bridge-right-omitted">Bridge right omitted</div>

::image::

![Bridge right omitted image](../../public/images/autofit_placeholder.jpg)

::auto::

<p>Bridge content</p>

---
layout: auto-image
image:
  position: top
  size: 25%
autofit: {}
---

<div data-testid="auto-image-bridge-top-default">Bridge top default</div>

::image::

![Bridge top default image](../../public/images/autofit_placeholder.jpg)

::auto::

<p>Bridge content</p>

---
layout: auto-image
image:
  position: bottom
  size: 25%
autofit:
  alignment: bottom
---

<div data-testid="auto-image-bridge-bottom-partial">Bridge bottom partial</div>

::image::

![Bridge bottom partial image](../../public/images/autofit_placeholder.jpg)

::auto::

<p>Bridge content</p>

---
layout: auto-image
image:
  position: left
  size: 25%
autofit:
  largeTiers: 0
  smallTiers: 0
  tierIncrement: 10
  alignment: center
---

<div data-testid="auto-image-bridge-left-custom">Bridge left custom</div>

::image::

![Bridge left custom image](../../public/images/autofit_placeholder.jpg)

::auto::

<p>Bridge content</p>

---
layout: auto-image
image:
  position: right
  size: 25%
autofit:
  largeTiers: 4
  smallTiers: -1
  tierIncrement: 10
  alignment: top
---

<div data-testid="auto-image-bridge-right-invalid">Bridge right invalid</div>

::image::

![Bridge right invalid image](../../public/images/autofit_placeholder.jpg)

::auto::

<p>Bridge content</p>

---
layout: auto-image
image:
  position: top
  size: 25%
---

<div data-testid="auto-image-bridge-top-omitted">Bridge top omitted</div>

::image::

![Bridge top omitted image](../../public/images/autofit_placeholder.jpg)

::auto::

<p>Bridge content</p>

---
layout: auto-image
image:
  position: bottom
  size: 25%
autofit: {}
---

<div data-testid="auto-image-bridge-bottom-default">Bridge bottom default</div>

::image::

![Bridge bottom default image](../../public/images/autofit_placeholder.jpg)

::auto::

<p>Bridge content</p>

---
layout: auto-image
image:
  position: left
  size: 25%
autofit:
  alignment: bottom
---

<div data-testid="auto-image-bridge-left-partial">Bridge left partial</div>

::image::

![Bridge left partial image](../../public/images/autofit_placeholder.jpg)

::auto::

<p>Bridge content</p>

---
layout: auto-image
image:
  position: right
  size: 25%
autofit:
  largeTiers: 0
  smallTiers: 0
  tierIncrement: 10
  alignment: center
---

<div data-testid="auto-image-bridge-right-custom">Bridge right custom</div>

::image::

![Bridge right custom image](../../public/images/autofit_placeholder.jpg)

::auto::

<p>Bridge content</p>

---
layout: auto-image
image:
  position: top
  size: 25%
autofit:
  largeTiers: 4
  smallTiers: -1
  tierIncrement: 10
  alignment: top
---

<div data-testid="auto-image-bridge-top-invalid">Bridge top invalid</div>

::image::

![Bridge top invalid image](../../public/images/autofit_placeholder.jpg)

::auto::

<p>Bridge content</p>

---
layout: auto-image
image:
  position: bottom
  size: 25%
---

<div data-testid="auto-image-bridge-bottom-omitted">Bridge bottom omitted</div>

::image::

![Bridge bottom omitted image](../../public/images/autofit_placeholder.jpg)

::auto::

<p>Bridge content</p>

---
layout: auto-image
image:
  position: left
  size: 25%
autofit: {}
---

<div data-testid="auto-image-bridge-left-default">Bridge left default</div>

::image::

![Bridge left default image](../../public/images/autofit_placeholder.jpg)

::auto::

<p>Bridge content</p>

---
layout: auto-image
image:
  position: right
  size: 25%
autofit:
  alignment: bottom
---

<div data-testid="auto-image-bridge-right-partial">Bridge right partial</div>

::image::

![Bridge right partial image](../../public/images/autofit_placeholder.jpg)

::auto::

<p>Bridge content</p>

---
layout: auto-image
image:
  position: top
  size: 25%
autofit:
  largeTiers: 0
  smallTiers: 0
  tierIncrement: 10
  alignment: center
---

<div data-testid="auto-image-bridge-top-custom">Bridge top custom</div>

::image::

![Bridge top custom image](../../public/images/autofit_placeholder.jpg)

::auto::

<p>Bridge content</p>

---
layout: auto-image
image:
  position: bottom
  size: 25%
autofit:
  largeTiers: 4
  smallTiers: -1
  tierIncrement: 10
  alignment: top
---

<div data-testid="auto-image-bridge-bottom-invalid">Bridge bottom invalid</div>

::image::

![Bridge bottom invalid image](../../public/images/autofit_placeholder.jpg)

::auto::

<p>Bridge content</p>

---
layout: auto-image
image:
  position: center
  size: 50%
---

<div data-testid="auto-image-center-live">Live center AutoFit</div>

::image::

![Center live image](../../public/images/autofit_placeholder.jpg)

::auto::

<!-- semantically empty AutoFit content -->

---
layout: auto-default
---

<div data-testid="direct-autofit-empty-regression">Direct AutoFit empty</div>

<AutoFit data-testid="direct-autofit-empty-regression-root">
  <!-- whitespace and helper sentinels remain semantically empty -->
  <div data-slidev-v-click-gap></div>
</AutoFit>

---
layout: auto-image
image:
  position: left
  size: 0%
---

<div data-testid="auto-image-zero-inline-layout">Zero-inline image track</div>

::image::

<p>No image in the zero-inline track</p>

::auto::

<div style="height: 1000px">AutoFit overflow beside zero-inline image</div>

---
layout: auto-image
image:
  position: top
  size: 0%
---

<div data-testid="auto-image-zero-block-layout">Zero-block image track</div>

::image::

<p>No image in the zero-block track</p>

::auto::

<div style="height: 1000px">AutoFit overflow beside zero-block image</div>

---
layout: auto-image
image:
  position: right
  size: 35%
---

<h1 data-testid="auto-image-shell-equivalent-main-h1">Fixed main heading one</h1>
<h6 data-testid="auto-image-shell-equivalent-main-h6">Fixed main heading six</h6>

::image::

![Auto image shell equivalent](../../public/images/autofit_placeholder.jpg)

::auto::

<p data-testid="auto-image-shell-equivalent-auto">Remaining managed content</p>

::footer::

<h1 data-testid="auto-image-shell-equivalent-footer-h1">Fixed footer heading one</h1>
<h6 data-testid="auto-image-shell-equivalent-footer-h6">Fixed footer heading six</h6>

---
layout: auto-default
---

<h1 data-testid="default-shell-equivalent-main-h1">Fixed main heading one</h1>
<h6 data-testid="default-shell-equivalent-main-h6">Fixed main heading six</h6>

::auto::

<p data-testid="default-shell-equivalent-auto">Remaining managed content</p>

::footer::

<h1 data-testid="default-shell-equivalent-footer-h1">Fixed footer heading one</h1>
<h6 data-testid="default-shell-equivalent-footer-h6">Fixed footer heading six</h6>

---
layout: auto-image
image:
  position: left
  size: 0%
---

<div data-testid="auto-image-valid-overflow-main">Valid image overflow main</div>

::image::

<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" alt="Valid zero-track image">

::auto::

<div data-testid="auto-image-valid-overflow-auto" style="height: 1000px">AutoFit overflow in the remaining track</div>

---

<AutoImageLayoutLifecycleHarness />

---
layout: auto-image
image:
  position: left
  size: 98%
---

<div data-testid="auto-image-subpixel-threshold">Subpixel split threshold</div>

::image::

![Subpixel threshold image](../../public/images/autofit_placeholder.jpg)

::auto::

<p>Subpixel threshold auto content</p>

---
layout: auto-image
image:
  position: left
  size: invalid
---

<div data-testid="auto-image-fixed-config-precedence" style="height: 1000px">Fixed config precedence main</div>

::image::

![Fixed config precedence image](../../public/images/autofit_placeholder.jpg)

::auto::

<p>Config precedence auto content</p>

::footer::

<div style="height: 160px">Fixed config precedence footer</div>

---
layout: auto-image
image:
  position: top
  size: 100%
---

<div data-testid="auto-image-fixed-split-precedence" style="height: 1000px">Fixed split precedence main</div>

::image::

![Fixed split precedence image](../../public/images/autofit_placeholder.jpg)

::auto::

<p>Split precedence auto content</p>

::footer::

<div style="height: 160px">Fixed split precedence footer</div>

---
layout: auto-image
image:
  position: center
  size: 50%
---

<div data-testid="auto-image-fixed-center-precedence" style="height: 1000px">Fixed center precedence main</div>

::image::

![Fixed center precedence image](../../public/images/autofit_placeholder.jpg)

::auto::

<p>Center precedence auto content</p>

::footer::

<div style="height: 160px">Fixed center precedence footer</div>

---
layout: auto-image
image:
  position: left
  size: 0%
---

<div data-testid="auto-image-fixed-inner-precedence" style="height: 1000px">Fixed image precedence main</div>

::image::

<img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%237a0019'/%3E%3C/svg%3E" alt="Fixed image precedence image">

::auto::

<div style="height: 1000px">Fixed AutoFit precedence content</div>

::footer::

<div style="height: 160px">Fixed image precedence footer</div>

---
transition: none
---

# AutoImage default reveal lifecycle fixture

<AutoImageRevealHarness />

---
transition: none
---

# AutoImage reveal following slide

<div data-testid="auto-image-reveal-following-slide">Following ordinary slide.</div>

---

# AutoFit transition unmount retention

<AutofitTransitionUnmountHarness />

---

<AutoImageLayoutRawConfigHarness />

---
layout: auto-default
---

# Structural footer link: auto-default

::footer::

<style>
.auto-default-layout__footer a {
  border-bottom: 12px solid transparent;
  line-height: 1px;
}
</style>

<div data-testid="fixed-footer-link-auto-default" style="height: 1px"></div>

[Fitting footer link](https://example.test/)

---
layout: auto-default
---

# Structural footer heading: auto-default

::footer::

<h1 data-testid="fixed-footer-heading-auto-default" style="margin: 0; line-height: 1px">Fitting footer heading</h1>

---
layout: auto-column
---

# Structural footer link: auto-column

::left::

Left column

::right::

Right column

::footer::

<style>
.auto-column-layout__footer a {
  border-bottom: 12px solid transparent;
  line-height: 1px;
}
</style>

<div data-testid="fixed-footer-link-auto-column" style="height: 1px"></div>

[Fitting footer link](https://example.test/)

---
layout: auto-column
---

# Structural footer heading: auto-column

::left::

Left column

::right::

Right column

::footer::

<h1 data-testid="fixed-footer-heading-auto-column" style="margin: 0; line-height: 1px">Fitting footer heading</h1>

---
layout: auto-image
image:
  position: left
  size: 30%
---

# Structural footer link: auto-image

::image::

![Structural footer link image](../../public/images/autofit_placeholder.jpg)

::auto::

Auto content

::footer::

<style>
.auto-image-layout__footer a {
  border-bottom: 12px solid transparent;
  line-height: 1px;
}
</style>

<div data-testid="fixed-footer-link-auto-image" style="height: 1px"></div>

[Fitting footer link](https://example.test/)

---
layout: auto-image
image:
  position: left
  size: 30%
---

# Structural footer heading: auto-image

::image::

![Structural footer heading image](../../public/images/autofit_placeholder.jpg)

::auto::

Auto content

::footer::

<h1 data-testid="fixed-footer-heading-auto-image" style="margin: 0; line-height: 1px">Fitting footer heading</h1>

---
layout: auto-default
---

# Structural descendant classification boundaries

::footer::

<style>
[data-testid="structural-boundaries-footer"] [data-testid^="structural-boundary-"] {
  display: none;
}
</style>

<div data-testid="structural-boundaries-footer" style="height: 1px">
  <span data-testid="structural-boundary-atomic">Atomic inline boundary</span>
  <img data-testid="structural-boundary-media" alt="" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==">
  <span data-testid="structural-boundary-positioned">Positioned boundary</span>
  <span data-testid="structural-boundary-transformed">Transformed boundary</span>
  <span data-testid="structural-boundary-negative-margin">Negative margin boundary</span>
  <span data-testid="structural-boundary-clipped"><span data-testid="structural-boundary-clipped-child">Clipped boundary</span></span>
</div>
