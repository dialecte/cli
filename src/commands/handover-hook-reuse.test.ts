/**
 * `handover run` after a hook that reused a green `gate --full`: the hook record is keyed by the tree the
 * commit records, the reuse line is read into the note and the card, and a merge lot is not marked stale.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	HOOK_GATE_COMMAND,
	HOOK_TREE_LENGTH,
	TEST_HOOK_STEP,
	WRITTEN_REUSE_AT,
	WRITTEN_REUSE_HEAD,
	WRITTEN_REUSE_TREE,
} from '../../test/gate-hook.constants.ts'
import { readRecordFile } from '../../test/gate-records.ts'
import {
	BRANCH_NAME,
	HOOK_RECORD_FILE,
	READ_LOT,
	SCRATCH_REPOSITORY_TIMEOUT,
	WRITER_CLI,
} from '../../test/scratch-checks.constants.ts'
import {
	countRuns,
	createBranchScenario,
	createCounter,
	createHookedPackage,
	editReadLot,
	gateLinesOf,
	runFolder,
	writeHandoverFolder,
	writeMergeHandover,
	writeReadLotHandover,
} from '../../test/scratch-checks.ts'
import { git, writeFiles } from '../../test/scratch-repository.ts'
import { readTreeRecords } from '../lib/gate-records/check-store.ts'
import {
	HOOK_RECORD_MODE,
	TREE_CHANGED_SUFFIX,
} from '../lib/gate-records/gate-records.constants.ts'
import { OTHER_TREE_GATES } from '../lib/handover/handover.constants.ts'
import { runHandover } from './handover.ts'

import { describe, expect, it } from 'vitest'

import type { GateRecord } from '../lib/gate-records/gate-records.types.ts'

const REUSE_LINE = `gate --hook: tests reused from gate --full green on tree ${WRITTEN_REUSE_TREE} at ${WRITTEN_REUSE_AT} (HEAD ${WRITTEN_REUSE_HEAD})`

/** A shell command printing each line as given. */
function printLines(lines: readonly string[]): string {
	return `printf '%s\\n' ${lines.map((line) => `'${line.replaceAll("'", "'\\''")}'`).join(' ')}`
}

describe(
	'handover run: the hook record holds the committed tree',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it("two lots, the second lot's file modified in the working files when the first commits → the first commit's hook record is keyed by the tree it recorded", async () => {
			const root = createHookedPackage({
				hookCounter: createCounter(),
				gateCounter: createCounter(),
			})
			editReadLot(root)
			writeFiles({ root, files: { 'README.md': 'scratch, edited for the second lot\n' } })
			const { out } = writeHandoverFolder({
				root,
				lots: [READ_LOT, { paths: ['README.md'], message: 'docs(readme): edited' }],
			})

			const ran = await runFolder({ out })

			const firstCommitTree = git({ root, args: ['rev-parse', 'HEAD~1^{tree}'] }).trim()
			expect(ran.exitCode).toBe(0)
			expect(readTreeRecords({ root, tree: firstCommitTree })).toEqual([
				expect.objectContaining({ mode: HOOK_RECORD_MODE }),
			])
		})
	},
)

describe('handover run: a hook that reused', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('the hook output holds the reuse line under test:hook → the recorded step is passed with the note naming the reused run', async () => {
		const root = createHookedPackage({
			hookCounter: createCounter(),
			gateCounter: createCounter(),
			hookExtra: printLines([
				'',
				`> demo@1.0.0 ${TEST_HOOK_STEP}`,
				'> node src/cli.ts gate --hook',
				REUSE_LINE,
			]),
		})
		editReadLot(root)
		const { out } = writeReadLotHandover(root)

		const ran = await runFolder({ out })

		expect(ran.exitCode).toBe(0)
		expect(
			readRecordFile<GateRecord>({ root, name: HOOK_RECORD_FILE })?.steps.find(
				(step) => step.name === TEST_HOOK_STEP,
			),
		).toMatchObject({
			status: 'passed',
			note: `reused gate --full of ${WRITTEN_REUSE_AT} (HEAD ${WRITTEN_REUSE_HEAD})`,
		})
	})

	it('the hook output holds the reuse line → the card line says reused by the hook, never (the tree changed since)', async () => {
		const root = createHookedPackage({
			hookCounter: createCounter(),
			gateCounter: createCounter(),
			hookExtra: printLines([
				'',
				`> demo@1.0.0 ${TEST_HOOK_STEP}`,
				'> node src/cli.ts gate --hook',
				REUSE_LINE,
			]),
		})
		editReadLot(root)
		const { out } = writeReadLotHandover(root)

		const ran = await runFolder({ out })

		const lines = gateLinesOf(ran.text).filter((line) => line.startsWith(`✓ ${TEST_HOOK_STEP}`))
		expect(lines).toEqual([expect.stringMatching(/^✓ test:hook reused by the hook\b/)])
		expect(lines.join('\n')).not.toContain(TREE_CHANGED_SUFFIX.trim())
	})
})

