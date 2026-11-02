/** `planRehearsal`: per lot, reuse a green record of the tree the lot leaves, or rehearse it, and say why. */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { ISO_TIME_PATTERN } from '../../../test/gate-records.constants.ts'
import { readRecordFile } from '../../../test/gate-records.ts'
import {
	BRANCH_NAME,
	FULL_RECORD_FILE,
	SCRATCH_REPOSITORY_TIMEOUT,
	SHORT_SHA_LENGTH,
	TREE_ID_PATTERN,
} from '../../../test/scratch-checks.constants.ts'
import {
	createBranchScenario,
	createCounter,
	createHookedPackage,
	createRehearsedScenario,
	createReusableScenario,
	editReadLot,
	headOf,
	readFolder,
	seedFullGate,
	writeHandoverFolder,
	writeMergeHandover,
} from '../../../test/scratch-checks.ts'
import { git, writeFiles } from '../../../test/scratch-repository.ts'
import { commonGitDirOf, treeOfWorkingFiles } from '../../../test/scratch-tree.ts'
import { CHECK_STORE_FOLDER } from '../gate-records/gate-records.constants.ts'
import { planRehearsal } from './rehearsal-plan.ts'

import { describe, expect, it } from 'vitest'

import type { RehearsedVariant } from '../../../test/scratch-checks.types.ts'
import type { GateRecord } from '../gate-records/gate-records.types.ts'

function short(tree: string): string {
	return tree.slice(0, SHORT_SHA_LENGTH)
}

describe('planRehearsal: a plain lot', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a green gate --full of the tree the lot leaves → reused, with the reason and the record named', async () => {
		const { root, out } = await createReusableScenario()
		const tree = treeOfWorkingFiles(root)
		const gate = readRecordFile<GateRecord>({ root, name: FULL_RECORD_FILE })

		expect(planRehearsal({ handover: readFolder(out), full: false })).toEqual([
			{
				lot: 1,
				tree,
				decision: 'reused',
				reason: `green gate --full on tree ${short(tree)}`,
				record: { mode: 'full', at: gate?.at, head: headOf(root) },
			},
		])
	})

	const REHEARSED: RehearsedVariant[] = [
		'no gate record',
		'a gate of an earlier tree',
		'the lot changes package-lock.json',
		'the hook stages files',
		'node_modules/.package-lock.json changed since the gate',
		'a linked dependency changed since the gate',
		'--full',
	]

	for (const variant of REHEARSED)
		it(`${variant} → rehearsed, with its reason`, async () => {
			const scenario = await createRehearsedScenario(variant)

			expect(planRehearsal({ handover: readFolder(scenario.out), full: scenario.full })).toEqual([
				expect.objectContaining({
					lot: 1,
					tree: expect.stringMatching(TREE_ID_PATTERN),
					decision: 'rehearsed',
					reason: scenario.reason ?? expect.stringMatching(/\S/),
				}),
			])
		})

	it('two lots, the first lot’s tree with a green gate --full, the second’s without → the first reused, the second rehearsed, each with its tree', async () => {
		const root = createHookedPackage({ hookCounter: createCounter(), gateCounter: createCounter() })
		writeFiles({ root, files: { 'src/read.ts': 'export function read() {\n\treturn 1\n}\n' } })
		const firstTree = treeOfWorkingFiles(root)
		await seedFullGate(root)
		editReadLot(root)
		const secondTree = treeOfWorkingFiles(root)
		const { out } = writeHandoverFolder({
			root,
			lots: [
				{ paths: ['src/read.ts'], message: 'feat(read): read answers one' },
				{ paths: ['CHANGELOG.md'], message: 'docs(changelog): read answers one' },
			],
		})

		expect(planRehearsal({ handover: readFolder(out), full: false })).toEqual([
			expect.objectContaining({
				lot: 1,
				tree: firstTree,
				decision: 'reused',
				reason: `green gate --full on tree ${short(firstTree)}`,
			}),
			expect.objectContaining({
				lot: 2,
				tree: secondTree,
				decision: 'rehearsed',
				reason: `no green gate --full on tree ${short(secondTree)}`,
			}),
		])
	})
})

describe('planRehearsal: what a record may answer', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a green gate --full --base <ref> of the tree → reused: the base reads the tdd step only, the command is the same', async () => {
		const { root, out } = await createReusableScenario({ gateArgv: ['--full', '--base', 'HEAD'] })
		const tree = treeOfWorkingFiles(root)

		expect(planRehearsal({ handover: readFolder(out), full: false })).toEqual([
			expect.objectContaining({
				lot: 1,
				decision: 'reused',
				reason: `green gate --full on tree ${short(tree)}`,
			}),
		])
	})

	it('a store file of the lot tree that holds a record without steps → ignored: rehearsed as if no gate ran, no crash', async () => {
		const { root, out } = await createReusableScenario()
		const tree = treeOfWorkingFiles(root)
		const key = readRecordFile<GateRecord>({ root, name: FULL_RECORD_FILE })?.key
		writeFileSync(
			join(commonGitDirOf(root), CHECK_STORE_FOLDER, `${tree}.json`),
			JSON.stringify([{ mode: 'full', at: '2999-01-01T00:00:00.000Z', head: headOf(root), key }]),
		)

		expect(() => planRehearsal({ handover: readFolder(out), full: false })).not.toThrow()
		expect(planRehearsal({ handover: readFolder(out), full: false })).toEqual([
			expect.objectContaining({
				decision: 'rehearsed',
				reason: `no green gate --full on tree ${short(tree)}`,
			}),
		])
	})

	it('a green gate record with no step → not reused: rehearsed', async () => {
		const { root, out } = await createReusableScenario()
		const tree = treeOfWorkingFiles(root)
		const record = readRecordFile<GateRecord>({ root, name: FULL_RECORD_FILE })
		writeFileSync(
			join(commonGitDirOf(root), CHECK_STORE_FOLDER, `${tree}.json`),
			JSON.stringify([{ ...record, steps: [] }]),
		)

		expect(planRehearsal({ handover: readFolder(out), full: false })).toEqual([
			expect.objectContaining({ decision: 'rehearsed' }),
		])
	})
})

