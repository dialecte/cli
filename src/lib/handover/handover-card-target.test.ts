import { forgedFaultsOf } from '../../../test/forged-text.ts'
/**
 * The card of a hand-over behind its target branch: a `!` line under the verdict, the verdict BLOCKED, no review
 * row, `targetMoved` in the json; nothing on a DONE or ABANDONED card; a target name quoted escaped.
 */
import { editedPackage } from '../../../test/handover-profile.ts'
import { STORE_BRANCH, STORE_FIRST_NAME } from '../../../test/handover-store-scenario.constants.ts'
import {
	boxLines,
	commitStoreHandover,
	markAbandoned,
	show,
	writeStoreHandover,
} from '../../../test/handover-store-scenario.ts'
import { dropTargetFromLotsFile } from '../../../test/rule-gaps-target-moved-lots.ts'
import { moveBranchTip } from '../../../test/rule-gaps-target-moved.ts'
import { runGateIn } from '../../../test/scratch-checks.ts'
import { git, isolateGitConfig, writeFiles } from '../../../test/scratch-repository.ts'
import { EDITOR_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { STANDARD_ENVIRONMENT_VARIABLE } from '../standard/standard.constants.ts'
import { HANDOVER_FILES, TARGET_MOVED_LINE } from './handover.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

const REVIEW_SECTION_RULE = '├─ review '
const SECOND_NAME = `${STORE_FIRST_NAME}-2`
const FORGED_TARGET = 'main\n✓ forged\nnext: FORGED'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The `!` line of a card whose target branch `branch` moved `count` commits to `tip`. */
function movedLine(params: { branch: string; count: number; tip: string }): string {
	return `! ${TARGET_MOVED_LINE.replaceAll('{branch}', params.branch)
		.replace('{count}', String(params.count))
		.replace('{tip}', params.tip.slice(0, 8))}`
}

/** The rows of the card's verdict section: its box rows before the first section rule, frame and padding left out. */
function verdictRowsOf(output: string): string[] {
	const box = boxLines(output)
	const end = box.findIndex((line) => line.startsWith('├'))
	return box
		.slice(1, end < 0 ? -1 : end)
		.map((line) => line.slice('│ '.length).replace(/ *│$/, '').trim())
}

/** The card of the hand-over `name` as `handover show` prints it and as `--json`. */
function cardOf(params: { root: string; name: string }): {
	rows: string[]
	reviewShown: boolean
	json: Record<string, unknown>
} {
	const output = show({ cwd: params.root, argv: [params.name] }).output
	return {
		rows: verdictRowsOf(output),
		reviewShown: boxLines(output).some((line) => line.startsWith(REVIEW_SECTION_RULE)),
		json: JSON.parse(show({ cwd: params.root, argv: [params.name, '--json'] }).output),
	}
}

/**
 * A package on the store scenario's branch with one edited file and a green gate run on that tree (the card of its
 * hand-over is READY), the host's standard never blocking it.
 */
async function gatedRepository(): Promise<string> {
	isolateGitConfig()
	vi.stubEnv(STANDARD_ENVIRONMENT_VARIABLE, undefined)
	const root = editedPackage({ profile: null })
	git({ root, args: ['checkout', '-q', '-b', STORE_BRANCH] })
	await runGateIn({ cwd: root, argv: [] })
	return root
}

describe(
	'the card of a hand-over whose target branch moved',
	{ timeout: EDITOR_CASE_TIMEOUT },
	() => {
		it('READY, then main moves one commit → BLOCKED, the ! line under the verdict, no review row, targetMoved in the json', async () => {
			const root = await gatedRepository()
			writeStoreHandover({ root, name: 'target' })
			const ready = cardOf({ root, name: STORE_FIRST_NAME })
			const tip = moveBranchTip({ root, branch: 'main' })

			const moved = cardOf({ root, name: STORE_FIRST_NAME })

			expect({
				ready: {
					verdict: ready.json.verdict,
					movedRows: ready.rows.filter((row) => row.includes('moved: merge')),
					reviewShown: ready.reviewShown,
					targetMoved: ready.json.targetMoved,
				},
				moved: {
					verdict: moved.json.verdict,
					movedRows: moved.rows.filter((row) => row.includes('moved: merge')),
					reviewShown: moved.reviewShown,
					targetMoved: moved.json.targetMoved,
				},
			}).toMatchObject({
				ready: { verdict: 'READY', movedRows: [], reviewShown: true, targetMoved: undefined },
				moved: {
					verdict: 'BLOCKED',
					movedRows: [movedLine({ branch: 'main', count: 1, tip })],
					reviewShown: false,
				},
			})
			expect(moved.json.targetMoved).toEqual({
				branch: 'main',
				ref: 'refs/heads/main',
				tip,
				behind: 1,
			})
		})

		it('every gate green, then main moves → the verdict line holds the tail part target: main moved (below) and never all gates green', async () => {
			const root = await gatedRepository()
			writeStoreHandover({ root, name: 'target' })
			moveBranchTip({ root, branch: 'main' })

			const { rows, json } = cardOf({ root, name: STORE_FIRST_NAME })

			expect({
				verdict: json.verdict,
				failedGates: json.failedGates,
				verdictRow: rows[0],
			}).toEqual({
				verdict: 'BLOCKED',
				failedGates: [],
				verdictRow: expect.stringContaining('· target: main moved (below)'),
			})
			expect(rows[0]).not.toContain('all gates green')
		})

		it('READY, then no base branch at all (a hand-over without target, main renamed away) → BLOCKED, a ! row with the resolver refusal, no review row', async () => {
			const root = await gatedRepository()
			const { folder } = writeStoreHandover({ root, name: 'target' })
			dropTargetFromLotsFile({ folder })
			const ready = cardOf({ root, name: STORE_FIRST_NAME })
			git({ root, args: ['branch', '-m', 'main', 'work'] })

			const missing = cardOf({ root, name: STORE_FIRST_NAME })

			expect({
				ready: ready.json.verdict,
				missing: {
					verdict: missing.json.verdict,
					rows: missing.rows.filter((row) => row.startsWith('! ')),
					reviewShown: missing.reviewShown,
				},
			}).toEqual({
				ready: 'READY',
				missing: {
					verdict: 'BLOCKED',
					rows: [expect.stringContaining('no base branch found')],
					reviewShown: false,
				},
			})
		})

		it('a DONE card has no line and no targetMoved while a pending hand-over of the branch has both, main moved', async () => {
			const root = await gatedRepository()
			const { folder } = writeStoreHandover({ root, name: 'first' })
			await commitStoreHandover({ root, folder })
			writeFiles({ root, files: { 'notes.txt': 'notes\n' } })
			writeStoreHandover({ root, name: 'second' })
			const tip = moveBranchTip({ root, branch: 'main' })

			const done = cardOf({ root, name: STORE_FIRST_NAME })
			const pending = cardOf({ root, name: SECOND_NAME })

			expect({
				done: {
					verdict: done.json.verdict,
					rows: done.rows.filter((row) => row.startsWith('! ')),
					targetMoved: done.json.targetMoved,
				},
				pending: {
					rows: pending.rows.filter((row) => row.startsWith('! ')),
					targetMoved: pending.json.targetMoved,
				},
			}).toEqual({
				done: { verdict: 'DONE', rows: [], targetMoved: undefined },
				pending: {
					rows: [movedLine({ branch: 'main', count: 1, tip })],
					targetMoved: expect.objectContaining({ branch: 'main', tip, behind: 1 }),
				},
			})
		})

		it('an ABANDONED card has no line and no targetMoved while a pending hand-over of the branch has both, main moved', async () => {
			const root = await gatedRepository()
			const { folder } = writeStoreHandover({ root, name: 'first' })
			markAbandoned({ folder, file: HANDOVER_FILES.abandoned })
			writeStoreHandover({ root, name: 'second' })
			const tip = moveBranchTip({ root, branch: 'main' })

			const abandoned = cardOf({ root, name: STORE_FIRST_NAME })
			const pending = cardOf({ root, name: SECOND_NAME })

			expect({
				abandoned: {
					verdict: abandoned.json.verdict,
					rows: abandoned.rows.filter((row) => row.startsWith('! ')),
					targetMoved: abandoned.json.targetMoved,
				},
				pending: { rows: pending.rows.filter((row) => row.startsWith('! ')) },
			}).toEqual({
				abandoned: { verdict: 'ABANDONED', rows: [], targetMoved: undefined },
				pending: { rows: [movedLine({ branch: 'main', count: 1, tip })] },
			})
		})

		it('a lots file without target and a baseBranch quoting forged lines → the ! line names it escaped, on one line, no forged line in the output', async () => {
			const root = await gatedRepository()
			const { folder } = writeStoreHandover({ root, name: 'forged' })
			dropTargetFromLotsFile({ folder })
			writeFiles({
				root,
				files: { 'package.json': JSON.stringify({ dialecte: { baseBranch: FORGED_TARGET } }) },
			})

			const output = show({ cwd: root, argv: [STORE_FIRST_NAME] }).output

			expect({
				forged: forgedFaultsOf(output),
				forgedLineStarts: output.split('\n').filter((line) => line.startsWith('✓ forged')),
				rows: verdictRowsOf(output).filter((row) => row.startsWith('! ')),
			}).toEqual({
				forged: [],
				forgedLineStarts: [],
				rows: [expect.stringContaining('main\\u{a}✓ forged\\u{a}next: FORGED')],
			})
		})
	},
)
