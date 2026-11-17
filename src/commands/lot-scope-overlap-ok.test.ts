/**
 * `lot scope <id> --add <path> --overlap-ok --by <who> --reason <text>` (FIX-overlap-ok): an add meeting an open lot is
 * written, and the overlap recorded with who accepted it and why; without the flag the add stays refused.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { holdWorkOf, writeHeldStoreLot, writeStoreLot } from '../../test/brief-workspace.ts'
import { BRIEF_DAMAGES, DAMAGES } from '../../test/damaged-lot-workspace.constants.ts'
import { briefDamagedLotIn, damagedLotIn } from '../../test/damaged-lot-workspace.ts'
import { startRealLot } from '../../test/lot-handover-workspace.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { readLotOverlaps } from '../lib/store/lot-overlaps.ts'
import { readLotScope } from '../lib/store/lot-records.ts'
import { appendScopeChanges } from '../lib/store/scope-changes.ts'
import { STORE_FILES } from '../lib/store/store.constants.ts'
import { runLotScope } from './lot-scope.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LotHandoverWorkspace } from '../../test/lot-handover-workspace.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const NOW = new Date('2026-11-17T20:00:00.000Z')
/** The open lot the add meets, and what it holds. */
const OTHER_LOT = '0009-repo-docs'
const ADDED = 'docs/setup.md'
const BY = 'person-a'
const REASON = 'separate lines in one file'
/** A lot no go-ahead named. */
const UNNAMED_LOT = '0010-repo-unnamed'

/** A started lot and an open lot holding `docs/`. */
function lotBesideDocsLot(): LotHandoverWorkspace {
	const lot = startRealLot()
	writeStoreLot({ workspace: lot.start.workspace, name: OTHER_LOT, scope: ['docs/'] })
	return lot
}

/** `lot scope <lot> --add <ADDED> --by --reason` with the extra words, from the main checkout. */
function addWith(params: { lot: LotHandoverWorkspace; extra: string[] }) {
	return runLot({
		cwd: params.lot.start.cwd,
		argv: [
			'scope',
			params.lot.lotName,
			'--add',
			ADDED,
			'--by',
			BY,
			'--reason',
			REASON,
			...params.extra,
		],
		now: NOW,
	})
}

describe('lot scope --overlap-ok', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('an add meeting an open lot, --overlap-ok → added, the overlap recorded with the lot, its met paths, who and why', () => {
		const lot = lotBesideDocsLot()

		const result = addWith({ lot, extra: ['--overlap-ok'] })

		expect(result.exitCode).toBe(0)
		expect(readLotScope({ lotFolder: lot.lotFolder })).toContain(ADDED)
		expect(readLotOverlaps({ lotFolder: lot.lotFolder }).overlaps).toEqual([
			{
				schema: 1,
				at: NOW.toISOString(),
				verb: 'scope',
				lot: OTHER_LOT,
				met: [`${ADDED} meets docs`],
				by: BY,
				reason: REASON,
			},
		])
	})

	it('the same add without --overlap-ok → refused as before, nothing written', () => {
		const lot = lotBesideDocsLot()

		const result = addWith({ lot, extra: [] })

		expect(result.exitCode).toBe(2)
		expect(result.output).toContain(`the added paths meet the open lot ${OTHER_LOT}`)
		expect(readLotScope({ lotFolder: lot.lotFolder })).not.toContain(ADDED)
	})
	it('the overlap record cannot be written (overlaps.jsonl is a folder) → exit 1 naming it, the add taken back', () => {
		const lot = lotBesideDocsLot()
		mkdirSync(join(lot.lotFolder, STORE_FILES.overlaps))

		const result = addWith({ lot, extra: ['--overlap-ok'] })

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain(`lot scope: ${lot.lotName}: the overlap could not be recorded:`)
		expect(readLotScope({ lotFolder: lot.lotFolder })).not.toContain(ADDED)
	})
})

/** `lot scope <lot> --add <ADDED> --overlap-ok --by --reason` with the seams, from the main checkout. */
function addOverlapOkWith(params: { lot: LotHandoverWorkspace; afterAppend: () => void }) {
	return runLotScope({
		cwd: params.lot.start.cwd,
		argv: [params.lot.lotName, '--add', ADDED, '--overlap-ok', '--by', BY, '--reason', REASON],
		now: NOW,
		seams: { afterAppend: params.afterAppend },
	})
}

