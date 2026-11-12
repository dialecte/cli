/**
 * `handover run` against a target branch that moved: the `target` guard refuses (exit 2, nothing committed), a
 * rehearsal goes on with a `!` line, the merges note and the other guards' exit code stay readable.
 */
import { STORE_FIRST_NAME } from '../../test/handover-store-scenario.constants.ts'
import {
	commitLotByHand,
	createBranchRepository,
	headOf,
	runIn,
	show,
	statusOf,
	subjectsOf,
	writeStoreHandover,
} from '../../test/handover-store-scenario.ts'
import { dropTargetFromLotsFile } from '../../test/rule-gaps-target-moved-lots.ts'
import { mergeMainHandover } from '../../test/rule-gaps-target-moved-merge.ts'
import { moveBranchTip } from '../../test/rule-gaps-target-moved.ts'
import { git, writeFiles } from '../../test/scratch-repository.ts'
import { HANDOVER_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { TARGET_RESUME_SUFFIX } from '../lib/handover/handover.constants.ts'

import { describe, expect, it } from 'vitest'

const CHANGES = { 'src/read.ts': 'export function read() {\n\treturn 1\n}\n' }
const SHORT_SHA = 8
const MERGE_NOTE_SHA = 12

/** The number of the merge lot in the card's note: the hand-over holds that one lot. */
const MERGE_NOTE_LOT = 1

/** The guard lines `name` as a run printed them (a pass, a warning or a refusal). */
function guardLines(params: { text: string; name: string }): string[] {
	return params.text.split('\n').filter((line) => new RegExp(`^[✓!✗] ${params.name} `).test(line))
}

/** A pattern for the target guard line of a main that moved `count` commits to `tip`, after its mark. */
function movedPattern(params: {
	mark: string
	count: number
	tip: string
	resuming?: boolean
}): RegExp {
	const suffix = params.resuming
		? TARGET_RESUME_SUFFIX.replaceAll('{branch}', 'main').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
		: ''
	return new RegExp(
		`^${params.mark} target +main moved: merge main first \\(${params.count} commit\\(s\\) on main, now ${params.tip.slice(0, SHORT_SHA)}\\)${suffix}`,
	)
}

describe('handover run: the target guard', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it('main moved one commit since the hand-over was written → ✗ target with the count and the tip, exit 2, nothing committed, HEAD and index unchanged', async () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({ root, name: 'target', changes: CHANGES })
		const before = { head: headOf(root), subjects: subjectsOf(root), status: statusOf(root) }
		const tip = moveBranchTip({ root, branch: 'main' })

		const run = await runIn({ cwd: root, argv: [folder] })

		expect({
			exitCode: run.exitCode,
			target: guardLines({ text: run.text, name: 'target' }),
			head: headOf(root),
			subjects: subjectsOf(root),
			status: statusOf(root),
		}).toEqual({
			exitCode: 2,
			target: [expect.stringMatching(movedPattern({ mark: '✗', count: 1, tip }))],
			...before,
		})
	})

	it('main not moved → ✓ target, the lot is committed, exit 0', async () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({ root, name: 'target', changes: CHANGES })

		const run = await runIn({ cwd: root, argv: [folder] })

		expect({
			exitCode: run.exitCode,
			target: guardLines({ text: run.text, name: 'target' }),
			subjects: subjectsOf(root).slice(0, 1),
		}).toEqual({
			exitCode: 0,
			target: [expect.stringMatching(/^✓ target /)],
			subjects: ['feat(read): change target'],
		})
	})

	it('--rehearse with main moved → ! target with the same line, the rehearsal goes on and ends rehearsed, the repository untouched', async () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({ root, name: 'target', changes: CHANGES })
		const head = headOf(root)
		const tip = moveBranchTip({ root, branch: 'main' })

		const run = await runIn({ cwd: root, argv: [folder, '--rehearse'] })

		expect({
			exitCode: run.exitCode,
			target: guardLines({ text: run.text, name: 'target' }),
			rehearsed: run.text.includes('rehearsed:'),
			head: headOf(root),
		}).toEqual({
			exitCode: 0,
			target: [expect.stringMatching(movedPattern({ mark: '!', count: 1, tip }))],
			rehearsed: true,
			head,
		})
	})

	it('main moves between handover show and handover run → show reads no moved line, the run refuses at run time with exit 2', async () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({ root, name: 'target', changes: CHANGES })
		const shown = show({ cwd: root, argv: [STORE_FIRST_NAME] }).output
		const head = headOf(root)
		const tip = moveBranchTip({ root, branch: 'main' })

		const run = await runIn({ cwd: root, argv: [folder] })

		expect({
			shownMoved: shown.includes('moved: merge'),
			exitCode: run.exitCode,
			target: guardLines({ text: run.text, name: 'target' }),
			head: headOf(root),
		}).toEqual({
			shownMoved: false,
			exitCode: 2,
			target: [expect.stringMatching(movedPattern({ mark: '✗', count: 1, tip }))],
			head,
		})
	})

	it('a merge lot of main, main moved since → the merges note says main is now <x> (see target), then ✗ target, exit 2, nothing committed', async () => {
		const { root, folder, mergedTip } = mergeMainHandover()
		const head = headOf(root)
		const tip = moveBranchTip({ root, branch: 'main' })

		const run = await runIn({ cwd: root, argv: [folder] })

		const lines = run.text.split('\n')
		expect({
			exitCode: run.exitCode,
			note: lines.filter((line) => line.includes('merges main at')),
			oldNote: lines.filter((line) => line.includes('moved since the review')),
			noteBeforeTarget:
				lines.findIndex((line) => line.includes('merges main at')) <
				lines.findIndex((line) => line.startsWith('✗ target')),
			target: guardLines({ text: run.text, name: 'target' }),
			head: headOf(root),
		}).toEqual({
			exitCode: 2,
			note: [
				`    lot ${MERGE_NOTE_LOT}: merges main at ${mergedTip.slice(0, MERGE_NOTE_SHA)}; main is now ${tip.slice(0, MERGE_NOTE_SHA)} (see target)`,
			],
			oldNote: [],
			noteBeforeTarget: true,
			target: [expect.stringMatching(movedPattern({ mark: '✗', count: 1, tip }))],
			head,
		})
	})

	it('another guard refusing exits 1 (a file staged: ✗ index), and with main moved on top the target guard comes first: ✗ target, exit 2, no ✗ index', async () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({ root, name: 'target', changes: CHANGES })
		git({ root, args: ['add', '--', 'src/read.ts'] })
		const staged = await runIn({ cwd: root, argv: [folder] })
		moveBranchTip({ root, branch: 'main' })

		const moved = await runIn({ cwd: root, argv: [folder] })

		expect({
			staged: {
				exitCode: staged.exitCode,
				index: guardLines({ text: staged.text, name: 'index' }),
			},
			moved: {
				exitCode: moved.exitCode,
				target: guardLines({ text: moved.text, name: 'target' }).length,
				index: guardLines({ text: moved.text, name: 'index' }),
			},
		}).toEqual({
			staged: { exitCode: 1, index: [expect.stringMatching(/^✗ index /)] },
			moved: { exitCode: 2, target: 1, index: [] },
		})
	})

	it('the first of two lots committed, main moved, the run resumed → ✗ target with the new hand-over advice, exit 2, no further commit', async () => {
		const root = createBranchRepository()
		const lots = [
			{ paths: ['src/a.ts'], message: 'feat(a): add a' },
			{ paths: ['src/b.ts'], message: 'feat(b): add b' },
		]
		const { folder } = writeStoreHandover({
			root,
			name: 'resume',
			changes: { 'src/a.ts': 'export const a = 1\n', 'src/b.ts': 'export const b = 1\n' },
			lots,
		})
		commitLotByHand({ root, paths: ['src/a.ts'], message: 'feat(a): add a' })
		const head = headOf(root)
		const tip = moveBranchTip({ root, branch: 'main' })

		const run = await runIn({ cwd: root, argv: [folder] })

		expect({
			exitCode: run.exitCode,
			target: guardLines({ text: run.text, name: 'target' }),
			head: headOf(root),
		}).toEqual({
			exitCode: 2,
			target: [expect.stringMatching(movedPattern({ mark: '✗', count: 1, tip, resuming: true }))],
			head,
		})
	})

	it('the first of two lots committed (a folder path), a later commit of the branch added a file under that folder, main moved → the card line still carries the resume suffix, as the run guard would count it', async () => {
		const root = createBranchRepository()
		const lots = [
			{ paths: ['src'], message: 'feat(a): add a' },
			{ paths: ['docs/b.md'], message: 'docs(b): add b' },
		]
		writeStoreHandover({
			root,
			name: 'resume-later',
			changes: { 'src/a.ts': 'export const a = 1\n', 'docs/b.md': 'b\n' },
			lots,
		})
		commitLotByHand({ root, paths: ['src/a.ts'], message: 'feat(a): add a' })
		writeFiles({ root, files: { 'src/extra.ts': 'export const extra = 1\n' } })
		commitLotByHand({ root, paths: ['src/extra.ts'], message: 'feat(extra): add extra' })
		const tip = moveBranchTip({ root, branch: 'main' })

		const shown = show({ cwd: root, argv: [STORE_FIRST_NAME] }).output

		// the card wraps a long line: the box rows joined back into one text, the frame and the padding left out
		const text = shown
			.split('\n')
			.map((line) =>
				line
					.replace(/^[│├└┌] ?/, '')
					.replace(/ *│$/, '')
					.trim(),
			)
			.join(' ')
			.replace(/\s+/g, ' ')
		expect(text).toContain(
			`main moved: merge main first (1 commit(s) on main, now ${tip.slice(0, SHORT_SHA)})${TARGET_RESUME_SUFFIX.replaceAll('{branch}', 'main')}`,
		)
	})

	it('no base branch at all (a hand-over without target, main renamed away) → ✗ target with the resolver refusal, exit 2, nothing committed', async () => {
		const root = createBranchRepository()
		const { folder } = writeStoreHandover({ root, name: 'target', changes: CHANGES })
		dropTargetFromLotsFile({ folder })
		git({ root, args: ['branch', '-m', 'main', 'work'] })
		const head = headOf(root)

		const run = await runIn({ cwd: root, argv: [folder] })

		expect({
			exitCode: run.exitCode,
			target: guardLines({ text: run.text, name: 'target' }),
			head: headOf(root),
		}).toEqual({
			exitCode: 2,
			target: [expect.stringMatching(/^✗ target +no base branch found/)],
			head,
		})
	})

	it('every lot committed, main moved since → the re-run exits 0 (the head guard stops first), while a new hand-over of the branch is refused at target', async () => {
		const root = createBranchRepository()
		const first = writeStoreHandover({ root, name: 'first', changes: CHANGES })
		await runIn({ cwd: root, argv: [first.folder] })
		writeFiles({ root, files: { 'src/other.ts': 'export const other = 1\n' } })
		const second = writeStoreHandover({ root, name: 'second' })
		const tip = moveBranchTip({ root, branch: 'main' })

		const rerun = await runIn({ cwd: root, argv: [first.folder] })
		const next = await runIn({ cwd: root, argv: [second.folder] })

		expect({
			rerun: rerun.exitCode,
			next: {
				exitCode: next.exitCode,
				target: guardLines({ text: next.text, name: 'target' }),
			},
		}).toEqual({
			rerun: 0,
			next: {
				exitCode: 2,
				target: [expect.stringMatching(movedPattern({ mark: '✗', count: 1, tip }))],
			},
		})
	})

	it('a merge lot of another branch that moved since the review → the old note stays, and ✓ target passes', async () => {
		const { root, folder, mergedTip } = mergeMainHandover({ branch: 'feat/other' })
		const now = moveBranchTip({ root, branch: 'feat/other' })

		const run = await runIn({ cwd: root, argv: [folder] })

		expect({
			exitCode: run.exitCode,
			note: run.text.split('\n').filter((line) => line.includes('moved since the review')),
			target: guardLines({ text: run.text, name: 'target' }),
		}).toEqual({
			exitCode: 0,
			note: [
				`    lot ${MERGE_NOTE_LOT}: feat/other moved since the review (now ${now.slice(0, MERGE_NOTE_SHA)}): the recorded tip ${mergedTip.slice(0, MERGE_NOTE_SHA)} is merged`,
			],
			target: [expect.stringMatching(/^✓ target /)],
		})
	})
})
