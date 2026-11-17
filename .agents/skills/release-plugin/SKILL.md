---
name: release-plugin
description: Create a versioned GitHub release of this repository's JetBrains Svelte Preview plugin from a release/x.x.x branch, with tests and an installable ZIP. Use for plugin release requests, not npm runtime or JetBrains Marketplace publishing.
---

# Release the Svelte Preview plugin

The release branch is `release/x.x.x`, the Git tag is `vx.x.x`, and the asset is
`plugin/build/distributions/svelte-preview-x.x.x.zip`. The version source is
`plugin/build.gradle.kts`; `packages/runtime/package.json` has an independent version.

## Prepare the branch

1. Read the root `AGENTS.md`. Check Git status, the origin remote, GitHub CLI
   authentication, existing release branches, tags, and GitHub releases.
   Preserve unrelated local work; use a clean worktree if needed.
2. Use the requested version. If none is specified, choose the next patch above
   both the current plugin version and the latest stable plugin release, and
   state that choice. `main` may still contain an earlier version because version
   bumps belong to release branches.
3. Fetch origin and create `release/x.x.x` from the current `origin/main`.
   If that branch or tag already exists, inspect it and resume only when it
   matches this release. Do not overwrite published releases or force-push tags.
4. Change `version` in `plugin/build.gradle.kts` to `x.x.x` on this branch. Update
   any documentation that names the old plugin ZIP. Keep runtime versions unchanged.

## Validate and package

Use Node.js 22.12+ or 24+, the pnpm version in the root `package.json`, and JDK 25.
Ensure `JAVA_HOME` selects JDK 25 when another JDK is the shell default.

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm check
```

From `plugin/`:

```sh
./gradlew --no-daemon clean test buildPlugin
```

Confirm the expected ZIP exists and its nested plugin JAR's `META-INF/plugin.xml`
contains the intended version and plugin ID `dev.sveltepreview`. Use the ZIP from
this build, not an older file in the distributions directory.

## Publish from the release branch

1. Commit the version bump as `chore: release plugin x.x.x` and push
   `release/x.x.x` to origin. Wait for the CI run for that exact commit to pass.
   Resolve failures before publishing.
2. Write release notes to a temporary file outside the working tree. Describe
   user-visible changes since the previous plugin tag, list the IDE/JDK/runtime
   requirements from the README, and explain installing the attached ZIP through
   **Settings → Plugins → Install Plugin from Disk**. For the first release,
   describe the current capabilities. State how to install the unpublished runtime
   from a local checkout if it is still unpublished.
3. Tag the verified release-branch commit and push the tag:

   ```sh
   git tag -a vx.x.x -m "Svelte Preview x.x.x" <release-commit>
   git push origin vx.x.x
   ```

4. Publish the GitHub release with its branch explicitly selected:

   ```sh
   gh release create vx.x.x plugin/build/distributions/svelte-preview-x.x.x.zip \
     --verify-tag --target release/x.x.x --title "Svelte Preview x.x.x" \
     --notes-file <notes-file>
   ```

5. Verify the remote branch and tag resolve to the tested commit, and check the
   release is published with the expected asset. Report the release URL, branch,
   version, and test results. Leave the version bump on the release branch;
   merging it into `main` is a separate task.

If authentication, pushes, CI, or publication fails, stop at that failed step and
report what remains. Inspect remote state before retrying a partially completed
publication. A release request authorizes this branch, tag, and GitHub release;
do not add another approval step when the user already requested publication.
