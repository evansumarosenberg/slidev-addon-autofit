---
theme: default
addons:
  - ../../
comark: true
defaults:
  layout: auto-default
---

# Display math between paragraphs

<span data-testid="math-middle" />

::auto::

Before the equation.

$$
v \cdot w = \|v\|\,\|w\|\cos(\theta)
$$

After the equation.

---
layout: auto-default
---

# Display math at the end

<span data-testid="math-last" />

::auto::

Before the equation.

Another paragraph.

$$
v \cdot w = \|v\|\,\|w\|\cos(\theta)
$$

---
layout: auto-image
image:
  position: right
  size: 38%
---

# Display math beside an image

<span data-testid="math-image" />

::image::

![Math fixture](../../../public/images/autofit_placeholder.jpg)

::auto::

- First bullet.
- Second bullet.

$$
v \cdot w = \|v\|\,\|w\|\cos(\theta)
$$

---
layout: auto-column
---

# Display math in paired columns

<span data-testid="math-columns" />

::left::

Before the equation.

$$
v \cdot w = \|v\|\,\|w\|\cos(\theta)
$$

After the equation.

::right::

Another equation.

$$
\theta = \operatorname{atan2}(b.y, b.x) - \operatorname{atan2}(a.y, a.x)
$$

After the right equation.

---
layout: auto-default
---

# Complex display math

<span data-testid="math-complex" />

::auto::

$$
\begin{aligned}
f(x) &= \frac{\sqrt{1+x^2}}{1+\frac{1}{x}} \\
A &= \begin{pmatrix} 1 & 2 \\ 3 & 4 \end{pmatrix}
\end{aligned}
\tag{1}
$$

A paragraph after the first equation.

$$
\int_0^1 x^2\,dx = \frac{1}{3}
$$

---
layout: auto-default
autofit:
  smallTiers: 0
  largeTiers: 0
  alignment: top
---

# Inline math baseline

<span data-testid="math-inline-baseline" />

::auto::

Inline $v \cdot w = \|v\|\,\|w\|\cos(\theta)$ in a paragraph.

- Inline $\frac{x^2}{y}$ in a bullet.

---
layout: auto-default
autofit:
  smallTiers: 0
  largeTiers: 0
  alignment: top
---

# Mixed inline and display math

<span data-testid="math-inline-mixed" />

::auto::

Inline $v \cdot w = \|v\|\,\|w\|\cos(\theta)$ in a paragraph.

- Inline $\frac{x^2}{y}$ in a bullet.

$$
E = mc^2
$$

---
layout: auto-default
---

# Revealed display math

<span data-testid="math-reveal" />

::auto::

<v-clicks>

Before the equation.

$$
\sqrt{x^2+1} = y
$$

After the equation.

</v-clicks>

---
layout: auto-default
---

# Wide equation

<span data-testid="math-wide" />

::auto::

$$
\underbrace{aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa}_{\text{wide}}
$$

---
layout: default
---

# Direct AutoFit

<span data-testid="math-direct" />

<AutoFit :small-tiers="0" :large-tiers="0" alignment="top">

$$
x = y
$$

</AutoFit>

---
layout: auto-column
---

# Paired spacing fallback

<span data-testid="math-column-overflow" />

::left::

Before the equation.

$$
v \cdot w = \|v\|\,\|w\|\cos(\theta)
$$

After the equation.

::right::

Another equation.

$$
\theta = \operatorname{atan2}(b.y, b.x) - \operatorname{atan2}(a.y, a.x)
$$

---
layout: auto-default
autofit:
  alignment: top
---

# Top math

<span data-testid="math-top" />

::auto::

$$
\frac{x}{y} = z
$$

Text after math.

---
layout: auto-default
autofit:
  alignment: middle
---

# Middle math

<span data-testid="math-center" />

::auto::

$$
\frac{x}{y} = z
$$

Text after math.

---
layout: auto-default
autofit:
  alignment: bottom
---

# Bottom math

<span data-testid="math-bottom" />

::auto::

$$
\frac{x}{y} = z
$$

Text after math.

---
layout: auto-column
---

# Non-math spacing fallback

<span data-testid="text-column-spacing" />

::left::

First short paragraph.

Second short paragraph.

Third short paragraph.

Fourth short paragraph.

::right::

A width-constrained word.

ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789
