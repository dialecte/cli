/**
 * The body judges its committed head's package as `rules` judges the same committed tree: the package's own api
 * indexes it holds (whatever its exports map), and a package.json that does not parse is never judged.
 */
import { changeRequestLot } from '../../../test/lot-pr.ts'
import {
	CROWDING_INDEX,
	LABEL_FILE,
	LABEL_SOURCE,
	OWNER_LABEL_FILE,
	OWNER_LABEL_SOURCE,
	QUALITY_PACKAGE_JSON,
} from '../../../test/quality-workspace.constants.ts'
import { runRulesIn } from '../../../test/quality-workspace.ts'
import { writeFiles } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { readQualityRecord } from '../quality/quality-record.ts'
import { readChangeRequestSources } from './change-request-sources.ts'

import { describe, expect, it } from 'vitest'

import type { ChangeRequestLot } from '../../../test/lot-pr.types.ts'

/** The lot's fragment, kept beside the files a case's commit writes. */
const FRAGMENT = { 'changes/x.md': '### Added\n\n- `x` answers one.\n' }

/** A package.json cut short: it does not parse. */
const BROKEN_PACKAGE_JSON = '{ "name": "@dialecte/demo",\n'

describe("the body reads the head's own api indexes", { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a package with no exports map, its committed api index crowding the find ranking → the body finds the duplicates rules finds on the same tree: none', () => {
		const lot = changeRequestLot({
			mainFiles: {
				'package.json': QUALITY_PACKAGE_JSON,
				[LABEL_FILE]: LABEL_SOURCE,
				'skills/demo/references/api.json': CROWDING_INDEX,
			},
			lotFiles: { ...FRAGMENT, [OWNER_LABEL_FILE]: OWNER_LABEL_SOURCE },
		})
		runRulesIn({ root: lot.worktree })
		// no record reads undefined, never the empty list the case expects
		const ruled = readQualityRecord(lot.worktree)?.duplicates.map((found) => found.name)

		const sources = readChangeRequestSources({
			lotFolder: lot.lotFolder,
			worktree: lot.worktree,
			baseRef: 'main',
		})

		expect({
			rules: ruled,
			body:
				'refusal' in sources || sources.quality?.kind !== 'judged'
					? sources
					: sources.quality.duplicates.map((found) => found.name),
		}).toEqual({ rules: [], body: [] })
	})
})

/** The body's quality of `lot`, its refusal, or what a throw says: a crash reads as a value an assertion fails on. */
function bodyQualityOutcomeOf(lot: ChangeRequestLot): unknown {
	try {
		const sources = readChangeRequestSources({
			lotFolder: lot.lotFolder,
			worktree: lot.worktree,
			baseRef: 'main',
		})
		return 'refusal' in sources ? sources : sources.quality
	} catch (error) {
		return { threw: error instanceof Error ? error.message : String(error) }
	}
}

describe(
	'the body of a head whose package.json does not parse',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a package.json the lot head cuts short, repaired in the worktree only → Quality: not judged (package.json does not parse), from HEAD', () => {
			// main's package.json parses: only the lot's head cuts it short
			const lot = changeRequestLot({
				mainFiles: { 'package.json': QUALITY_PACKAGE_JSON },
				lotFiles: { ...FRAGMENT, 'package.json': BROKEN_PACKAGE_JSON },
			})
			writeFiles({ root: lot.worktree, files: { 'package.json': QUALITY_PACKAGE_JSON } })

			expect(bodyQualityOutcomeOf(lot)).toEqual({
				kind: 'not-judged',
				why: 'package.json does not parse',
			})
		})
	},
)
