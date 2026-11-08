/** A registry entry is created whole and writable, never over an existing one, on a file system that refuses hard links. */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { outcomeOf } from '../../../test/call-outcome.ts'
import {
	STORE_BRANCH,
	STORE_FIRST_NAME,
	STORE_NOW,
} from '../../../test/handover-store-scenario.constants.ts'
import { createBranchRepository, storeOf } from '../../../test/handover-store-scenario.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { registerHandover } from './handover-store.ts'

import { describe, expect, it } from 'vitest'

import type { LinkFunction } from '../store/store.types.ts'

const WRITABLE_ENTRY_MODE = 0o644
const TAKEN_BYTES = '{"folder":"/elsewhere","state":"pending"}\n'

/** A file system that refuses hard links with `code`. */
function refusingLink(code: string): LinkFunction {
	return function refuseLink(): never {
		throw Object.assign(new Error(`${code}: operation not permitted, link`), { code })
	}
}

const REFUSALS = ['EPERM', 'ENOTSUP']

describe('registerHandover without hard links', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const code of REFUSALS) {
		it(`link refused with ${code} -> the entry is created whole and 0644, no temporary file left`, () => {
			const root = createBranchRepository()
			const folder = temporaryFolder('dialecte-no-links-')

			expect(
				outcomeOf(() =>
					registerHandover({
						root,
						folder,
						branch: STORE_BRANCH,
						now: STORE_NOW,
						link: refusingLink(code),
					}),
				),
			).toEqual({ value: STORE_FIRST_NAME })

			const entryPath = join(storeOf(root), `${STORE_FIRST_NAME}.json`)
			expect(JSON.parse(readFileSync(entryPath, 'utf8'))).toMatchObject({
				folder,
				branch: STORE_BRANCH,
				state: 'pending',
			})
			expect(statSync(entryPath).mode & 0o777).toBe(WRITABLE_ENTRY_MODE)
			expect(readdirSync(storeOf(root))).toEqual([`${STORE_FIRST_NAME}.json`])
		})

		it(`link refused with ${code}, another writer takes the picked name meanwhile -> its entry is byte-identical, the loser takes -2`, () => {
			const root = createBranchRepository()
			const folder = temporaryFolder('dialecte-no-links-')
			const takenPath = join(storeOf(root), `${STORE_FIRST_NAME}.json`)

			expect(
				outcomeOf(() =>
					registerHandover({
						root,
						folder,
						branch: STORE_BRANCH,
						now: STORE_NOW,
						link: refusingLink(code),
						afterNamePicked: () => writeFileSync(takenPath, TAKEN_BYTES),
					}),
				),
			).toEqual({ value: `${STORE_FIRST_NAME}-2` })

			expect(readFileSync(takenPath, 'utf8')).toBe(TAKEN_BYTES)
			const loserPath = join(storeOf(root), `${STORE_FIRST_NAME}-2.json`)
			expect(JSON.parse(readFileSync(loserPath, 'utf8'))).toMatchObject({
				folder,
				state: 'pending',
			})
			expect(statSync(loserPath).mode & 0o777).toBe(WRITABLE_ENTRY_MODE)
			expect(readdirSync(storeOf(root))).toEqual([
				`${STORE_FIRST_NAME}-2.json`,
				`${STORE_FIRST_NAME}.json`,
			])
		})
	}
})
