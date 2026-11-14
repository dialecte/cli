/** A re-check giving 30 sources of real size: the rechecked line is fitted to its bound, lists replaced by counts (R2-1, D17b). */
import { keyOfDraft } from '../../../../test/fact-check-fixtures.ts'
import { factDraft, readFactFile, readHistoryFile } from '../../../../test/fact-fixtures.ts'
import { READ_NAMES } from '../../../../test/read-via.constants.ts'
import { readVia } from '../../../../test/read-via.ts'
import { temporaryFolder } from '../../../../test/scratch-repository.ts'
import { recordFact } from './record-fact.ts'

import { describe, expect, it } from 'vitest'

const NOW = new Date('2026-11-11T10:00:00.000Z')
const SOURCE_COUNT = 30
const LINE_BOUND = 4096

/** 30 standard sources, each a realistic folder id and a full-size files key (`sha256:` and 64 hex digits). */
function realSources(params: { seed: number }): Record<string, unknown>[] {
	return Array.from({ length: SOURCE_COUNT }, (_, index) => ({
		kind: 'standard',
		standard: `example-0000-edition-2-part-${index}-amendment-1`,
		files: `sha256:${(params.seed * 1000 + index).toString(16).padStart(64, 'a')}`,
	}))
}

describe('reads: a re-check giving 30 real-size sources → no throw, the line fitted, the lists as counts', () => {
	for (const readName of READ_NAMES)
		it(`read by ${readName} → one rechecked line of at most 4,096 bytes, cut: true, fromCount and toCount, the file holding all 30 sources`, () => {
			const folder = temporaryFolder('facts-read-rechecked-fit-')
			const draft = factDraft({
				sources: realSources({ seed: 1 }) as ReturnType<typeof factDraft>['sources'],
			})
			recordFact({ folder, draft, now: () => NOW })
			const moved = realSources({ seed: 2 })

			expect(
				readVia({
					name: readName,
					folder,
					key: keyOfDraft(draft),
					check: () => ({
						state: 'valid',
						sources: moved as ReturnType<typeof factDraft>['sources'],
					}),
				}),
			).toHaveLength(1)

			const lines = readHistoryFile({ folder, id: 'F-0001' })
			const last = lines.at(-1)
			expect({
				sources: readFactFile({ folder, id: 'F-0001' }).sources,
				events: lines.map((line) => line.event),
				fits: Buffer.byteLength(`${JSON.stringify(last)}\n`) <= LINE_BOUND,
				cut: last?.cut,
				counts: [last?.fromCount, last?.toCount],
				lists: [last?.from, last?.to],
			}).toEqual({
				sources: moved,
				events: ['created', 'rechecked'],
				fits: true,
				cut: true,
				counts: [SOURCE_COUNT, SOURCE_COUNT],
				lists: [undefined, undefined],
			})
		})
})
