/**
 * A registry entry whose hard link fails for a reason other than "no hard links here" is an error, never swallowed
 * into the exclusive fallback: the error is rethrown with its code, and no entry (not even an empty one) is left.
 */
import { existsSync, readdirSync } from 'node:fs'

import { STORE_BRANCH, STORE_NOW } from '../../../test/handover-store-scenario.constants.ts'
import { createBranchRepository, storeOf } from '../../../test/handover-store-scenario.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { thrownBy } from '../../../test/thrown-by.ts'
import { registerHandover } from './handover-store.ts'

import { describe, expect, it } from 'vitest'

import type { LinkFunction } from '../store/store.types.ts'

/** A file system that refuses the link with `code`. */
function refusingLink(code: string): LinkFunction {
	return function refuseLink(): never {
		throw Object.assign(new Error(`${code}: link refused`), { code })
	}
}

describe(
	'registerHandover, a link that fails for another reason',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it.each(['EACCES', 'EROFS', 'EMFILE'])(
			'link refused with %s -> the error is rethrown with its code, no entry and no temporary file left',
			(code) => {
				const root = createBranchRepository()
				const folder = temporaryFolder('dialecte-link-error-')

				const thrown = thrownBy(() =>
					registerHandover({
						root,
						folder,
						branch: STORE_BRANCH,
						now: STORE_NOW,
						link: refusingLink(code),
					}),
				)

				expect({
					code: (thrown as NodeJS.ErrnoException | undefined)?.code,
					entries: existsSync(storeOf(root)) ? readdirSync(storeOf(root)) : [],
				}).toEqual({ code, entries: [] })
			},
		)
	},
)
