/**
 * The invariant of a damaged lot (P2.2): it is open for the overlap check until a person moves it aside. Its scope is
 * its `brief.json` scope when that reads as a list of strings, else it holds every path; any real `lot start` of the
 * same store is refused while it stays, the refusal names it with its damage. The overlap check never fails open on a
 * record it cannot read. Each case is one state of the store and the outcome of the start.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import {
	BRIEF_DAMAGES,
	DAMAGES,
	DISJOINT_SCOPE,
	SCOPE_UNREADABLE,
} from '../../test/damaged-lot-workspace.constants.ts'
import {
	briefDamagedLotIn,
	damagedLines,
	damagedLotIn,
	refusalsOf,
	startDefaultBrief,
} from '../../test/damaged-lot-workspace.ts'
import { createStartWorkspace, entriesOf } from '../../test/lot-start-workspace.ts'
import { stopOf } from '../../test/lot-stop-workspace.ts'
import { otherLivePid } from '../../test/other-live-pid.ts'
import { writeRecordFile } from '../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { RECORD_DAMAGE_REASONS } from '../lib/store/store.constants.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

describe(
	'a damaged lot with a readable scope that overlaps is open for the overlap check',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		for (const row of DAMAGES)
			it(`${row.title}, its brief scope overlapping -> lot start refused (exit 2) naming it, its damage and the met pairs, no lot made`, () => {
				const start = createStartWorkspace()
				const lot = damagedLotIn({ start, kind: row.kind })

				const started = startDefaultBrief({ start })

				expect(started.exitCode).toBe(2)
				expect(refusalsOf({ json: started.json })).toEqual([
					expect.objectContaining({
						field: 'scope',
						rule: 'overlap',
						detail: expect.stringContaining(`overlap with ${lot.name} (damaged: ${row.reason})`),
					}),
				])
				expect(refusalsOf({ json: started.json })[0].detail).toContain(
					'src/dataflow meets src/dataflow',
				)
				expect(refusalsOf({ json: started.json })[0].detail).not.toContain(SCOPE_UNREADABLE)
				expect(entriesOf(start.store)).toEqual([lot.name])
			})
	},
)

describe(
	'a damaged lot whose scope cannot be read holds every path',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		for (const row of BRIEF_DAMAGES)
			it(`${row.title} (identity missing) -> lot start refused (exit 2) naming it, its damage and that its scope cannot be read`, () => {
				const start = createStartWorkspace()
				const lot = briefDamagedLotIn({ start, brief: row.kind })

				const started = startDefaultBrief({ start })

				expect(started.exitCode).toBe(2)
				expect(refusalsOf({ json: started.json })).toEqual([
					expect.objectContaining({
						field: 'scope',
						rule: 'overlap',
						detail: expect.stringContaining(
							`overlap with ${lot.name} (damaged: ${RECORD_DAMAGE_REASONS.identityUnreadable})`,
						),
					}),
				])
				expect(refusalsOf({ json: started.json })[0].detail).toContain(SCOPE_UNREADABLE)
				expect(entriesOf(start.store)).toEqual([lot.name])
			})
	},
)

describe(
	'a damaged lot stops holding paths when it does not overlap or is moved aside',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a damaged lot whose readable scope does not overlap -> lot start passes (exit 0) while the lot still reads damaged', () => {
			const start = createStartWorkspace()
			const lot = damagedLotIn({ start, kind: 'identityMissing', scope: DISJOINT_SCOPE })

			expect(startDefaultBrief({ start }).exitCode).toBe(0)
			expect(
				runLot({ cwd: start.repository, argv: ['status', lot.name] }).output.split('\n'),
			).toEqual(damagedLines(lot))
		})

		it('a damaged lot whose identity reads simulated, its brief scope overlapping -> holds no scope: lot start passes (exit 0) while the lot still reads damaged', () => {
			const start = createStartWorkspace()
			const lot = damagedLotIn({ start, kind: 'badTransition', simulated: true })

			expect(startDefaultBrief({ start }).exitCode).toBe(0)
			expect(
				runLot({ cwd: start.repository, argv: ['status', lot.name] }).output.split('\n'),
			).toEqual(damagedLines(lot))
		})

		it('a lot that was simulated whose identity is unparsable, its brief scope overlapping -> fails closed: lot start refused naming it', () => {
			const start = createStartWorkspace()
			const lot = damagedLotIn({ start, kind: 'identityUnparsable', simulated: true })

			const started = startDefaultBrief({ start })

			expect(started.exitCode).toBe(2)
			expect(refusalsOf({ json: started.json })).toEqual([
				expect.objectContaining({
					detail: expect.stringContaining(`overlap with ${lot.name} (damaged: ${lot.reason})`),
				}),
			])
		})

		for (const damage of [
			{ title: 'a readable overlapping scope', brief: undefined },
			{ title: 'a scope that cannot be read', brief: 'missing' as const },
		])
			it(`a damaged lot with ${damage.title}, moved aside by lot stop -> the start refused before passes after: exit 2 then exit 0`, () => {
				const start = createStartWorkspace()
				const lot =
					damage.brief === undefined
						? damagedLotIn({ start, kind: 'identityMissing' })
						: briefDamagedLotIn({ start, brief: damage.brief })

				const before = startDefaultBrief({ start })
				const stopped = stopOf({ cwd: start.repository, id: lot.name })
				const after = startDefaultBrief({ start })

				expect({
					before: before.exitCode,
					stopped: stopped.exitCode,
					after: after.exitCode,
				}).toEqual({ before: 2, stopped: 0, after: 0 })
			})
	},
)

describe('a folder that is no lot never holds paths', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a .tmp- folder of a live builder holding an overlapping brief and no identity, beside a damaged lot -> never damaged: the one refusal names the lot, not the folder', () => {
		const start = createStartWorkspace()
		const lot = damagedLotIn({ start, kind: 'identityMissing' })
		writeRecordFile({
			folder: join(start.store, `.0005-repo-half.tmp-${otherLivePid()}`),
			name: 'brief.json',
			text: JSON.stringify({ scope: ['src/dataflow/'] }),
		})

		const refused = refusalsOf({ json: startDefaultBrief({ start }).json })

		expect(refused).toEqual([
			expect.objectContaining({
				detail: expect.stringContaining(`overlap with ${lot.name} (damaged:`),
			}),
		])
		expect(refused[0].detail).not.toContain('0005-repo-half')
	})

	it('a folder whose name has no lot name shape holding an overlapping brief and no identity, beside a damaged lot -> not damaged: the one refusal names the lot, not the folder', () => {
		const start = createStartWorkspace()
		const lot = damagedLotIn({ start, kind: 'identityMissing' })
		mkdirSync(start.store, { recursive: true })
		writeRecordFile({
			folder: join(start.store, 'scratch'),
			name: 'brief.json',
			text: JSON.stringify({ scope: ['src/dataflow/'] }),
		})

		const refused = refusalsOf({ json: startDefaultBrief({ start }).json })

		expect(refused).toEqual([
			expect.objectContaining({
				detail: expect.stringContaining(`overlap with ${lot.name} (damaged:`),
			}),
		])
		expect(refused[0].detail).not.toContain('scratch')
	})
})
