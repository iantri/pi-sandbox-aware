# Verify pi-sandbox-aware before release

Run local deterministic checks during development. Before every release, also
verify the same packed candidate on macOS both inside and outside a sandbox.
Neither set of checks replaces the other. There is no CI or automated publishing
step in this procedure.

## Local checks

Use Pi 1.1.0 or newer and Node.js 22.19.0 or newer. From the checkout, run:

```sh
npm ci
npm run typecheck
npm test
```

`npm ci` uses the committed lockfile. Keep it aligned with `package.json`.
`npm test` runs unit tests and real Pi sessions with injected sandbox results
and fake localhost model endpoints. These tests need no live model credentials
and do not prove that native sandbox detection works on the host.

The committed development SDK and related Pi packages are pinned to 1.1.0.
Also run type checking and ordinary tests with a current Pi release in a separate
temporary checkout. Keep that dependency change out of the release branch and
record the versions tested privately.

## Prepare the release candidate

Use a new temporary directory **outside the checkout** for the archive, extracted
package, and private evidence. From the checkout, run:

```sh
CANDIDATE_DIR=$(mktemp -d)
# Confirm this directory is outside the checkout before continuing.
npm pack --pack-destination "$CANDIDATE_DIR"
ARCHIVE=$(find "$CANDIDATE_DIR" -maxdepth 1 -name '*.tgz' -print)
shasum -a 256 "$ARCHIVE"
tar -xzf "$ARCHIVE" -C "$CANDIDATE_DIR"
export PI_SANDBOX_PACKAGE_ROOT="$CANDIDATE_DIR/package"
(cd "$PI_SANDBOX_PACKAGE_ROOT" && npm install --omit=dev --legacy-peer-deps)
```

Install only runtime dependencies in the extracted package. Its manifest can
contain development dependencies, but they must not be installed there. Keep the
checkout's development dependencies: they provide the Pi SDK and native test
runner. Run the tests below **from the checkout**, not the extracted package.

## Native release gate: both environments must pass

`npm run test:native` runs
`node --import tsx --test verification/native.test.ts`. It uses real koffi and
macOS `sandbox_check`, loads the extension through the candidate's Pi package
manifest, and uses a fake localhost model endpoint. It checks the startup
notification, footer status, and prompt guidance without live model credentials.

`PI_SANDBOX_EXPECT` is required. Allowed values are `sandboxed` and
`not-sandboxed`. A missing or invalid expectation, non-macOS host, unknown
detection result, or mismatch is a failure, not a skip. Setting the expectation
does not change the process's actual sandbox state.

1. In a sandboxed macOS terminal, run from the checkout:

   ```sh
   PI_SANDBOX_EXPECT=sandboxed npm run test:native
   ```

2. The maintainer must open a **separate normal macOS terminal outside the
   sandbox**. Never try to escape the current sandbox to perform this check.
   In that terminal, open the same checkout and set `PI_SANDBOX_PACKAGE_ROOT`
   to the same extracted package's absolute path. Then run:

   ```sh
   PI_SANDBOX_EXPECT=not-sandboxed npm run test:native
   ```

Without `PI_SANDBOX_PACKAGE_ROOT`, the native test checks the checkout. That is
useful during development but does not satisfy the packed-candidate release gate.
Both runs must use the same archive. Repack and repeat if release content changes.

## Check the real terminal interface

SDK UI capture checks requested text, not rendered pixels. In both environments,
launch an interactive Pi session loading only the same extracted candidate
through its package manifest, without a second installed copy of pi-sandbox-aware.
For example, run `pi --no-extensions -e "$PI_SANDBOX_PACKAGE_ROOT"` from the
checkout. No live model request is needed for this check.

- At startup, confirm the notification is readable and the footer is visible.
- In the sandbox, expect `Sandbox status: 🔒 active` and footer `🔒 sb`.
- Outside it, expect the `NOT SANDBOXED` warning and footer `🔓 NO SB`.
- Run `/reload`. Confirm the status remains correct, with no duplicate footer
  entry or extension errors.
- Exit Pi. Confirm shutdown has no extension errors or leftover status display.

Unknown status does not pass this release gate. Investigate it rather than
changing the expected state to make a check pass.

## Keep release evidence private

Outside the repository, record the source revision and dirty state, candidate
version and archive SHA-256, macOS version and architecture, Node and Pi versions,
commands, exit codes, and results of both native runs and both terminal checks.
Keep logs, screenshots, local paths, credentials, and live reports out of tracked
files and public issues. Do not publish until every required check passes.
