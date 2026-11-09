/** The command hashes the records of each mode are keyed with, computed once for a reader at one gate base. */
import { hasScopedHookStep, readEmptyTree } from '../gate/gate-base.ts'
import { holdsScopedStep, releaseCoversFull, resolveGateSteps } from '../gate/gate-config.ts'
import { foldHookBase, gateCommandHash, hashHookCommand } from './check-key.ts'

import type { PackageJson } from '../package-json.types.ts'
import type { ModeCommandHashes } from './mode-command-hashes.types.ts'

/**
 * The command hash a record of each mode must hold to answer for the package at `root` now, read at `gateBase` (the
 * base the reader resolved once; absent when no gate list holds a scoped step): `fast` and `full` keyed with it,
 * the hook's files folded with it when the hook's test steps hold a scoped step, `release` with the empty tree when
 * its list holds a scoped step, and whether the release list covers `full`. Throws a `GateConfigError` for a gate
 * config the cli cannot run.
 */
export function readModeCommandHashes(params: {
	root: string
	packageJson: PackageJson
	gateBase?: string
}): ModeCommandHashes {
	const { root, packageJson, gateBase } = params
	const releaseSteps = resolveGateSteps({ packageJson, mode: 'release' })
	const hook = hashHookCommand(root)
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
			gateBase !== undefined && hasScopedHookStep(packageJson)
				? foldHookBase({ hook, gateBase })
				: hook,
		release: gateCommandHash({
			root,
			steps: releaseSteps,
			gateBase: holdsScopedStep(releaseSteps) ? readEmptyTree(root) : undefined,
		}),
		releaseCoversFull: releaseCoversFull({ packageJson }),
	}
}