describe('planRehearsal: a merge lot', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it("the branch commit's hook record is in the store and main did not move → reused: green hook record of the tip's tree", async () => {
		const { root, tip } = await createBranchScenario({
			recorded: true,
			mainMoved: false,
			hookCounter: createCounter(),
			gateCounter: createCounter(),
		})
		const { out } = writeMergeHandover({ root, tip })
		const tipTree = git({ root, args: ['rev-parse', `${tip}^{tree}`] }).trim()

		expect(planRehearsal({ handover: readFolder(out), full: false })).toEqual([
			{
				lot: 1,
				tree: tipTree,
				decision: 'reused',
				reason: `green hook record of the tip's tree ${short(tipTree)}`,
				record: { mode: 'hook', at: expect.stringMatching(ISO_TIME_PATTERN), head: tip },
			},
		])
	})

	it('main moved after the cut (no conflict) → rehearsed: main moved, the merge tree and the tip’s named', async () => {
		const { root, tip } = await createBranchScenario({
			recorded: true,
			mainMoved: true,
			hookCounter: createCounter(),
			gateCounter: createCounter(),
		})
		const { out } = writeMergeHandover({ root, tip })
		const tipTree = git({ root, args: ['rev-parse', `${tip}^{tree}`] }).trim()
		const mergeTree = git({ root, args: ['merge-tree', '--write-tree', 'main', BRANCH_NAME] })
			.split('\n')[0]
			.trim()

		expect(planRehearsal({ handover: readFolder(out), full: false })).toEqual([
			expect.objectContaining({
				lot: 1,
				tree: mergeTree,
				decision: 'rehearsed',
				reason: `main moved: the merge leaves tree ${short(mergeTree)}, the tip holds ${short(tipTree)}`,
			}),
		])
	})

	it("the tree equals the tip's but nothing recorded it → rehearsed: no green record of the tip's tree", async () => {
		const { root, tip } = await createBranchScenario({
			recorded: false,
			mainMoved: false,
			hookCounter: createCounter(),
			gateCounter: createCounter(),
		})
		const { out } = writeMergeHandover({ root, tip })
		const tipTree = git({ root, args: ['rev-parse', `${tip}^{tree}`] }).trim()

		expect(planRehearsal({ handover: readFolder(out), full: false })).toEqual([
			expect.objectContaining({
				lot: 1,
				tree: tipTree,
				decision: 'rehearsed',
				reason: `no green record of the tip's tree ${short(tipTree)}`,
			}),
		])
	})

	it('the branch commit changes package-lock.json (hook record in the store, main unchanged) → rehearsed, whatever the record', async () => {
		const { root, tip } = await createBranchScenario({
			recorded: true,
			mainMoved: false,
			lockChange: true,
			hookCounter: createCounter(),
			gateCounter: createCounter(),
		})
		const { out } = writeMergeHandover({ root, tip })

		expect(planRehearsal({ handover: readFolder(out), full: false })).toEqual([
			expect.objectContaining({
				lot: 1,
				decision: 'rehearsed',
				reason: expect.stringMatching(/package-lock\.json/),
			}),
		])
	})

	it("no hook record but a green gate --full of the tip's tree, main unchanged → reused: green full record of the tip's tree", async () => {
		const { root, tip } = await createBranchScenario({
			recorded: false,
			mainMoved: false,
			gateOnTip: true,
			hookCounter: createCounter(),
			gateCounter: createCounter(),
		})
		const { out } = writeMergeHandover({ root, tip })
		const tipTree = git({ root, args: ['rev-parse', `${tip}^{tree}`] }).trim()

		expect(planRehearsal({ handover: readFolder(out), full: false })).toEqual([
			{
				lot: 1,
				tree: tipTree,
				decision: 'reused',
				reason: `green full record of the tip's tree ${short(tipTree)}`,
				record: { mode: 'full', at: expect.stringMatching(ISO_TIME_PATTERN), head: tip },
			},
		])
	})

	it('the reusable merge with full → rehearsed: --full', async () => {
		const { root, tip } = await createBranchScenario({
			recorded: true,
			mainMoved: false,
			hookCounter: createCounter(),
			gateCounter: createCounter(),
		})
		const { out } = writeMergeHandover({ root, tip })

		expect(planRehearsal({ handover: readFolder(out), full: true })).toEqual([
			expect.objectContaining({ lot: 1, decision: 'rehearsed', reason: '--full' }),
		])
	})
})
