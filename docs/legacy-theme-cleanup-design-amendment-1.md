# Legacy Theme Cleanup Design Amendment 1

## References

This amendment supplements the approved design in
`docs/legacy-theme-cleanup-design.md` and its approved implementation plan in
`docs/legacy-theme-cleanup-plan.md`.

The original documents remain immutable records. This amendment supersedes
only their addon-mode browser-fixture requirements.

## Rationale

The approved design specified this fixture headmatter:

```yaml
theme: default
addons:
  - ../..
```

Implementation validation exposed a Slidev 52.19 resolver defect. For the
fixture entry at `tests/fixtures/autofit.md`, Slidev passes the fixture's
`userRoot` to the addon resolver, but relative addon paths are resolved from
`dirname(userRoot)`. Consequently, `../..` resolves to `D:\Teaching` instead
of the repository and both development and production startup fail while
reading `D:\Teaching\package.json`.

Using `..` works under the current defective behavior but would couple the
suite to that defect and could break if Slidev corrects the resolver. A
workspace consumer package would provide package-name resolution, but it is
disproportionate infrastructure for this legacy-name cleanup.

The browser fixture remains necessary as the controlled Slidev application
for browser geometry, layout, reactivity, media, reveal, and production-build
tests. Its current `theme: ../..` entry is retained strictly as test bootstrap
infrastructure that exposes repository layouts, components, and styles. It is
not author-facing documentation or a claim that the published package remains
a theme.

## Precise design delta

- Drop the addon-mode browser-fixture goal and its implementation task.
- Restore and retain `theme: ../..` in `tests/fixtures/autofit.md`.
- Do not add an `addons` entry to the browser fixture.
- Do not create a pnpm workspace consumer, nested consumer package, runtime
  junction, package-install helper, or other addon-resolution infrastructure.
- Keep the remaining approved cleanup unchanged: centralized addon diagnostic
  identity, README addon terminology, and neutral example wording.

## Scope

- Remove the browser-fixture migration from the active implementation scope.
- Record the discovered upstream resolver behavior as follow-up work.

## Non-goals

- Do not change the browser fixture or its loading mechanism.
- Do not test addon installation or package-name resolution in this cleanup.
- Do not submit an external GitHub issue as part of this task.
- Do not alter any other approved design decision, protected color, fixture
  color, host-theme language, or example subtitle.

## Acceptance criteria

1. `tests/fixtures/autofit.md` retains `theme: ../..` and has no addon entry.
2. No workspace-consumer or resolver-workaround infrastructure is introduced.
3. Implementation proceeds only with the original diagnostic-identity and
   documentation/example cleanup tasks.
4. Completion notes record a follow-up to submit a Slidev GitHub issue: relative
   addon paths resolve from `dirname(userRoot)` rather than `userRoot` in the
   tested Slidev 52.19 path.
5. No external issue is submitted during this implementation.

## Affected tasks

- Original Task 1, “Exercise the package through Slidev's addon resolver,” is
  canceled and must not be committed.
- Original Task 2 becomes the first implementation task.
- Original Task 3 becomes the second implementation task.
