/**
 * The key read follows the pointer only (D9b): on a ledger of many facts of other keys it reads the pointer, the
 * target and the fact the target supersedes, no other fact file; a counting `node:fs` stands behind `readFileSync`.
 */
import { basename } from 'node:path'

import { counted } from '../../../../test/counting-fs.ts'
import { keyOfDraft } from '../../../../test/fact-check-fixtures.ts'
import { factDraft, readFactFile } from '../../../../test/fact-fixtures.ts'
import { temporaryFolder } from '../../../../test/scratch-repository.ts'
import { currentFact } from './read-facts.ts'
import { recordFact } from './record-fact.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs', async (importOriginal) => {
	const { countingFs } = await import('../../../../test/counting-fs.ts')
	const actual = await importOriginal<typeof import('node:fs')>()
	return countingFs(actual)
})

afterEach(function disarm() {
	counted.armed = false
	counted.paths.length = 0
	counted.reads.length = 0
})

const NOW = new Date('2026-11-11T10:00:00.000Z')
const OTHER_KEYS = 20
const FACT_FILE = /^F-\d+\.json$/

/** A seam that stops the record as a crash would. */
function crash(): never {
	throw new Error('crash')
}

/** A ledger of 20 facts of other keys, then the key's fact F-0021 replaced by F-0022 (a crash can leave F-0021 unmarked). */
function ledgerOfManyKeys(params: { crashAfterPointer: boolean }): { folder: string; key: string } {
	const folder = temporaryFolder('facts-read-many-')
	for (let index = 0; index < OTHER_KEYS; index++)
		recordFact({
			folder,
			draft: factDraft({ question: `Is AA_${index} ordered?` }),
			now: () => NOW,
		})
	const draft = factDraft()
	recordFact({ folder, draft, now: () => NOW })
	const replacement = factDraft({
		effort: 'high',
		answer: { verdict: 'no', value: null, text: 'D is optional in A.' },
	})
	if (params.crashAfterPointer)
		expect(() =>
			recordFact({ folder, draft: replacement, now: () => NOW, seams: { afterPointer: crash } }),
		).toThrow('crash')
	else recordFact({ folder, draft: replacement, now: () => NOW })
	return { folder, key: keyOfDraft(draft) }
}

/** The fact files `currentFact` reads, by name, while armed. */
function factFilesReadBy(params: { folder: string; key: string }): string[] {
	counted.reads.length = 0
	counted.armed = true
	const view = currentFact(params)
	counted.armed = false
	expect(view?.id).toBe('F-0022')
	return counted.reads.map((path) => basename(path)).filter((name) => FACT_FILE.test(name))
}

describe('currentFact on a ledger of 20 facts of other keys: only the target and the fact it supersedes are read (R1-4)', () => {
	const rows: Record<string, { crashAfterPointer: boolean }> = {
		'the replacement complete': { crashAfterPointer: false },
		'a crash after the pointer swap (F-0021 not marked superseded)': { crashAfterPointer: true },
	}

	for (const [name, row] of Object.entries(rows))
		it(`${name} → the target read, no fact file but it and the one it supersedes, the one it supersedes marked superseded`, () => {
			const ledger = ledgerOfManyKeys(row)

			const read = [...new Set(factFilesReadBy(ledger))]
			expect({
				target: read.includes('F-0022.json'),
				others: read.filter((file) => file !== 'F-0022.json' && file !== 'F-0021.json'),
				previousSupersededBy: readFactFile({ folder: ledger.folder, id: 'F-0021' }).supersededBy,
			}).toEqual({ target: true, others: [], previousSupersededBy: 'F-0022' })
		})

	it('a key with one fact → only that fact file is read', () => {
		const folder = temporaryFolder('facts-read-single-')
		for (let index = 0; index < OTHER_KEYS; index++)
			recordFact({
				folder,
				draft: factDraft({ question: `Is AA_${index} ordered?` }),
				now: () => NOW,
			})
		const draft = factDraft()
		recordFact({ folder, draft, now: () => NOW })
		counted.reads.length = 0
		counted.armed = true

		const view = currentFact({ folder, key: keyOfDraft(draft) })
		counted.armed = false

		expect({
			id: view?.id,
			files: [
				...new Set(
					counted.reads.map((path) => basename(path)).filter((name) => FACT_FILE.test(name)),
				),
			],
		}).toEqual({ id: 'F-0021', files: ['F-0021.json'] })
	})
})
