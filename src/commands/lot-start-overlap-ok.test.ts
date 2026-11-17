/**
 * `lot start <brief> --overlap-ok --by <who> --reason <text>` (FIX-overlap-ok): a brief whose scope meets an open lot
 * starts, the overlap recorded with who accepted it and why, and shown on the card's scope line. Without the flag the
 * overlap stays a refusal; an other lot whose scope cannot be read names no paths and stays refused with it.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { PLAN_FILE, PLAN_TEXT } from '../../test/brief-workspace.constants.ts'
import { holdWorkOf, writeHeldStoreLot, writeStoreLot } from '../../test/brief-workspace.ts'
import { BRIEF_DAMAGES, DAMAGES } from '../../test/damaged-lot-workspace.constants.ts'
import {
	briefDamagedLotIn,
	damagedLotIn,
	refusalsOf,
	replaceRecord,
} from '../../test/damaged-lot-workspace.ts'
import { createStartWorkspace, entriesOf, withJson } from '../../test/lot-start-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { buildScopeLine } from '../lib/gate-records/card-gates.ts'
import { readLotOverlaps } from '../lib/store/lot-overlaps.ts'
import { appendScopeChanges } from '../lib/store/scope-changes.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'
import { startLot } from './lot-start.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StartWorkspace } from '../../test/lot-start-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const NOW = new Date('2026-11-17T20:00:00.000Z')
/** The open lot the brief's scope (`src/dataflow/`, `src/dataflow/**\/*.test.ts`) meets. */
const OTHER_LOT = '0009-repo-sub'
const OTHER_SCOPE = ['src/dataflow/subscribe.ts']
const MET = [
	'src/dataflow meets src/dataflow/subscribe.ts',
	'src/dataflow/**/*.test.ts meets src/dataflow/subscribe.ts',
]
const BY = 'person-a'
const REASON = 'separate lines in one file'
/** A lot no go-ahead named, and the path the accepted lot widens onto meanwhile. */
const UNNAMED_LOT = '0010-repo-unnamed'
const WIDENED_PATH = 'src/dataflow/unsubscribe.ts'
/** A reason one line long, too long for one overlap record. */
const LONG_REASON = 'r'.repeat(5_000)
/** An entry id of the brief's own plan, and that plan: `PLAN_TEXT` with a lot block naming the entry. */
const PLAN_ENTRY_ID = 'RX7'
const PLAN_WITH_ENTRY = `${PLAN_TEXT}\n\`\`\`json dialecte-lots\n${JSON.stringify({
	schema: 1,
	repositories: { repo: '../../repo' },
	lots: [
		{
			id: PLAN_ENTRY_ID,
			title: 'an entry',
			kind: 'lot',
			scope: { repo: ['src/'] },
			match: { branch: 'feat/elsewhere' },
		},
	],
})}\n\`\`\`\n`
/** The folder name a case reads when the start made no lot. */
const NO_STARTED_LOT = 'no-started-lot'

/** `lot start <brief> --json` with the extra words, from the workspace. */
function startWith(params: { start: StartWorkspace; extra: string[] }) {
	return withJson(
		runLot({
			cwd: params.start.cwd,
			argv: ['start', params.start.workspace.briefPath, ...params.extra, '--json'],
			now: NOW,
		}),
	)
}

/** A workspace whose store holds the open lot the brief meets. */
function overlappedWorkspace(): StartWorkspace {
	const start = createStartWorkspace()
	writeStoreLot({ workspace: start.workspace, name: OTHER_LOT, scope: OTHER_SCOPE })
	return start
}

/** The lot folder of the lot the start made: the store's entry that is not the other lot (a missing one when none). */
function startedLotFolder(start: StartWorkspace): string {
	const [name] = entriesOf(start.store).filter((entry) => entry !== OTHER_LOT)
	return join(start.store, name ?? NO_STARTED_LOT)
}

