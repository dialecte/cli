/**
 * `readReviewRecord` (33CI CI2a): the rows of a folder's `review.jsonl` as its readers (`lot pr`, `lot review`) take
 * them; a line it cannot read as a row is skipped, a folder without the file has no record.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_FILES } from '../store/store.constants.ts'
import { readReviewRecord } from './review-record.ts'

import { describe, expect, it } from 'vitest'

/** A finding row and a verdict row as the writer writes them. */
const FINDING_LINE =
	'{"schema":1,"kind":"finding","id":"R1-1","round":1,"severity":"nit","file":"src/a.ts","state":"open"}'
const VERDICT_LINE =
	'{"schema":1,"kind":"verdict","at":"2026-11-16T10:00:00.000Z","by":{"kind":"station","station":"reviewer","round":1},"verdict":"approve"}'

/** A folder whose `review.jsonl` holds `text`. */
function folderWith(text: string): string {
	const folder = temporaryFolder('review-record-')
	writeFileSync(join(folder, STORE_FILES.review), text)
	return folder
}

describe('readReviewRecord', () => {
	it('a folder without review.jsonl -> no record', () => {
		expect(readReviewRecord({ folder: temporaryFolder('review-record-') })).toBeUndefined()
	})

	it('a finding line and a verdict line -> the finding and the verdict', () => {
		expect(readReviewRecord({ folder: folderWith(`${FINDING_LINE}\n${VERDICT_LINE}\n`) })).toEqual({
			findings: [JSON.parse(FINDING_LINE)],
			verdicts: [JSON.parse(VERDICT_LINE)],
		})
	})

	for (const [what, line] of [
		['a torn line', '{"schema":1,"kind":"find'],
		['another schema', '{"schema":2,"kind":"finding","id":"R1-2"}'],
		['an unknown kind', '{"schema":1,"kind":"approval","by":"someone"}'],
		['a finding with no id', '{"schema":1,"kind":"finding","state":"open"}'],
		[
			'a verdict with no by',
			'{"schema":1,"kind":"verdict","at":"2026-11-16T10:00:00.000Z","verdict":"approve"}',
		],
	])
		it(`${what} between two rows -> the two rows, that line skipped`, () => {
			expect(
				readReviewRecord({ folder: folderWith(`${FINDING_LINE}\n${line}\n${VERDICT_LINE}\n`) }),
			).toEqual({ findings: [JSON.parse(FINDING_LINE)], verdicts: [JSON.parse(VERDICT_LINE)] })
		})

	it('a verdict by a person (an approval) -> read as it is', () => {
		const person =
			'{"schema":1,"kind":"verdict","at":"2026-11-16T10:00:00.000Z","by":{"kind":"person","name":"maintainer"},"verdict":"approve"}'

		expect(readReviewRecord({ folder: folderWith(`${person}\n`) })).toEqual({
			findings: [],
			verdicts: [JSON.parse(person)],
		})
	})
})
