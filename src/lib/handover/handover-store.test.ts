import { mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	STORE_BRANCH,
	STORE_DATE,
	STORE_FIRST_NAME,
	STORE_NOW,
} from '../../../test/handover-store-scenario.constants.ts'
import {
	createBranchRepository,
	createLinkedWorktree,
} from '../../../test/handover-store-scenario.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { HANDOVER_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { handoverStoreOf, nextHandoverName, resolveHandoverArgument } from './handover-store.ts'
import { COMMIT_SCRIPT_FILE, HANDOVER_STORE_FOLDER } from './handover.constants.ts'

import { describe, expect, it } from 'vitest'

/** The entry `name` in `store`, as the cli registers a hand-over (`folder` the hand-over folder it names). */
function makeEntry(params: {
	store: string
	name: string
	folder?: string
	branch?: string
}): void {
	mkdirSync(params.store, { recursive: true })
	writeFileSync(
		join(params.store, `${params.name}.json`),
		JSON.stringify({
			folder: params.folder ?? join(params.store, '..', params.name),
			branch: params.branch ?? STORE_BRANCH,
			worktree: '/work/tree',
			written: '2026-11-04T10:00:00.000Z',
			state: 'pending',
		}),
	)
}

describe('handoverStoreOf', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it('a main checkout and a linked worktree of it → the same store, <git-common-dir>/dialecte-handover', () => {
		const main = createBranchRepository()
		const linked = createLinkedWorktree({ root: main, branch: 'feat/other' })
		const expected = join(realpathSync(main), '.git', HANDOVER_STORE_FOLDER)

		expect(handoverStoreOf(main)).toBe(expected)
		expect(handoverStoreOf(linked)).toBe(expected)
	})
})

describe('nextHandoverName', () => {
	it('branch feat/handover-show, empty store, 2026-11-04 → 2026-11-04-feat-handover-show', () => {
		const store = join(temporaryFolder('dialecte-store-'), HANDOVER_STORE_FOLDER)

		expect(nextHandoverName({ store, branch: STORE_BRANCH, now: STORE_NOW })).toBe(STORE_FIRST_NAME)
	})

	it('the date is the local date of now, just after midnight and just before it', () => {
		const store = join(temporaryFolder('dialecte-store-'), HANDOVER_STORE_FOLDER)
		const justAfterMidnight = new Date(2026, 10, 4, 0, 30)
		const justBeforeMidnight = new Date(2026, 10, 4, 23, 30)

		expect([
			nextHandoverName({ store, branch: STORE_BRANCH, now: justAfterMidnight }),
			nextHandoverName({ store, branch: STORE_BRANCH, now: justBeforeMidnight }),
		]).toEqual([STORE_FIRST_NAME, STORE_FIRST_NAME])
	})

	it('a branch with characters outside [A-Za-z0-9._-] → every run of them one dash, none leading or trailing', () => {
		const store = join(temporaryFolder('dialecte-store-'), HANDOVER_STORE_FOLDER)

		expect(nextHandoverName({ store, branch: '/feat//a b!/v1.2_x/', now: STORE_NOW })).toBe(
			`${STORE_DATE}-feat-a-b-v1.2_x`,
		)
	})

	it('the name has an entry → -2; -2 to -9 have one → -10', () => {
		const store = join(temporaryFolder('dialecte-store-'), HANDOVER_STORE_FOLDER)
		makeEntry({ store, name: STORE_FIRST_NAME })

		expect(nextHandoverName({ store, branch: STORE_BRANCH, now: STORE_NOW })).toBe(
			`${STORE_FIRST_NAME}-2`,
		)

		for (let counter = 2; counter <= 9; counter++)
			makeEntry({ store, name: `${STORE_FIRST_NAME}-${counter}` })
		expect(nextHandoverName({ store, branch: STORE_BRANCH, now: STORE_NOW })).toBe(
			`${STORE_FIRST_NAME}-10`,
		)
	})

	it('a folder of the store named like the name but no entry (a folder is no registration) → the same name again', () => {
		const store = join(temporaryFolder('dialecte-store-'), HANDOVER_STORE_FOLDER)
		mkdirSync(join(store, STORE_FIRST_NAME), { recursive: true })
		writeFileSync(join(store, STORE_FIRST_NAME, COMMIT_SCRIPT_FILE), '')

		expect(nextHandoverName({ store, branch: STORE_BRANCH, now: STORE_NOW })).toBe(STORE_FIRST_NAME)
	})

	it('the entry of another branch on the same day → counted too (the name is the day and the slug)', () => {
		const store = join(temporaryFolder('dialecte-store-'), HANDOVER_STORE_FOLDER)
		makeEntry({ store, name: STORE_FIRST_NAME, branch: 'feat-handover-show' })

		expect(nextHandoverName({ store, branch: STORE_BRANCH, now: STORE_NOW })).toBe(
			`${STORE_FIRST_NAME}-2`,
		)
	})
})

describe('resolveHandoverArgument', () => {
	function arrange(): { store: string; cwd: string; entryFolder: string } {
		const store = join(temporaryFolder('dialecte-store-'), HANDOVER_STORE_FOLDER)
		const cwd = temporaryFolder('dialecte-cwd-')
		const entryFolder = join(temporaryFolder('dialecte-registered-'), 'handover')
		makeEntry({ store, name: 'registered', folder: entryFolder })
		mkdirSync(join(cwd, 'plain'))
		mkdirSync(join(cwd, 'registered'))
		mkdirSync(join(cwd, 'sub', 'registered'), { recursive: true })
		return { store, cwd, entryFolder }
	}

	it("a word without a separator naming an entry of the store → the entry's folder, even when the cwd holds a folder of the same name", () => {
		const { store, cwd, entryFolder } = arrange()

		expect(resolveHandoverArgument({ argument: 'registered', store, cwd })).toBe(entryFolder)
	})

	it('a word without a separator that is no entry but a folder of the cwd → a path relative to the cwd', () => {
		const { store, cwd } = arrange()

		expect(resolveHandoverArgument({ argument: 'plain', store, cwd })).toBe(join(cwd, 'plain'))
	})

	it('an argument with a separator, relative or absolute → a path, never the store', () => {
		const { store, cwd } = arrange()

		expect([
			resolveHandoverArgument({ argument: 'sub/registered', store, cwd }),
			resolveHandoverArgument({ argument: join(cwd, 'plain'), store, cwd }),
		]).toEqual([join(cwd, 'sub', 'registered'), join(cwd, 'plain')])
	})
})