describe(
	'handover run: a merge lot whose hook runs gate --hook',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('the branch tip tree has a green gate --full, main did not move → the hook reuses (no test step runs), the card holds no stale line and no other-tree header', async () => {
			const gateCounter = createCounter()
			const { root, tip } = await createBranchScenario({
				recorded: false,
				mainMoved: false,
				hookCounter: createCounter(),
				gateCounter,
				gateOnTip: true,
				hookExtra: HOOK_GATE_COMMAND,
			})
			const runsBefore = countRuns(gateCounter)
			const tipTree = git({ root, args: ['rev-parse', `${tip}^{tree}`] }).trim()
			const { out } = writeMergeHandover({ root, tip })
			// the tree set by hand and rehashed stands in for a rehearsal's printed tree
			const lotsPath = join(out, 'lots.json')
			const lotsFile = JSON.parse(readFileSync(lotsPath, 'utf8'))
			lotsFile.lots[0].tree = tipTree
			writeFileSync(lotsPath, JSON.stringify(lotsFile))
			expect(runHandover({ argv: [lotsPath, '--rehash'], cliPath: WRITER_CLI }).exitCode).toBe(0)

			const ran = await runFolder({ out })

			expect(ran.exitCode).toBe(0)
			// a run prints a hook's summary and flagged lines only: the reuse line is in the full log it names
			const logPath = /full log: (\S+)/.exec(ran.text)?.[1] ?? ''
			expect(readFileSync(logPath, 'utf8')).toContain(
				`gate --hook: tests reused from gate --full green on tree ${tipTree.slice(0, HOOK_TREE_LENGTH)}`,
			)
			expect(countRuns(gateCounter) - runsBefore).toBe(0)
			expect(
				gateLinesOf(ran.text).filter((line) => line.endsWith(TREE_CHANGED_SUFFIX.trim())),
			).toEqual([])
			expect(
				gateLinesOf(ran.text).filter((line) => line.startsWith(`✓ ${TEST_HOOK_STEP}`)),
			).toEqual([expect.stringMatching(/^✓ test:hook reused by the hook\b/)])
			expect(ran.text).not.toContain(OTHER_TREE_GATES.split(':')[0])
			expect(git({ root, args: ['rev-parse', 'HEAD^{tree}'] }).trim()).toBe(tipTree)
			expect(readRecordFile<GateRecord>({ root, name: HOOK_RECORD_FILE })?.key?.tree).toBe(tipTree)
		})

		it('a merge lot then a plain lot whose file is edited in the working files → the merge commit runs with that edit present: its hook record is stored under the merge commit tree', async () => {
			const { root, tip } = await createBranchScenario({
				recorded: false,
				mainMoved: false,
				hookCounter: createCounter(),
				gateCounter: createCounter(),
				gateOnTip: true,
				hookExtra: HOOK_GATE_COMMAND,
			})
			const tipTree = git({ root, args: ['rev-parse', `${tip}^{tree}`] }).trim()
			writeFiles({ root, files: { 'README.md': 'scratch, edited for the plain lot\n' } })
			const { out } = writeHandoverFolder({
				root,
				lots: [
					{
						kind: 'merge',
						branch: BRANCH_NAME,
						tip,
						resolved: {},
						message: 'merge: bring feat/x in',
						tree: tipTree,
					},
					{ paths: ['README.md'], message: 'docs(readme): edited' },
				],
			})

			const ran = await runFolder({ out })

			expect(ran.exitCode).toBe(0)
			expect(git({ root, args: ['rev-parse', 'HEAD~1^{tree}'] }).trim()).toBe(tipTree)
			expect(readTreeRecords({ root, tree: tipTree })).toContainEqual(
				expect.objectContaining({ mode: HOOK_RECORD_MODE }),
			)
		})
	},
)

describe(
	'handover run: a hook whose gate --hook ran the tests',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('no green gate --full of the committed tree → the real gate --hook runs the test step; the hook record counts its tests under test:hook, no reuse note', async () => {
			const gateCounter = createCounter()
			const root = createHookedPackage({
				hookCounter: createCounter(),
				gateCounter,
				hookExtra: HOOK_GATE_COMMAND,
			})
			editReadLot(root)
			const { out } = writeReadLotHandover(root)

			const ran = await runFolder({ out })

			const step = readRecordFile<GateRecord>({ root, name: HOOK_RECORD_FILE })?.steps.find(
				(recorded) => recorded.name === TEST_HOOK_STEP,
			)
			expect(ran.exitCode).toBe(0)
			expect(countRuns(gateCounter)).toBe(1)
			expect(step).toEqual({
				name: TEST_HOOK_STEP,
				status: 'passed',
				counts: { tests: { passed: 4, failed: 0, skipped: 0, total: 4 } },
			})
		})
	},
)