describe('lot start --overlap-ok', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a brief meeting an open lot, --overlap-ok --by --reason → started, the overlap recorded with the lot, its met paths, who and why', () => {
		const start = overlappedWorkspace()

		const started = startWith({
			start,
			extra: ['--overlap-ok', '--by', BY, '--reason', REASON],
		})

		expect(started.exitCode).toBe(0)
		expect(readLotOverlaps({ lotFolder: startedLotFolder(start) }).overlaps).toEqual([
			{
				schema: 1,
				at: NOW.toISOString(),
				verb: 'start',
				lot: OTHER_LOT,
				met: MET,
				by: BY,
				reason: REASON,
			},
		])
	})

	it('the same brief without --overlap-ok → refused as before, no lot made', () => {
		const start = overlappedWorkspace()

		const started = startWith({ start, extra: [] })

		expect(started.exitCode).toBe(2)
		expect(refusalsOf({ json: started.json }).map((refusal) => refusal.rule)).toEqual(['overlap'])
		expect(entriesOf(start.store)).toEqual([OTHER_LOT])
	})

	it.each([{ label: 'no --by and --reason', extra: ['--overlap-ok'] }])(
		'--overlap-ok with $label → a usage refusal naming what it needs, no lot made',
		({ extra }) => {
			const start = overlappedWorkspace()

			const started = startWith({ start, extra })

			expect(started.exitCode).toBe(2)
			expect(JSON.stringify(started.json)).toContain(
				'--overlap-ok takes --by <who> and --reason <text>',
			)
			expect(entriesOf(start.store)).toEqual([OTHER_LOT])
		},
	)

	it('an other lot whose scope cannot be read (it holds every path) → still refused with --overlap-ok', () => {
		const start = createStartWorkspace()
		const [damage] = BRIEF_DAMAGES
		const other = briefDamagedLotIn({ start, brief: damage.kind })

		const started = startWith({
			start,
			extra: ['--overlap-ok', '--by', BY, '--reason', REASON],
		})

		expect(started.exitCode).toBe(2)
		expect(refusalsOf({ json: started.json }).map((refusal) => refusal.rule)).toEqual(['overlap'])
		expect(entriesOf(start.store)).toEqual([other.name])
	})

	it('a lot started with --overlap-ok → the card scope line names the overlap, who and why, as a warning', () => {
		const start = overlappedWorkspace()
		startWith({ start, extra: ['--overlap-ok', '--by', BY, '--reason', REASON] })

		expect(buildScopeLine({ folder: startedLotFolder(start), now: NOW })).toEqual({
			name: 'scope',
			status: 'warning',
			// the other lot has no worktree: its pair reads unknown (33CO 4.6)
			detail: `overlaps ${OTHER_LOT}: ${MET.join('; ')} (by ${BY}: ${REASON}) · shares ${MET.join('; ')} with ${OTHER_LOT} (forecast unknown, 0 min ago)`,
		})
	})
})

/** `lot start <brief> --overlap-ok --by --reason` with the given seams (text output). */
function startOverlapOkWith(params: {
	start: StartWorkspace
	seams?: Parameters<typeof startLot>[0]['seams']
	extra?: string[]
}) {
	return startLot({
		cwd: params.start.cwd,
		argv: [
			params.start.workspace.briefPath,
			'--overlap-ok',
			'--by',
			BY,
			'--reason',
			REASON,
			...(params.extra ?? []),
		],
		now: NOW,
		seams: params.seams,
	})
}

