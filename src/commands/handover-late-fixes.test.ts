/**
 * Late fixes on a hand-over (33L1 6b, D19; cases 46-49): the card's `late fixes` line (a warning, never a failed
 * line) and `handover run`'s `verify` guard (after `processes`: exit 2 and nothing committed for a late fix nobody
 * verified, a rehearsal goes on with `!`, a snapshot with no state is no refusal). The hand-over folder is the lot
 * folder: its snapshots are real, its verify lines written by hand.
 */
import { STORE_FIRST_NAME, STORE_NOW } from '../../test/handover-store-scenario.constants.ts'
import {
	createBranchRepository,
	headOf,
	rehashHandover,
	runIn,
	show,
	statusOf,
	subjectsOf,
	writeStoreHandover,
} from '../../test/handover-store-scenario.ts'
import { FIRST_VERIFIER } from '../../test/late-fixes-workspace.constants.ts'
import { playStory } from '../../test/late-fixes-workspace.ts'
import { gateLinesOf } from '../../test/scratch-checks.ts'
import { HANDOVER_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LateFixesStep } from '../../test/late-fixes-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const READ_FILE = 'src/read.ts'
const READ_ONE = 'export function read() {\n\treturn 1\n}\n'
const READ_TWO = 'export function read() {\n\treturn 2\n}\n'
const READ_THREE = 'export function read() {\n\treturn 3\n}\n'
const CHANGES = { [READ_FILE]: READ_ONE }

const FIX: LateFixesStep = { edit: { [READ_FILE]: READ_TWO } }
const ONE_LINE_FIX = { by: FIRST_VERIFIER, note: 'one-line fix' }

/** A hand-over of one lot, its folder holding the snapshots and verify lines the story plays; the repository is the worktree. */
function handoverWith(steps: readonly LateFixesStep[]): { root: string; folder: string } {
	const root = createBranchRepository()
	const { folder } = writeStoreHandover({ root, name: 'late', changes: CHANGES })
	playStory({ lot: { cwd: root, lotFolder: folder }, steps })
	return { root, folder }
}

/** The card's lines about late fixes, as the gate lines of the box read (the padding squeezed). */
function lateFixesRowsOf(root: string): string[] {
	return gateLinesOf(show({ cwd: root, argv: [STORE_FIRST_NAME] }).output).filter((row) =>
		/^[✓!✗] late fixes /.test(row),
	)
}

/** The guard lines `verify` as a run printed them. */
function verifyLinesOf(text: string): string[] {
	return text.split('\n').filter((line) => /^[✓!✗] verify /.test(line))
}

describe('the card: the late fixes line', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	type Case = { title: string; steps: LateFixesStep[]; rows: string[] }

	const CASES: Case[] = [
		{
			title: 'case 46: a one-line fix after round 1',
			steps: [{ snapshot: 1 }, FIX],
			rows: [
				'! late fixes unverified since round 1 (1 file): dialecte lot verify handover --by <who> --note <text>',
			],
		},
		{
			title: 'a verified fix',
			steps: [{ snapshot: 1 }, FIX, { verifyHere: ONE_LINE_FIX }],
			rows: ['✓ late fixes verified by person-a: one-line fix'],
		},
		{
			title: 'case 47: a verify, then another edit',
			steps: [
				{ snapshot: 1 },
				FIX,
				{ verifyHere: ONE_LINE_FIX },
				{ edit: { [READ_FILE]: READ_THREE } },
			],
			rows: [
				'! late fixes unverified since round 1 (1 file): dialecte lot verify handover --by <who> --note <text>',
			],
		},
		{
			title: 'case 49: a snapshot with no state',
			steps: [{ snapshot: 1, withoutState: true }, FIX],
			rows: ['! late fixes not checked (round 1 has no state)'],
		},
	]

	for (const { title, steps, rows } of CASES)
		it(`${title} -> ${rows[0]}`, () => {
			const { root } = handoverWith(steps)

			expect(lateFixesRowsOf(root)).toEqual(rows)
		})
})

