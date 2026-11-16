/**
 * `lot start <brief> --overlap-ok --by <who> --reason <text>` (FIX-overlap-ok): a brief whose scope meets an open lot
 * starts, the overlap recorded with who accepted it and why, and shown on the card's scope line. Without the flag the
 * overlap stays a refusal; an other lot whose scope cannot be read names no paths and stays refused with it.
 */
import { join } from 'node:path'

import { writeStoreLot } from '../../test/brief-workspace.ts'
import { BRIEF_DAMAGES } from '../../test/damaged-lot-workspace.constants.ts'
import { briefDamagedLotIn, refusalsOf } from '../../test/damaged-lot-workspace.ts'
import { createStartWorkspace, entriesOf, withJson } from '../../test/lot-start-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { buildScopeLine } from '../lib/gate-records/card-gates.ts'
import { readLotOverlaps } from '../lib/store/lot-overlaps.ts'
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
		expect(readLotOverlaps({ lotFolder: startedLotFolder(start) })).toEqual([
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

		expect(buildScopeLine({ folder: startedLotFolder(start) })).toEqual({
			name: 'scope',
			status: 'warning',
			detail: `overlaps ${OTHER_LOT}: ${MET.join('; ')} (by ${BY}: ${REASON})`,
		})
	})
})
