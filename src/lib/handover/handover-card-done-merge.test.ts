/**
 * The DONE card of a merge hand-over: the hook proved the merged tree and the tdd verdict is the worktree's own
 * lot tree's, so the card neither says the gates ran on another tree nor flags the tdd line stale.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { gitPathOf } from '../../../test/gate-records.ts'
import { boxLines, show } from '../../../test/handover-store-scenario.ts'
import {
	BRANCH_NAME,
	FULL_RECORD_FILE,
	HOOK_RECORD_FILE,
} from '../../../test/scratch-checks.constants.ts'
import {
	createBranchScenario,
	createCounter,
	headOf,
	runFolder,
	writeHandoverFolder,
} from '../../../test/scratch-checks.ts'
import { git } from '../../../test/scratch-repository.ts'
import { HANDOVER_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { hashHookCommand, readInstalledKey } from '../gate-records/check-key.ts'
import { storeCheckRecord } from '../gate-records/check-store.ts'
import { CHECK_STORE_FOLDER } from '../gate-records/gate-records.constants.ts'
import { computeStateTree, hashStateTree } from '../gate-records/state-hash.ts'

import { describe, expect, it } from 'vitest'

import type { JsonCard } from '../../../test/handover-profile.types.ts'
import type { GateRecord, RecordedStep } from '../gate-records/gate-records.types.ts'
import type { MergeLotPlan } from './handover.types.ts'

/** The time of the worktree's gate record, and a later one for the hook record of the merged tree. */
const GATE_TIME = '2026-11-06T10:00:00.000Z'
const HOOK_TIME = '2026-11-06T11:00:00.000Z'

/** git's empty tree: a tree that is neither the worktree's nor the merge's. */
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

/** The tdd verdict the worktree's own gate recorded on its tree before the merge. */
const TDD_STEP_BEFORE_MERGE: RecordedStep = {
	name: 'tdd',
	status: 'passed',
	counts: {},
	note: '12 case(s) of the change',
	cases: [],
}

/** What the commit hook proved on the merged tree. */
const HOOK_STEPS: RecordedStep[] = [
	{ name: 'check', status: 'passed', counts: {} },
	{ name: 'build', status: 'passed', counts: {} },
]

/**
 * A package on main with a branch holding one commit, not merged; the worktree's gate record (tdd green) of its
 * own tree and a newer hook record of the merged tree stand, and the merge hand-over with that tree is written.
 */
async function provenMergeHandover(): Promise<{ root: string; out: string; mergedTree: string }> {
	const { root, tip } = await createBranchScenario({
		recorded: false,
		mainMoved: false,
		hookCounter: createCounter(),
		gateCounter: createCounter(),
	})
	const mergedTree = git({ root, args: ['merge-tree', '--write-tree', 'HEAD', tip] })
		.split('\n')[0]
		.trim()
	const gate: GateRecord = {
		mode: 'full',
		at: GATE_TIME,
		head: headOf(root),
		stateHash: hashStateTree(computeStateTree(root)),
		steps: [TDD_STEP_BEFORE_MERGE, ...HOOK_STEPS],
	}
	writeFileSync(gitPathOf({ root, name: FULL_RECORD_FILE }), `${JSON.stringify(gate, null, 2)}\n`)
	const hook: GateRecord = {
		mode: 'hook',
		at: HOOK_TIME,
		head: headOf(root),
		stateHash: hashStateTree(mergedTree),
		steps: HOOK_STEPS,
		key: { tree: mergedTree, ...readInstalledKey(root), commandHash: hashHookCommand(root) },
	}
	writeFileSync(gitPathOf({ root, name: HOOK_RECORD_FILE }), `${JSON.stringify(hook, null, 2)}\n`)
	storeCheckRecord({ root, record: hook })
	const mergeLot: MergeLotPlan = {
		kind: 'merge',
		branch: BRANCH_NAME,
		tip,
		resolved: {},
		message: 'merge: bring feat/x in',
		tree: mergedTree,
	}
	return { root, out: writeHandoverFolder({ root, lots: [mergeLot] }).out, mergedTree }
}

/**
 * The hook records of the merged tree replaced by one of another tree (git's empty tree), as if the hook had
 * proved nothing about the merge: the stored copies of the merged tree emptied, the worktree's own record swapped.
 */
function leaveOnlyAnotherTreeHook(params: { root: string; mergedTree: string }): void {
	const { root } = params
	const common = git({
		root,
		args: ['rev-parse', '--path-format=absolute', '--git-common-dir'],
	}).trim()
	const stored = join(common, CHECK_STORE_FOLDER, `${params.mergedTree}.json`)
	mkdirSync(dirname(stored), { recursive: true })
	writeFileSync(stored, '[]\n')
	const other: GateRecord = {
		mode: 'hook',
		at: HOOK_TIME,
		head: headOf(root),
		stateHash: hashStateTree(EMPTY_TREE),
		steps: HOOK_STEPS,
		key: { tree: EMPTY_TREE, ...readInstalledKey(root), commandHash: hashHookCommand(root) },
	}
	writeFileSync(gitPathOf({ root, name: HOOK_RECORD_FILE }), `${JSON.stringify(other, null, 2)}\n`)
}

describe('the DONE card of a merge hand-over', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it('the hook proved the merged tree → DONE, no gates ran on another tree line, no stale tdd line', async () => {
		const { out } = await provenMergeHandover()

		const ran = await runFolder({ out })

		expect(ran.exitCode).toBe(0)
		const box = boxLines(ran.text)
		expect({
			done: box.some((line) => line.startsWith('│ DONE ')),
			otherTree: box.filter((line) => line.includes('gates ran on another tree')),
			staleTdd: box.filter((line) => /tdd .*\(the tree changed since\)/.test(line)),
		}).toEqual({ done: true, otherTree: [], staleTdd: [] })
	})

	it('no hook record of the merged tree, only one of another tree → still DONE with gates ran on another tree: tdd', async () => {
		const { root, out, mergedTree } = await provenMergeHandover()
		const ran = await runFolder({ out })
		expect(ran.exitCode).toBe(0)
		leaveOnlyAnotherTreeHook({ root, mergedTree })

		const card = show({ cwd: root, argv: [out, '--json'] })

		const data = JSON.parse(card.output) as JsonCard
		expect({ verdict: data.verdict, otherTree: data.otherTreeGates.includes('tdd') }).toEqual({
			verdict: 'DONE',
			otherTree: true,
		})
	})
})
