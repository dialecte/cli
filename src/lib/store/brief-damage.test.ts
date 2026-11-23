/**
 * A lot's brief changes only through `lot brief`: `brief.json` is checked against the hash of the latest `brief`
 * transition, else the hash its start recorded, and a brief edited by hand reads as a damaged record, like any other.
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { replaceRecord } from '../../../test/damaged-lot-workspace.ts'
import { LOT_NAME } from '../../../test/lot-describe.constants.ts'
import { changeRequestLot } from '../../../test/lot-describe.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { runLot } from '../../commands/lot.ts'
import { readCheckedLotState, registryOfLotFolder } from './lot-records.ts'
import { appendTransition } from './transitions.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ChangeRequestLot } from '../../../test/lot-describe.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The damage the lot reads with; undefined for a lot whose records hold. */
function damageOf(lot: ChangeRequestLot): string | undefined {
	const checked = readCheckedLotState({
		lotFolder: lot.lotFolder,
		registry: registryOfLotFolder(lot.lotFolder),
	})
	return checked !== undefined && 'damage' in checked ? checked.damage : undefined
}

/** The stored brief with a new summary, as text. */
function briefWithSummary(params: { lot: ChangeRequestLot; summary: string }): string {
	const value = JSON.parse(readFileSync(join(params.lot.lotFolder, 'brief.json'), 'utf8')) as object
	return `${JSON.stringify({ ...value, summary: params.summary }, null, 2)}\n`
}

/** `lot brief <lot> --from <from>` by a person, with a reason. */
function rewriteThroughVerb(params: { lot: ChangeRequestLot; from: string }) {
	return runLot({
		cwd: params.lot.workspace.repository,
		argv: [
			'brief',
			LOT_NAME,
			'--from',
			params.from,
			'--by',
			'person-a',
			'--reason',
			'a clearer summary',
		],
	})
}

describe('the brief of a lot as a record', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a lot as started → its records hold', () => {
		expect(damageOf(changeRequestLot())).toBeUndefined()
	})

	it('a brief.json edited by hand → the lot reads damaged, naming its brief', () => {
		const lot = changeRequestLot()
		replaceRecord({
			folder: lot.lotFolder,
			name: 'brief.json',
			text: briefWithSummary({ lot, summary: 'Edited by hand.' }),
		})

		expect(damageOf(lot)).toBe(
			'brief.json is not the brief its start or its last lot brief recorded',
		)
	})

	it('a brief rewritten through lot brief → its records hold', () => {
		const lot = changeRequestLot()
		const from = join(temporaryFolder('dialecte-new-brief-'), 'brief.json')
		writeFileSync(from, briefWithSummary({ lot, summary: 'Rewritten through the verb.' }))
		const rewritten = rewriteThroughVerb({ lot, from })

		expect(rewritten.exitCode).toBe(0)
		expect(readFileSync(join(lot.lotFolder, 'brief.json'), 'utf8')).toContain(
			'Rewritten through the verb.',
		)
		expect(damageOf(lot)).toBeUndefined()
	})

	it("a brief rewritten through lot brief, then its start's bytes put back by hand → damaged: only the latest counts", () => {
		const lot = changeRequestLot()
		const started = readFileSync(join(lot.lotFolder, 'brief.json'), 'utf8')
		const from = join(temporaryFolder('dialecte-new-brief-'), 'brief.json')
		writeFileSync(from, briefWithSummary({ lot, summary: 'Rewritten through the verb.' }))
		rewriteThroughVerb({ lot, from })

		replaceRecord({ folder: lot.lotFolder, name: 'brief.json', text: started })

		expect(damageOf(lot)).toBe(
			'brief.json is not the brief its start or its last lot brief recorded',
		)
	})

	it('a lot brief killed after its transition, before its brief moved into place → the lot reads clean on its old brief', () => {
		const lot = changeRequestLot()
		const started = readFileSync(join(lot.lotFolder, 'brief.json'), 'utf8')
		const next = briefWithSummary({ lot, summary: 'Rewritten, never moved.' })
		writeFileSync(join(lot.lotFolder, 'brief.json.next'), next)
		appendTransition({
			lotFolder: lot.lotFolder,
			next: ({ last }) => ({
				at: '2026-11-17T00:00:00.000Z',
				lot: LOT_NAME,
				state: last?.state ?? 'working',
				position: last?.position ?? { step: 0, of: 1, station: null, round: null },
				cause: { kind: 'brief', by: 'person-a', reason: 'killed midway' },
				question: null,
				simulated: false,
				brief: { from: sha256(started), to: sha256(next) },
			}),
		})

		expect(damageOf(lot)).toBeUndefined()
	})
})

function sha256(text: string): string {
	return createHash('sha256').update(text).digest('hex')
}
