/**
 * The key of a `dialecte contrib` run, shared by the run, the hand-over card, the `contrib` guard and the rehearsal
 * plan: the tree, what is installed, and a command hash of the contrib rows (a built-in row by its name and the cli's
 * version) with HEAD folded in, which the rules row reads the changed files against.
 */
import { readInstalledKey, hashGateCommand } from '../gate-records/check-key.ts'
import { isSameKey, readTreeRecords } from '../gate-records/check-store.ts'
import { readPackageJson } from '../package-json.ts'
import { readCliVersion } from '../read-cli-version.ts'
import { resolveContribSteps } from './contrib-steps.ts'
import { BUILTIN_STEP_COMMAND, CONTRIB_RECORD_MODE } from './contrib.constants.ts'

import type { CheckKey, GateRecord } from '../gate-records/gate-records.types.ts'
import type { GateStep } from '../gate/gate-config.types.ts'
import type { ContribStep } from './contrib.types.ts'

/** The command hash of a contrib run of `steps` at the commit `head`. */
export function contribCommandHash(params: {
	steps: readonly ContribStep[]
	head: string
}): string {
	const version = readCliVersion()
	const hashed = params.steps.map(function hashedStep(step): GateStep {
		if (!('builtin' in step)) return step
		return {
			name: step.name,
			run: BUILTIN_STEP_COMMAND.replace('{builtin}', step.builtin).replace('{version}', version),
		}
	})
	return hashGateCommand({ steps: hashed, base: params.head })
}

/**
 * The key a contrib run of the package at `root` would have now on `tree` at the commit `head`: the package's contrib
 * rows, what is installed in `root`.
 */
export function contribKeyOf(params: { root: string; tree: string; head: string }): CheckKey {
	const steps = resolveContribSteps({ packageJson: readPackageJson(params.root) })
	return {
		tree: params.tree,
		...readInstalledKey(params.root),
		commandHash: contribCommandHash({ steps, head: params.head }),
	}
}

/** The newest stored contrib record of `tree` whose key is the one a run at `head` would have now, green or not. */
export function findContribRecord(params: {
	root: string
	tree: string
	head: string
}): GateRecord | undefined {
	const key = contribKeyOf(params)
	return readTreeRecords({ root: params.root, tree: params.tree })
		.filter(
			(record) => record.mode === CONTRIB_RECORD_MODE && isSameKey({ key, other: record.key }),
		)
		.sort((first, second) => second.at.localeCompare(first.at))[0]
}
