# Project Guidance

## Visual verification

- Before completing work that affects rendered slides, build the example deck and ask the user to perform the final visual verification. Completion requires the user's PASS.
- Do not use screenshots for visual verification unless the user explicitly requests them.
- Treat human inspection of `example.md` as the authority for presentation quality. When it exposes a functional bug, reproduce that behavior in a focused test fixture rather than turning the example deck into a test fixture.

## README

- `README.md` is concise, author-facing documentation for installation, configuration, and usage.
- Preserve practical examples, supported syntax, defaults, limitations, and diagnostics that authors need.
- Exclude implementation internals discoverable from the repository, exhaustive design rationale, test details, and agent workflow instructions.
- Do not add tests that assert README wording, headings, ordering, or other prose.

## Example deck and tests

- `example.md` is a demonstrative deck for human review, not an executable specification.
- Supported examples should use Markdown and public layout syntax. Do not use HTML/CSS to force font sizes or spacing that autofit is responsible for.
- Raw HTML is acceptable when necessary to demonstrate an intentionally unsupported case.
- Do not test example-slide titles, prose, order, counts, Markdown structure, or the presence of particular examples. A successful deck build is sufficient automated validation of the example source.
- Tests should verify runtime behavior through focused fixtures. Do not create parsers or assertions that enforce documentation or demo-content conventions.

## Scope

- Preserve existing default-layout and direct `<AutoFit>` behavior unless a task explicitly changes it.
- Keep paired coordination specific to `auto-column`; do not generalize it without explicit approval.
