/**
 * `buildCardGateLines` and the hand-over card judge a stored record with the commands of the tree the card checks: a
 * merge hand-over's hook record is current when it is keyed with the merged tree's hook files, whatever the worktree's
 * own hook files hold, and a `gate --hook` record is current with the hook steps' command hash.
 */
import { writeFileSync } from 'node:fs'

import { runHookIn } from '../../../test/gate-hook.ts'
import { gitPathOf } from '../../../test/gate-records.ts'
import { writeInstalledLock } from '../../../test/handover-landing.ts'
import {
	GATES_ON_ANOTHER_TREE,
	HOOK_GATE_LINES,
	HOOK_RECORD_LINES,
	HOOK_RECORD_STEPS,
	HOOK_TIME,
	OWN_GATE_RECORD_STEPS,
	OWN_GATE_TIME,
} from '../../../test/hook-tree.constants.ts'
import { createHookTreeRepository } from '../../../test/hook-tree.ts'
import { PACKAGES_A_NEWER } from '../../../test/install-key.constants.ts'
import {
	FULL_RECORD_FILE,
	SCRATCH_REPOSITORY_TIMEOUT,
} from '../../../test/scratch-checks.constants.ts'
import { headOf, writeMergeHandover } from '../../../test/scratch-checks.ts'
import { buildCardGateLines } from './card-gates.ts'
import { readInstalledKey } from './check-key.ts'
import { storeCheckRecord } from './check-store.ts'
import { GATE_LINE_NAME, NEVER_RUN_DETAIL } from './gate-records.constants.ts'
import { hashStateTree } from './state-hash.ts'

import { describe, expect, it } from 'vitest'

import type { CardGateLine, GateRecord } from './gate-records.types.ts'

/** The lines by step name, so the order the card keeps them in is no part of what a case pins. */
function byName(lines: readonly CardGateLine[]): CardGateLine[] {
	return [...lines].sort((first, second) => first.name.localeCompare(second.name))
}

/** The worktree's own `gate --full` record of its tree: the tdd verdict and the steps before the merge. */
function writeOwnGateRecord(params: { root: string; ownTree: string }): void {
	const record: GateRecord = {
		mode: 'full',
		at: OWN_GATE_TIME,
		head: headOf(params.root),
		stateHash: hashStateTree(params.ownTree),
		steps: OWN_GATE_RECORD_STEPS,
	}
	writeFileSync(
		gitPathOf({ root: params.root, name: FULL_RECORD_FILE }),
		`${JSON.stringify(record, null, 2)}\n`,
	)
}

/** A green commit hook record of `tree`, stored with the hook files hash it was keyed with. */
function storeHookRecord(params: { root: string; tree: string; commandHash: string }): void {
	const { root, tree } = params
	storeCheckRecord({
		root,
		record: {
			mode: 'hook',
			at: HOOK_TIME,
			head: headOf(root),
			stateHash: hashStateTree(tree),
			steps: HOOK_RECORD_STEPS,
			key: { tree, ...readInstalledKey(root), commandHash: params.commandHash },
		},
	})
}

describe(
	'buildCardGateLines: a merge hand-over whose worktree hook is not the merged tree’s',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a green hook record of the merged tree keyed with the merged tree’s hook files → the card counts it: the hook’s lines are read from it and no gates ran on another tree', () => {
			const { root, tip, mergedTree, ownTree, mergedHookHash } = createHookTreeRepository()
			writeOwnGateRecord({ root, ownTree })
			storeHookRecord({ root, tree: mergedTree, commandHash: mergedHookHash })

			const lines = buildCardGateLines({ root, tree: mergedTree })
			const card = writeMergeHandover({ root, tip }).output

			expect(byName(lines.filter((line) => line.name !== 'tdd'))).toEqual(byName(HOOK_RECORD_LINES))
			expect(card).not.toContain(GATES_ON_ANOTHER_TREE)
		})

		it('a record of the merged tree keyed with the worktree’s own hook files → not current: the card reads no line from it', () => {
			const { root, mergedTree, worktreeHookHash } = createHookTreeRepository()
			storeHookRecord({ root, tree: mergedTree, commandHash: worktreeHookHash })

			expect(buildCardGateLines({ root, tree: mergedTree })).toEqual([
				{ name: GATE_LINE_NAME, status: 'failed', detail: NEVER_RUN_DETAIL },
			])
		})
	},
)

describe(
	'buildCardGateLines: a gate --hook record',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a green hook-gate record of the checked tree, as gate --hook writes it → the card counts its steps', async () => {
			const { root, ownTree } = createHookTreeRepository()
			const ran = await runHookIn({ cwd: root })
			expect(ran.exitCode).toBe(0)

			expect(byName(buildCardGateLines({ root, tree: ownTree }))).toEqual(byName(HOOK_GATE_LINES))
		})

		it('a hook-gate record made against another install → not counted: only the gate never run line is read', async () => {
			const { root, ownTree } = createHookTreeRepository()
			writeInstalledLock({ root })
			const ran = await runHookIn({ cwd: root })
			expect(ran.exitCode).toBe(0)
			const counted = byName(buildCardGateLines({ root, tree: ownTree }))
			writeInstalledLock({ root, packages: PACKAGES_A_NEWER })

			expect({ counted, afterInstall: buildCardGateLines({ root, tree: ownTree }) }).toEqual({
				counted: byName(HOOK_GATE_LINES),
				afterInstall: [{ name: GATE_LINE_NAME, status: 'failed', detail: NEVER_RUN_DETAIL }],
			})
		})
	},
)
