/** Name of the lock file, in the repository's git folder, while a hand-over script waits or runs. */
export const HANDOVER_LOCK_FILE = 'dialecte-handover.lock'

export const COMMIT_SCRIPT_FILE = 'commit.sh'

/** The files of a hand-over folder: the lots as the agent wrote them, then the snapshot. */
export const HANDOVER_FILES = {
	lots: 'lots.json',
	files: 'files.txt',
	hashes: 'files.sha256',
	deleted: 'files.deleted',
	/** The hash of `lots.json` as reviewed: an edit after the hand-over is refused. */
	lotsHash: 'lots.sha256',
} as const

/** A script of a hand-over written by hand, before the lots file existed. */
export const LEGACY_SCRIPT_PATTERN = /^commit.*\.sh$/

/** The marker a rehearsal clone holds, in its git folder: whose process made it. */
export const REHEARSAL_MARKER_FILE = 'dialecte-rehearsal.json'

/** The commit a lots file names: a sha or an unambiguous prefix of one. */
export const HEAD_PATTERN = /^[0-9a-f]{7,40}$/

/** How many leading bytes decide that a file is binary (no references looked for in it). */
export const BINARY_PROBE_LENGTH = 8000

/** Before each line a lot's commit (its hooks) prints. */
export const HOOK_OUTPUT_PREFIX = '  │ '

export const HOOK_HEARTBEAT_LABEL = '  … hook running'

/** Folders `--rehearse` clones into, under the system's temporary folder; `worktree prune` finds them by it. */
export const REHEARSAL_FOLDER_PREFIX = 'dialecte-rehearse-'

/** How deep `handover list` looks for hand-over folders under its root. */
export const LIST_DEPTH = 4

/** Width of the guard name column of the progress lines. */
export const GUARD_NAME_WIDTH = 11

/**
 * The script a hand-over writes. People run it with `sh` (macOS: bash 3.2), so it re-executes itself
 * with bash. It runs the cli the repository installs; a cli without `handover run` (missing, or older)
 * gets one line saying how to run the hand-over anyway.
 *
 * Placeholders: `__HEADER__`, `__REPOSITORY__`, `__FALLBACK__` (the command with the cli that wrote the
 * script).
 */
export const COMMIT_SCRIPT_TEMPLATE = `#!/usr/bin/env bash
__HEADER__
if [ -z "\${BASH_VERSION:-}" ]; then exec bash "$0" "$@"; fi
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd __REPOSITORY__
npx --no-install @dialecte/cli handover run --probe >/dev/null 2>&1 || { echo ">> no @dialecte/cli with \\\`handover run\\\` installed in "__REPOSITORY__": npm install --save-dev @dialecte/cli@latest there, or run: "__FALLBACK__ >&2; exit 1; }
exec npx --no-install @dialecte/cli handover run "$HERE" "$@"
`