describe(
	'lot start --overlap-ok: what the go-ahead does not cover',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('an unnamed lot meeting the brief starts between the check and the re-check → the start fails naming it', () => {
			const start = overlappedWorkspace()

			const started = startOverlapOkWith({
				start,
				seams: {
					beforePublish: function startUnnamedLot() {
						writeHeldStoreLot({ workspace: start.workspace, name: UNNAMED_LOT, scope: OTHER_SCOPE })
					},
				},
			})

			expect(started.exitCode).toBe(1)
			expect(started.output).toContain(`overlap with ${UNNAMED_LOT}, started at the same time`)
		})

		it('the accepted lot widens between the check and the re-check (a new met pair) → the start fails naming it', () => {
			const start = overlappedWorkspace()

			const started = startOverlapOkWith({
				start,
				seams: {
					beforePublish: function widenAcceptedLot() {
						holdWorkOf({ workspace: start.workspace, name: OTHER_LOT })
						appendScopeChanges({
							lotFolder: join(start.store, OTHER_LOT),
							changes: [
								{
									schema: 1,
									at: NOW.toISOString(),
									op: 'add',
									paths: [WIDENED_PATH],
									by: BY,
									reason: REASON,
								},
							],
						})
					},
				},
			})

			expect(started.exitCode).toBe(1)
			expect(started.output).toContain(`overlap with ${OTHER_LOT}, started at the same time`)
		})

		it('the accepted lot turns damaged between the check and the re-check → the start fails naming it and its damage (33CO 4.7)', () => {
			const start = overlappedWorkspace()

			const started = startOverlapOkWith({
				start,
				seams: {
					beforePublish: function damageAcceptedLot() {
						replaceRecord({
							folder: join(start.store, OTHER_LOT),
							name: STORE_FILES.identity,
							text: '{',
						})
					},
				},
			})

			expect({
				exitCode: started.exitCode,
				damaged: started.output.includes(`${OTHER_LOT} (damaged: `),
			}).toEqual({
				exitCode: 1,
				damaged: true,
			})
		})

		it('a damaged lot whose brief scope reads and meets the brief → started with --overlap-ok, the go-ahead and the damage recorded (33CO behaviour 15)', () => {
			const start = createStartWorkspace()
			const [damage] = DAMAGES
			const damaged = damagedLotIn({ start, kind: damage.kind })

			const started = startWith({
				start,
				extra: ['--overlap-ok', '--by', BY, '--reason', REASON],
			})

			expect({
				exitCode: started.exitCode,
				overlaps: entriesOf(start.store)
					.filter((entry) => entry !== damaged.name)
					.flatMap((entry) => readLotOverlaps({ lotFolder: join(start.store, entry) }).overlaps),
			}).toEqual({
				exitCode: 0,
				overlaps: [
					expect.objectContaining({
						lot: damaged.name,
						damage: damage.reason,
						by: BY,
						reason: REASON,
					}),
				],
			})
		})

		it('a reason too long for its overlap record → refused before anything is written', () => {
			const start = overlappedWorkspace()

			const started = startWith({
				start,
				extra: ['--overlap-ok', '--by', BY, '--reason', LONG_REASON],
			})

			expect(started.exitCode).toBe(2)
			expect(JSON.stringify(started.json)).toContain('overlaps.jsonl')
			expect(entriesOf(start.store)).toEqual([OTHER_LOT])
		})

		it('--by naming a path (it would reach a public record) → refused, no lot made', () => {
			const start = overlappedWorkspace()

			const started = startWith({
				start,
				extra: ['--overlap-ok', '--by', 'src/person.ts', '--reason', REASON],
			})

			expect(started.exitCode).toBe(2)
			expect(JSON.stringify(started.json)).toContain('lot start: --by holds a path or a link')
			expect(entriesOf(start.store)).toEqual([OTHER_LOT])
		})

		it.each([
			{ label: 'a start', extra: [] },
			{ label: 'a dry run', extra: ['--dry-run'] },
		])('$label with an accepted overlap → prints it with who and why', ({ extra }) => {
			const start = overlappedWorkspace()

			const started = startOverlapOkWith({ start, extra })

			expect(started.exitCode).toBe(0)
			expect(started.output.split('\n')).toContain(
				`! overlaps ${OTHER_LOT}: ${MET.join('; ')} (by ${BY}: ${REASON})`,
			)
		})

		it("a --reason naming an entry id of the brief's own plan (it would reach a public record) → refused, no lot made", () => {
			const start = overlappedWorkspace()
			writeFileSync(join(start.workspace.briefFolder, PLAN_FILE), PLAN_WITH_ENTRY)

			const started = startWith({
				start,
				extra: ['--overlap-ok', '--by', BY, '--reason', `shares a file with ${PLAN_ENTRY_ID}`],
			})

			expect(started.exitCode).toBe(2)
			expect(JSON.stringify(started.json)).toContain('lot start: --reason holds a plan entry id')
			expect(entriesOf(start.store)).toEqual([OTHER_LOT])
		})
	},
)
