/**
 * The key of a `dialecte contrib` run, shared by the run, the hand-over card, the `contrib` guard and the rehearsal
 * plan: the tree, what it locks, the `file:` dependencies, and a command hash of the contrib rows (a built-in row by its name and the cli's
 * version) with HEAD folded in, which the rules row reads the changed files against.
 */
import { createHash } from 'node:crypto'

import { foldMachineLists, hashGateCommand, readTreeKey } from '../gate-records/check-key.ts'
import { isSameKey, readTreeRecords } from '../gate-records/check-store.ts'
import { readPackageJson } from '../package-json.ts'
import { readCliVersion } from '../read-cli-version.ts'
import { baseBranchReleaseOf, releaseChangelogOf } from '../rules/released-changelog.ts'
import { resolveContribSteps } from './contrib-steps.ts'
import {
	BUILTIN_STEP_COMMAND,
	CONTRIB_BUILTIN_STEPS,
	CONTRIB_RECORD_MODE,
} from './contrib.constants.ts'

import type { ReleaseChangelog } from '../changelog/changelog.types.ts'
import type { CheckKey, GateRecord } from '../gate-records/gate-records.types.ts'
import type { GateStep } from '../gate/gate-config.types.ts'
import type { ContribStep } from './contrib.types.ts'

/**
 * The command hash a contrib record of the package at `root` is keyed with: `contribCommandHash`, folded with the
 * machine's lists its rules row reads (`foldMachineLists`), so a list set or changed after a green record runs it again,
 * and with the release changelog its changelog row judged against (`releaseChangelog`), so a base whose
 * `CHANGELOG.md` changed runs it again.
 */
export function contribKeyHash(params: {
	root: string
	steps: readonly ContribStep[]
	head: string
	/** The changelog row's release changelog (`contribReleaseChangelogOf`); undefined without a changelog row. */
	releaseChangelog: ReleaseChangelog | undefined
}): string {
	const hash = contribCommandHash({ steps: params.steps, head: params.head })
	const rules = CONTRIB_BUILTIN_STEPS.rules.builtin
	const folded = params.steps.some((step) => 'builtin' in step && step.builtin === rules)
		? foldMachineLists({ root: params.root, hash })
		: hash
	return params.releaseChangelog === undefined
		? folded
		: createHash('sha256')
				.update(JSON.stringify({ command: folded, releaseChangelog: params.releaseChangelog }))
				.digest('hex')
}

/**
 * The release changelog a contrib run of `steps` reads: what its changelog row judges released sections against
 * (`releaseChangelogOf`), undefined when the rows hold no changelog row.
 *
 * @intent read what a contrib changelog row judges against, the same for the run and every key reader
 * @internal
 */
export function contribReleaseChangelogOf(params: {
	root: string
	steps: readonly ContribStep[]
	head: string
	/** The release base: a commit resolved in the repository (a rehearsal's clone is handed it), `null` for none. */
	releaseBase: string | null
}): ReleaseChangelog | undefined {
	const changelog = CONTRIB_BUILTIN_STEPS.changelog.builtin
	if (!params.steps.some((step) => 'builtin' in step && step.builtin === changelog))
		return undefined
	return releaseChangelogOf(params)
}

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
 * rows, what `tree` locks, the `file:` dependencies of `root`.
 */
export function contribKeyOf(params: {
	root: string
	tree: string
	head: string
	/** The release base resolved in the repository (never in a rehearsal's clone), `null` for none. */
	releaseBase: string | null
}): CheckKey {
	const steps = resolveContribSteps({ packageJson: readPackageJson(params.root) })
	const releaseChangelog = contribReleaseChangelogOf({ ...params, steps })
	return {
		tree: params.tree,
		...readTreeKey({ root: params.root, tree: params.tree }),
		commandHash: contribKeyHash({ root: params.root, steps, head: params.head, releaseChangelog }),
		...(releaseChangelog && { releaseChangelog }),
	}
}

/**
 * The release base of the package at `root` as the contrib key readers pass it: its base branch's commit, `null`
 * when none is found.
 *
 * @intent resolve the release base a contrib key is computed with, in the repository
 * @internal
 */
export function contribReleaseBaseOf(params: { root: string }): string | null {
	return baseBranchReleaseOf(params)?.commit ?? null
}

/** The newest stored contrib record of `tree` whose key is the one a run at `head` would have now, green or not. */
export function findContribRecord(params: {
	root: string
	tree: string
	head: string
	releaseBase: string | null
}): GateRecord | undefined {
	const key = contribKeyOf(params)
	return readTreeRecords({ root: params.root, tree: params.tree })
		.filter(
			(record) => record.mode === CONTRIB_RECORD_MODE && isSameKey({ key, other: record.key }),
		)
		.sort((first, second) => second.at.localeCompare(first.at))[0]
}
