/** A re-check giving many sources: the file takes them all, the rechecked line is cut to fit its bound (R1-3). */
import { keyOfDraft } from '../../../../test/fact-check-fixtures.ts'
import { factDraft, readFactFile, readHistoryFile } from '../../../../test/fact-fixtures.ts'
import { READ_NAMES } from '../../../../test/read-via.constants.ts'
import { readVia } from '../../../../test/read-via.ts'
import { temporaryFolder } from '../../../../test/scratch-repository.ts'
import { recordFact } from './record-fact.ts'

import { describe, expect, it } from 'vitest'

const NOW = new Date('2026-11-11T10:00:00.000Z')

const MANY_SOURCES = Array.from({ length: 80 }, (_, index) => ({
	kind: 'standard',
	standard: 'example-0000',
	files: `sha256:${index}`,
}))

describe('reads: a re-check giving 80 sources → the file holds them all, the rechecked line is cut to fit (R1-3)', () => {
	for (const readName of READ_NAMES)
		it(`read by ${readName} → no throw, the new sources written, one rechecked line under 4,096 bytes with cut: true`, () => {
			const folder = temporaryFolder('facts-read-rechecked-cut-')
			const draft = factDraft()
			recordFact({ folder, draft, now: () => NOW })

			expect(
				readVia({
					name: readName,
					folder,
					key: keyOfDraft(draft),
					check: () => ({ state: 'valid', sources: MANY_SOURCES }),
				}),
			).toHaveLength(1)

			const lines = readHistoryFile({ folder, id: 'F-0001' })
			expect({
				sources: readFactFile({ folder, id: 'F-0001' }).sources,
				events: lines.map((line) => line.event),
				fits: Buffer.byteLength(`${JSON.stringify(lines.at(-1))}\n`) <= 4096,
				cut: lines.at(-1)?.cut,
			}).toEqual({
				sources: MANY_SOURCES,
				events: ['created', 'rechecked'],
				fits: true,
				cut: true,
			})
		})
})