describe('handover run: the verify guard', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it('case 46: a late fix nobody verified -> ✗ verify after ✓ processes, exit 2, nothing committed, HEAD and tree unchanged', async () => {
		const { root, folder } = handoverWith([{ snapshot: 1 }, FIX])
		const before = { head: headOf(root), subjects: subjectsOf(root), status: statusOf(root) }

		const run = await runIn({ cwd: root, argv: [folder] })

		const lines = run.text.split('\n')
		expect({
			exitCode: run.exitCode,
			verify: verifyLinesOf(run.text),
			afterProcesses:
				lines.findIndex((line) => line.startsWith('✓ processes')) <
				lines.findIndex((line) => line.startsWith('✗ verify')),
			after: { head: headOf(root), subjects: subjectsOf(root), status: statusOf(root) },
		}).toEqual({
			exitCode: 2,
			verify: ['✗ verify      late fixes unverified since round 1  0.0 s'],
			afterProcesses: true,
			after: before,
		})
	})

	it('--rehearse with a late fix nobody verified -> ! verify with the same words, the rehearsal goes on and ends rehearsed', async () => {
		const { root, folder } = handoverWith([{ snapshot: 1 }, FIX])
		rehashHandover({ folder, now: STORE_NOW })
		const head = headOf(root)

		const run = await runIn({ cwd: root, argv: [folder, '--rehearse'] })

		expect({
			exitCode: run.exitCode,
			verify: verifyLinesOf(run.text),
			rehearsed: run.text.includes('rehearsed:'),
			head: headOf(root),
		}).toEqual({
			exitCode: 0,
			verify: ['! verify      late fixes unverified since round 1  0.0 s'],
			rehearsed: true,
			head,
		})
	})

	it('a late fix verified, the hand-over written again -> ✓ verify naming the person and the note, the lot is committed', async () => {
		const { root, folder } = handoverWith([{ snapshot: 1 }, FIX, { verifyHere: ONE_LINE_FIX }])
		rehashHandover({ folder, now: STORE_NOW })

		const run = await runIn({ cwd: root, argv: [folder] })

		expect({
			exitCode: run.exitCode,
			verify: verifyLinesOf(run.text),
			subjects: subjectsOf(root).slice(0, 1),
		}).toEqual({
			exitCode: 0,
			verify: ['✓ verify      late fixes verified by person-a: one-line fix  0.0 s'],
			subjects: ['feat(read): change late'],
		})
	})

	it('case 47: a verify, then another edit -> refused again', async () => {
		const { root, folder } = handoverWith([
			{ snapshot: 1 },
			FIX,
			{ verifyHere: ONE_LINE_FIX },
			{ edit: { [READ_FILE]: READ_THREE } },
		])
		const head = headOf(root)

		const run = await runIn({ cwd: root, argv: [folder] })

		expect({ exitCode: run.exitCode, verify: verifyLinesOf(run.text), head: headOf(root) }).toEqual(
			{
				exitCode: 2,
				verify: ['✗ verify      late fixes unverified since round 1  0.0 s'],
				head,
			},
		)
	})

	it('case 48: an edit reverted to the snapshot state -> ✓ verify, the lot is committed', async () => {
		const { root, folder } = handoverWith([
			{ snapshot: 1 },
			FIX,
			{ edit: { [READ_FILE]: READ_ONE } },
		])

		const run = await runIn({ cwd: root, argv: [folder] })

		expect({
			exitCode: run.exitCode,
			verify: verifyLinesOf(run.text),
			subjects: subjectsOf(root).slice(0, 1),
		}).toEqual({
			exitCode: 0,
			verify: ['✓ verify      no late fixes  0.0 s'],
			subjects: ['feat(read): change late'],
		})
	})

	it('case 49: a snapshot with no state -> ! verify, not refused, the lot is committed', async () => {
		const { root, folder } = handoverWith([{ snapshot: 1, withoutState: true }])

		const run = await runIn({ cwd: root, argv: [folder] })

		expect({
			exitCode: run.exitCode,
			verify: verifyLinesOf(run.text),
			subjects: subjectsOf(root).slice(0, 1),
		}).toEqual({
			exitCode: 0,
			verify: ['! verify      late fixes not checked (round 1 has no state)  0.0 s'],
			subjects: ['feat(read): change late'],
		})
	})

	it('no snapshot -> ✓ verify, the lot is committed', async () => {
		const { root, folder } = handoverWith([])

		const run = await runIn({ cwd: root, argv: [folder] })

		expect({
			exitCode: run.exitCode,
			verify: verifyLinesOf(run.text),
			subjects: subjectsOf(root).slice(0, 1),
		}).toEqual({
			exitCode: 0,
			verify: ['✓ verify      no late fixes  0.0 s'],
			subjects: ['feat(read): change late'],
		})
	})
})
