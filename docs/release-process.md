# Release process

HISSOUNDBOARD ships as downloadable desktop artifacts on GitHub Releases. There is no server deployment for the app itself; the "deployment" is the published Windows installer, Linux AppImage, and macOS DMG.

## Versioning

Use SemVer and keep `package.json`, `package-lock.json`, the Git tag, and the GitHub Release aligned.

- `PATCH` (`1.0.1`): bug fixes, small UI fixes, documentation updates, safe dependency patches.
- `MINOR` (`1.1.0`): new user-facing features that keep existing boards and settings compatible.
- `MAJOR` (`2.0.0`): breaking changes to saved data, shortcuts, audio routing behavior, or supported platforms.
- Prereleases (`1.1.0-beta.1`): test builds for changes that need real voice-chat/audio-device validation before everyone gets the new meme launcher.

Release tags must use the `vX.Y.Z` format, for example `v1.0.1` or `v1.1.0-beta.1`.

## Normal release flow

1. Develop on a branch and open a pull request into `main`.
2. Wait for `CI` to be green.
3. Choose the version bump with exactly one PR label:
   - `release:patch`
   - `release:minor`
   - `release:major`
4. Merge the PR.
5. GitHub Actions runs `Auto Version and Release`, bumps `package.json` and `package-lock.json`, creates the matching `vX.Y.Z` tag, builds all installers, and publishes a GitHub Release.

Renovate PRs are automatically treated as `release:patch`, so dependency maintenance does not need a manual version choice.

Do not run `npm version` manually for normal releases. The workflow owns the release commit and tag.

The release workflow refuses to publish if the tag version and `package.json` version do not match.

## Re-running a release

If a release job fails because a hosted runner or dependency download had a bad day, open GitHub Actions, choose `Release Desktop App`, and run it manually with the existing tag, for example `v1.0.1`.

Use `draft: true` when you want to inspect the uploaded files before users see the release.

If you need a release without a PR, open GitHub Actions, choose `Auto Version and Release`, and run it manually with `patch`, `minor`, or `major`.

## GitHub prerequisites

- Install the Mend Renovate GitHub App for this repository and let it create dependency update PRs.
- Enable GitHub Actions for the repository.
- Create these repository labels once: `release:patch`, `release:minor`, `release:major`.
- Allow the workflow `GITHUB_TOKEN` to create release commits, tags, and releases. The auto-release workflow requests `contents: write` only where it needs to push the version commit/tag; the publish job requests `contents: write` only to create the GitHub Release.
- If `main` is protected, allow GitHub Actions to push the generated version commit and tag, or use a dedicated release bot token. Otherwise the auto-release workflow will fail after merge when it tries to write the release commit.
- Keep the repository public if zero Actions cost is important. Standard GitHub-hosted runners are free for public repositories. Private repositories use the account/org quota and can generate billable usage after the included allowance.
- Do not switch these workflows to larger runners. Larger runners are billed even when normal hosted runners would be free.
- Keep artifact retention short. The release workflow keeps intermediate Actions artifacts for only 3 days; the durable deliverables live on the GitHub Release.
- CI installs with `npm ci --ignore-scripts --loglevel=error` because the project intentionally sets `npmRebuild: false` for `electron-builder`. Running the `postinstall` hook on Ubuntu would try to compile `uiohook-napi` against missing X11 development headers instead of using the packaged prebuilds. The reduced log level also keeps known `electron-builder` transitive deprecation warnings out of release logs until upstream replaces those packages.

## Dependency update policy

Renovate opens PRs on a weekly Monday morning window and maintains a dependency dashboard.

- Minor and patch npm updates are grouped.
- Major npm updates require explicit approval from the dependency dashboard.
- Electron, `electron-builder`, and `uiohook-napi` are grouped separately and labelled for manual runtime testing.
- GitHub Actions updates are grouped separately.
- Renovate PRs carry `release:patch`, so merging them produces a patch release automatically.

Before merging Renovate PRs that touch Electron, native modules, or audio libraries, run at least one local smoke test with global shortcuts, playback, and the remote control.
