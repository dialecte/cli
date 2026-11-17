/**
 * A lot's brief changes only through `lot brief`: `brief.json` is checked against the hash of the latest `brief`
 * transition, else the hash its start recorded, and a brief edited by hand reads as a damaged record, like any other.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { replaceRecord } from '../../../test/damaged-lot-workspace.ts'
import { LOT_NAME } from '../../../test/lot-pr.constants.ts'
import { pullRequestLot } from '../../../test/lot-pr.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { runLot } from '../../commands/lot.ts'
import { readCheckedLotState, registryOfLotFolder } from './lot-records.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PullRequestLot } from '../../../test/lot-pr.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The damage the lot reads with; undefined for a lot whose records hold. */
function damageOf(lot: PullRequestLot): string | undefined {
	const checked = readCheckedLotState({
		lotFolder: lot.lotFolder,
		registry: registryOfLotFolder(lot.lotFolder),
	})
	return checked !== undefined && 'damage' in checked ? checked.damage : undefined
}

/** The stored brief with a new summary, as text. */
function briefWithSummary(params: { lot: PullRequestLot; summary: string }): string {
	const value = JSON.parse(readFileSync(join(params.lot.lotFolder, 'brief.json'), 'utf8')) as object
	return `${JSON.stringify({ ...value, summary: params.summary }, null, 2)}\n`
}

describe('the brief of a lot as a record', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a lot as started → its records hold', () => {
		expect(damageOf(pullRequestLot())).toBeUndefined()
	})

	it('a brief.json edited by hand → the lot reads damaged, naming its brief', () => {
		const lot = pullRequestLot()
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
		const lot = pullRequestLot()
		const from = join(temporaryFolder('dialecte-new-brief-'), 'brief.json')
		writeFileSync(from, briefWithSummary({ lot, summary: 'Rewritten through the verb.' }))
		runLot({
			cwd: lot.workspace.repository,
			argv: [
				'brief',
				LOT_NAME,
				'--from',
				from,
				'--by',
				'person-a',
				'--reason',
				'a clearer summary',
			],
		})

		expect(damageOf(lot)).toBeUndefined()
	})
})