describe(
	'lot scope --overlap-ok: what the go-ahead does not cover',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('an unnamed lot meeting the add starts meanwhile → the add is taken back naming it', () => {
			const lot = lotBesideDocsLot()

			const result = addOverlapOkWith({
				lot,
				afterAppend: function startUnnamedLot() {
					writeHeldStoreLot({ workspace: lot.start.workspace, name: UNNAMED_LOT, scope: [ADDED] })
				},
			})

			expect(result.exitCode).toBe(2)
			expect(result.output).toContain(
				`the added paths meet the open lot ${UNNAMED_LOT} (changed meanwhile)`,
			)
			expect(readLotScope({ lotFolder: lot.lotFolder })).not.toContain(ADDED)
		})

		it('the accepted lot widens meanwhile (a new met pair) → the add is taken back naming it', () => {
			const lot = lotBesideDocsLot()

			const result = addOverlapOkWith({
				lot,
				afterAppend: function widenAcceptedLot() {
					holdWorkOf({ workspace: lot.start.workspace, name: OTHER_LOT })
					appendScopeChanges({
						lotFolder: join(lot.start.store, OTHER_LOT),
						changes: [
							{
								schema: 1,
								at: NOW.toISOString(),
								op: 'add',
								paths: [ADDED],
								by: BY,
								reason: REASON,
							},
						],
					})
				},
			})

			expect(result.exitCode).toBe(2)
			expect(result.output).toContain(
				`the added paths meet the open lot ${OTHER_LOT} (changed meanwhile)`,
			)
			expect(readLotScope({ lotFolder: lot.lotFolder })).not.toContain(ADDED)
		})

		it('the overlap record is written before the add (it stands when the add does)', () => {
			const lot = lotBesideDocsLot()
			const seen: number[] = []

			addOverlapOkWith({
				lot,
				afterAppend: function countRecords() {
					seen.push(readLotOverlaps({ lotFolder: lot.lotFolder }).overlaps.length)
				},
			})

			expect(seen).toEqual([1])
		})

		it('a damaged lot whose scope reads meets the add → added with --overlap-ok, the go-ahead and the damage recorded (33CO behaviour 15)', () => {
			const lot = startRealLot()
			const name = damagedLotIn({ start: lot.start, kind: DAMAGES[0].kind, scope: ['docs/'] }).name

			const result = addWith({ lot, extra: ['--overlap-ok'] })

			expect({
				exitCode: result.exitCode,
				added: readLotScope({ lotFolder: lot.lotFolder }).includes(ADDED),
				overlaps: readLotOverlaps({ lotFolder: lot.lotFolder }).overlaps.map((record) => ({
					lot: record.lot,
					damage: record.damage,
				})),
			}).toEqual({
				exitCode: 0,
				added: true,
				overlaps: [{ lot: name, damage: DAMAGES[0].reason }],
			})
		})

		it.each([
			{
				label: 'a lot whose scope cannot be read',
				other: (lot: LotHandoverWorkspace) =>
					briefDamagedLotIn({ start: lot.start, brief: BRIEF_DAMAGES[0].kind }).name,
			},
		])(
			'$label meets the add → refused with --overlap-ok, saying why it cannot accept it',
			({ other }) => {
				const lot = startRealLot()
				const name = other(lot)

				const result = addWith({ lot, extra: ['--overlap-ok'] })

				expect(result.exitCode).toBe(2)
				expect(result.output).toContain(`the added paths meet the open lot ${name}`)
				expect(result.output).toContain('--overlap-ok accepts only an overlap that names its paths')
				expect(readLotScope({ lotFolder: lot.lotFolder })).not.toContain(ADDED)
			},
		)

		it('--overlap-ok with only --drop → refused: there is no add to accept', () => {
			const lot = startRealLot()

			const result = runLot({
				cwd: lot.start.cwd,
				argv: [
					'scope',
					lot.lotName,
					'--drop',
					'src/dataflow/',
					'--overlap-ok',
					'--by',
					BY,
					'--reason',
					REASON,
				],
				now: NOW,
			})

			expect(result.exitCode).toBe(2)
			expect(result.output).toContain('--overlap-ok accepts the overlap of an add: no --add given')
		})

		it('an add taken back meanwhile → its overlap record is undone too: no overlap stands', () => {
			const lot = lotBesideDocsLot()

			addOverlapOkWith({
				lot,
				afterAppend: function startUnnamedLot() {
					writeHeldStoreLot({ workspace: lot.start.workspace, name: UNNAMED_LOT, scope: [ADDED] })
				},
			})

			expect(readLotOverlaps({ lotFolder: lot.lotFolder })).toEqual({ overlaps: [], unreadable: 0 })
		})

		it.each([
			{
				label: 'a path in --by',
				by: 'docs/person.md',
				reason: REASON,
				says: '--by holds a path or a link',
			},
			{
				label: 'a --reason too long for its overlap record',
				by: BY,
				reason: 'r'.repeat(3_960),
				says: 'overlaps.jsonl',
			},
		])('$label → refused, nothing written', ({ by, reason, says }) => {
			const lot = lotBesideDocsLot()

			const result = runLot({
				cwd: lot.start.cwd,
				argv: [
					'scope',
					lot.lotName,
					'--add',
					ADDED,
					'--overlap-ok',
					'--by',
					by,
					'--reason',
					reason,
				],
				now: NOW,
			})

			expect(result.exitCode).toBe(2)
			expect(result.output).toContain(says)
			expect({
				scope: readLotScope({ lotFolder: lot.lotFolder }).includes(ADDED),
				overlaps: readLotOverlaps({ lotFolder: lot.lotFolder }).overlaps,
			}).toEqual({ scope: false, overlaps: [] })
		})
	},
)
