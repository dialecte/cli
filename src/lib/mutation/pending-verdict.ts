/**
 * What a package still owes a hand-over, read from the mutation store when asked: the `new` survivors and the died
 * runs of the package (any lot), the runs still running on the hand-over's branches, and for a gate lot whether a run
 * of those branches reported on the tree handed over. The card's gate line and the run's guard both read it.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { counted } from '../counted.ts'
import { ARCHIVED_LOT_FILE } from '../handover/handover.constants.ts'
import { readPackageJson } from '../package-json.ts'
import { readLotDeclaration } from '../tdd/lot-declaration.ts'
import { LOT_FILE } from '../worktree/worktree.constants.ts'
import { readMutationDeclaration } from './declaration.ts'
import { pendingOf } from './ledger.ts'
import { readMutationMode } from './lot-mode.ts'
import { MUTATION_MODES } from './mutation.constants.ts'
import {
	ACT_ON_EACH,
	DIED_RUN_NOUN,
	GATE_LOT_WITHOUT_RUN,
	INVALID_FOLDER_MODE,
	NEW_SURVIVOR_LINE,
	NEW_SURVIVOR_NOUN,
	NOTHING_PENDING,
	RUN_DIED_LINE,
	RUN_RUNNING,
	RUNNING_CONSEQUENCE,
	STATUS_HINT,
	VERDICT_PART_SEPARATOR,
} from './pending-verdict.constants.ts'
import { packageNameOf, readRuns } from './run-store.ts'

import type { KeyedLedgerItem, MutationModeSetting, RunEntry } from './mutation.types.ts'
import type {
	LotModeOfParams,
	PendingVerdict,
	PendingVerdictParams,
} from './pending-verdict.types.ts'

/**
 * What the package at `root` still owes the hand-over of `branch` (merging `mergedBranches`), as the `mutation`
 * line reads it: `failed` (new survivors, died runs, a run a merge or a gate lot waits for, a gate lot with no run
 * reported on `tree`, an invalid declaration or lot mode), `warning` (a run of the branch still running), else
 * `passed`; undefined when the package declares no mutation scope.
 * @intent block a hand-over on pending mutation survivors, tell whether a mutation run is still running
 */
export function pendingVerdict(params: PendingVerdictParams): PendingVerdict | undefined {
	const { root, lotMode } = params
	const declaration = readMutationDeclaration({ packageJson: readPackageJson(root) })
	if (declaration.kind === 'none') return undefined
	if (declaration.kind === 'invalid') return failedWith(declaration.reason)
	if (lotMode.kind === 'invalid') return failedWith(lotMode.reason)

	const { isAlive, startTimeOf } = params
	const pending = pendingOf({ root, isAlive, startTimeOf })
	const branches = new Set([params.branch, ...params.mergedBranches])
	const gate = lotMode.kind === 'gate'
	const merge = params.mergedBranches.length > 0
	const running = pending.running.filter((run) => branches.has(run.branch))
	const consequence = gate
		? RUNNING_CONSEQUENCE.gate
		: merge
			? RUNNING_CONSEQUENCE.merge
			: RUNNING_CONSEQUENCE.plain
	const owed = owedPart({ newItems: pending.new, died: pending.died })
	const gateMissing =
		gate &&
		!hasReportedRunOn({
			runs: readRuns({ root, isAlive, startTimeOf }),
			packageName: packageNameOf(root),
			branches,
			tree: typeof params.tree === 'string' ? params.tree : params.tree(),
		})
	const parts = [
		...(owed ? [owed] : []),
		...running.map((run) => `${runningLine(run)}${consequence}`),
		...(gateMissing ? [GATE_LOT_WITHOUT_RUN] : []),
	]
	const lines = [
		...pending.new.map(newSurvivorLine),
		...pending.died.map(diedRunLine),
		...(owed ? [ACT_ON_EACH] : []),
	]
	if (parts.length === 0) return { status: 'passed', detail: NOTHING_PENDING, lines: [] }
	const failed = owed !== undefined || gateMissing || (running.length > 0 && (gate || merge))
	return {
		status: failed ? 'failed' : 'warning',
		detail: parts.join(VERDICT_PART_SEPARATOR),
		lines,
	}
}

/**
 * The `mutation` setting of the lot the hand-over in `folder` commits: its archived `lot.json` when the folder
 * holds one, else the package root's `.dialecte/lot.json`; `default` when the file or its key is absent.
 * @intent read a hand-over's mutation mode, tell whether a hand-over is a gate lot
 */
export function lotModeOf(params: LotModeOfParams): MutationModeSetting {
	const archived = join(params.folder, ARCHIVED_LOT_FILE)
	if (!existsSync(archived)) return readMutationMode({ root: params.root })
	const declaration = readLotDeclaration(archived)
	// the reader names the root's lot file; this reason is about the folder's
	if ('failure' in declaration)
		return {
			kind: 'invalid',
			reason: `${archived}${declaration.failure.slice(LOT_FILE.length)}`,
		}
	const { mutation } = declaration
	if (mutation === undefined) return { kind: 'default' }
	const mode = MUTATION_MODES.find((known) => known === mutation)
	return mode
		? { kind: mode }
		: {
				kind: 'invalid',
				reason: INVALID_FOLDER_MODE.replace('{file}', archived)
					.replace('{modes}', MUTATION_MODES.join(', '))
					.replace('{value}', JSON.stringify(mutation)),
			}
}

/** `<run id> still running (pid <pid>)`, the words a running run is named with. */
export function runningLine(run: RunEntry): string {
	return RUN_RUNNING.replace('{id}', run.runId).replace('{pid}', String(run.pid))
}

/** The line a died run is named with: rerun it, or abandon it. */
export function diedRunLine(run: RunEntry): string {
	return RUN_DIED_LINE.replaceAll('{id}', run.runId)
}

function failedWith(detail: string): PendingVerdict {
	return { status: 'failed', detail, lines: [] }
}

/** `<n> new survivor(s) · <m> died run(s): dialecte mutants status`, zero parts left out; undefined when both are 0. */
function owedPart(params: {
	newItems: readonly KeyedLedgerItem[]
	died: readonly RunEntry[]
}): string | undefined {
	const counts = [
		{ count: params.newItems.length, noun: NEW_SURVIVOR_NOUN },
		{ count: params.died.length, noun: DIED_RUN_NOUN },
	]
		.filter((entry) => entry.count > 0)
		.map(counted)
	return counts.length ? `${counts.join(VERDICT_PART_SEPARATOR)}${STATUS_HINT}` : undefined
}

function newSurvivorLine(item: KeyedLedgerItem): string {
	return NEW_SURVIVOR_LINE.replace('{file}', item.file)
		.replace('{line}', String(item.line))
		.replace('{mutation}', item.mutation)
		.replace('{lot}', item.firstSeen.lot)
}

/** A run of the package, of one of the branches, reported on the tree. */
function hasReportedRunOn(params: {
	runs: readonly RunEntry[]
	packageName: string
	branches: ReadonlySet<string>
	tree: string
}): boolean {
	return params.runs.some(
		(run) =>
			run.state === 'reported' &&
			run.package === params.packageName &&
			params.branches.has(run.branch) &&
			run.tree === params.tree,
	)
}
