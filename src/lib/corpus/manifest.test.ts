/** The shipped manifest: every source passes the licence and pin check, every id is one folder, every override exists. */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { SOURCE_ID_PATTERN } from './corpus.constants.ts'
import { readShippedCorpus } from './shipped-corpus.ts'
import { pinnedDownloadsOf, sourceProblemOf } from './source-pins.ts'

import { describe, expect, it } from 'vitest'

const SHIPPED = readShippedCorpus({ moduleFolder: import.meta.dirname })

describe('the shipped manifest', () => {
	it('holds the 19 sources the licence review admitted', () => {
		expect(SHIPPED.manifest.sources).toHaveLength(19)
	})

	it.each(SHIPPED.manifest.sources.map((source) => [source.id, source] as const))(
		'%s: passes the source check, its id one folder name, its pins sha256, its verdict known, its overrides there',
		(_id, source) => {
			expect(sourceProblemOf(source)).toBeUndefined()
			expect(source.id).toMatch(SOURCE_ID_PATTERN)
			expect(pinnedDownloadsOf(source).map((download) => download.sha256)).toEqual(
				pinnedDownloadsOf(source).map(() => expect.stringMatching(/^[0-9a-f]{64}$/u)),
			)
			expect(['full', 'schemas-only']).toContain(source.verdict)
			expect(
				Object.values(source.substitute ?? {}).filter(
					(override) => !existsSync(join(SHIPPED.overrides, override)),
				),
			).toEqual([])
		},
	)
})
