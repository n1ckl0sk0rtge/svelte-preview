# Release the npm runtime

The public npm package is `svelte-preview`. Its version comes from
`packages/runtime/package.json` and its source tag is `runtime-v<version>`.
Use `main` for runtime release commits.

## Decide whether to publish

Fetch `origin/main` and tags. Read the registry's current version and source
commit with `npm view svelte-preview@latest version gitHead --json`. Use that
`gitHead` as the baseline. If the registry omits it, use the corresponding
`runtime-v<version>` tag. If the baseline cannot be resolved, investigate before
deciding whether the runtime changed.

```sh
git diff --name-status <published-runtime-commit> origin/main -- packages/runtime
```

Review the diff for changes to shipped code, public types, the CLI, the bundled
skill, runtime dependencies, or package behavior. Review lockfile
changes if they affect runtime dependency resolution. README, screenshot,
demo, test, and release-skill edits alone can wait for the next runtime release.

## Prepare and verify

1. Work from an up-to-date `main` with unrelated local edits kept out of the
   release. Check the versions already on npm. Use the requested version or
   choose the next unused version based on the runtime changes. Use a patch for
   fixes and a minor for new backward-compatible features. Account for breaking
   changes under SemVer, including the current pre-1.0 versioning.
2. Bump `packages/runtime/package.json`. From the repository root, run
   `pnpm install --frozen-lockfile`, `pnpm test`, and `pnpm check`.
3. From `packages/runtime`, run `npm pack --json --pack-destination <temp-dir>`.
   Verify that the tarball includes the CLI, bundled skill, and runtime entry
   points. Install it in a temporary Svelte project and run the installed CLI's
   `install-skill` command. Record the tarball integrity for verification.
4. Commit the verified version bump as `chore: release npm runtime <version>`.
   Confirm the release commit includes the latest remote `main` before publishing.

## Publish and verify

1. Check `npm whoami` against the public registry. If sign-in is required, open
   `npm login --auth-type=web` and let the user complete it in their browser.
2. Run this command from `packages/runtime`:

   ```sh
   npm publish --access public --tag latest --registry=https://registry.npmjs.org/
   ```

   If npm prompts for browser-based 2FA, let the user complete that prompt.
3. After npm accepts the publish, tag the version commit
   `runtime-v<version>` and push `main` and the tag to origin. If publication
   or a push only partly succeeds, inspect npm and remote Git state before retrying.
4. Check `npm view --prefer-online svelte-preview@latest version bin gitHead dist.integrity --json`.
   Confirm the version, CLI entry point, release commit, and tarball integrity.
   Install `svelte-preview@latest` in a fresh project and smoke-test the CLI.
   npm may take a few minutes to make the version and tarball available. Poll
   after an accepted publish and allow any cached 404 to expire before retrying
   the install. If the registry still lags after several minutes, report exactly
   what npm accepted and what remains unverified.
5. Report the npm version, source tag, and test results. For a combined
   release, create the plugin release branch from the updated `origin/main`.
