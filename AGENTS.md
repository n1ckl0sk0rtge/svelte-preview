# Working in this repository

Svelte Preview has two parts: the JetBrains plugin in `plugin/` and the local
Svelte preview runtime in `packages/runtime/`. `examples/demo/` exercises the runtime.

## Development and checks

- Use pnpm as pinned in the root `package.json`, Node.js 22.12+ or 24+, and JDK 25.
- Install dependencies with `pnpm install --frozen-lockfile`.
- Run `pnpm test` for runtime tests and `pnpm check` for runtime and demo checks.
- Run `./gradlew --no-daemon test buildPlugin` from `plugin/` for plugin tests and
  the installable ZIP in `plugin/build/distributions/`. Use the checked-in wrapper.
- CI runs these checks on every branch push and pull request into `main`.

## Code and communication

- Keep edits focused. Group related statements into logical blocks with blank lines.
- In multi-step functions, add a short comment above each logical block explaining
  its purpose. Avoid comments that simply repeat individual statements.
- Use plain, conversational language. Explain what changed, why it matters, and
  how it was checked. Keep review suggestions specific and actionable.

## Releases

Use [.agents/skills/release-plugin/SKILL.md](.agents/skills/release-plugin/SKILL.md)
when asked to release the plugin or the npm runtime.

Publish npm runtime releases from `main` with the tag `runtime-vx.x.x`. For a
plugin release, check for shipped runtime changes since the last npm release
and publish the next runtime version first if needed.

- Create `release/x.x.x` from the updated `main` branch.
- Bump `version` in `plugin/build.gradle.kts` on the release branch.
- Test and build that branch, then publish a GitHub release tagged `vx.x.x` from
  its commit with the matching plugin ZIP attached.

Plugin and npm runtime versions are independent. JetBrains Marketplace
publishing requires its own request.
