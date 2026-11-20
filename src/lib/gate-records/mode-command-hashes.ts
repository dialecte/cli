/** The command hashes the records of each mode are keyed with, computed once for a reader at one gate base. */
import { foldsHookBase, readEmptyTree } from '../gate/gate-base.ts'
import { holdsScopedStep, releaseCoversFull, resolveGateSteps } from '../gate/gate-config.ts'
import { readCommitHookFiles } from '../git-hooks.ts'
import { tryReadGit } from '../git.ts'
import { PACKAGE_MANIFEST_FILE } from '../package-json.constants.ts'
import { foldHookBase, gateCommandHash, hashHookFiles, hashHookGateCommand } from './check-key.ts'

import type { PackageJson } from '../package-json.types.ts'
import type { ModeCommandHashes } from './mode-command-hashes.types.ts'

/**
 * The command hash a record of each mode must hold to answer for the package at `root` now, read at `gateBase` (the
 * base the reader resolved once; absent when no gate list holds a scoped step): `fast` and `full` keyed with it,
 * the hook's files folded with it when the hook runs `gate --hook` with a scoped step (`foldsHookBase`), what `gate --hook` keys its
 * `hook-gate` record with, `release` with the empty tree when its list holds a scoped step, and whether the release
 * list covers `full`. With `tree`, the hook files and the gate lists are read as that tree holds them (a hooks
 * folder outside the repository from disk; the caller's `packageJson` when the tree holds none). Throws a
 * `GateConfigError` for a gate config the cli cannot run.
 */
export function readModeCommandHashes(params: {
	root: string
	packageJson: PackageJson
	gateBase?: string
	/** The tree whose hook files and package.json the hashes are read at; absent: the worktree's own files. */
	tree?: string
}): ModeCommandHashes {
	const { root, gateBase, tree } = params
	const packageJson =
		tree === undefined
			? params.packageJson
			: (readPackageJsonAt({ root, tree }) ?? params.packageJson)
	const releaseSteps = resolveGateSteps({ packageJson, mode: 'release' })
	const hookFiles = readCommitHookFiles({ root, tree })
	const hook = hashHookFiles(hookFiles)
	return {
		fast: gateCommandHash({
			root,
			steps: resolveGateSteps({ packageJson, mode: 'fast' }),
			gateBase,
		}),
		full: gateCommandHash({
			root,
			steps: resolveGateSteps({ packageJson, mode: 'full' }),
			gateBase,
		}),
		hook:
			gateBase !== undefined && foldsHookBase({ packageJson, hookFiles })
				? foldHookBase({ hook, gateBase })
				: hook,
		hookGate: hashHookGateCommand({ packageJson, gateBase }),
		release: gateCommandHash({
			root,
			steps: releaseSteps,
			gateBase: holdsScopedStep(releaseSteps) ? readEmptyTree(root) : undefined,
		}),
		releaseCoversFull: releaseCoversFull({ packageJson }),
	}
}

/** The package.json of the package at `root` as `tree` holds it; undefined when the tree holds none, or no JSON object. */
function readPackageJsonAt(params: { root: string; tree: string }): PackageJson | undefined {
	const { root, tree } = params
	const prefix = tryReadGit({ root, args: ['rev-parse', '--show-prefix'] })?.trim() ?? ''
	const text = tryReadGit({ root, args: ['show', `${tree}:${prefix}${PACKAGE_MANIFEST_FILE}`] })
	if (text === undefined) return undefined
	try {
		const parsed: unknown = JSON.parse(text)
		return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
			? (parsed as PackageJson)
			: undefined
	} catch {
		// a package.json that is no JSON: the reader keeps the caller's
		return undefined
	}
}
