/** The records the gate-line cards read, written as the gate and the commit hook leave them in the git folder. */
import { writeFileSync } from 'node:fs'

import { hashHookCommand, readInstalledKey } from '../src/lib/gate-records/check-key.ts'
import { storeCheckRecord } from '../src/lib/gate-records/check-store.ts'
import { computeStateTree, hashStateTree } from '../src/lib/gate-records/state-hash.ts'
import { gitPathOf } from './gate-records.ts'
import { FOREIGN_LOCK_HASH, GATE_STEPS, HOOK_STEPS } from './merge-card-fixture.constants.ts'
import { FULL_RECORD_FILE, HOOK_RECORD_FILE } from './scratch-checks.constants.ts'
import { createBranchScenario, createCounter, headOf } from './scratch-checks.ts'
import { git } from './scratch-repository.ts'

import type { GateRecord } from '../src/lib/gate-records/gate-records.types.ts'
import type { MergeFixture } from './merge-card-fixture.types.ts'

/** A package on main and a branch `feat/x` with one commit, not merged: the merged tree is git's trial merge. */
export async function mergeFixture(): Promise<MergeFixture> {
	const { root, tip } = await createBranchScenario({
		recorded: false,
		mainMoved: false,
		hookCounter: createCounter(),
		gateCounter: createCounter(),
	})
	const mergedTree = git({ root, args: ['merge-tree', '--write-tree', 'HEAD', tip] })
		.split('\n')[0]
		.trim()
	return { root, mergedTree, ownTree: computeStateTree(root) }
}

/** The worktree's own `gate --full` record, of `tree`, as the gate leaves it in the git folder. */
export function writeOwnGateRecord(params: { root: string; tree: string; at: string }): void {
	const record: GateRecord = {
		mode: 'full',
		at: params.at,
		head: headOf(params.root),
		stateHash: hashStateTree(params.tree),
		steps: GATE_STEPS,
	}
	writeFileSync(
		gitPathOf({ root: params.root, name: FULL_RECORD_FILE }),
		`${JSON.stringify(record, null, 2)}\n`,
	)
}

/**
 * The commit hook's record of `tree`, in the worktree's own git folder and in the store, keyed as a run here would
 * key it; `foreignInstall` keys it against another `node_modules` (what a run in an install since replaced left).
 */
export function writeOwnHookRecord(params: {
	root: string
	tree: string
	at: string
	foreignInstall?: boolean
}): void {
	const installed = readInstalledKey(params.root)
	const record: GateRecord = {
		mode: 'hook',
		at: params.at,
		head: headOf(params.root),
		stateHash: hashStateTree(params.tree),
		steps: HOOK_STEPS,
		key: {
			tree: params.tree,
			...installed,
			...(params.foreignInstall && { lockHash: FOREIGN_LOCK_HASH }),
			commandHash: hashHookCommand(params.root),
		},
	}
	writeFileSync(
		gitPathOf({ root: params.root, name: HOOK_RECORD_FILE }),
		`${JSON.stringify(record, null, 2)}\n`,
	)
	storeCheckRecord({ root: params.root, record })
}
