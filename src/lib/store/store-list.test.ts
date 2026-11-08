import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { STORE_LIST_SEGMENTS } from '../../../test/lot-stores.constants.ts'
import { addWorktreeFolder, createWorkspaceWithLots } from '../../../test/lot-stores.ts'
import {
	initializeRepository,
	isolateGitConfig,
	temporaryFolder,
} from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { appendStoreList, readStoreList, storeListPath, storeListRefusal } from './store-list.ts'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(function isolateStateFolder() {
	// every test: a wrong implementation reaching for the default list lands in the test's own folder
	stateFolder()
})

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** A state folder of the test's own (real path), made the `XDG_STATE_HOME` of the test, and the list's place below it. */
function stateFolder(): { state: string; listPath: string } {
	const state = realpathSync(temporaryFolder('dialecte-state-'))
	vi.stubEnv('XDG_STATE_HOME', state)
	return { state, listPath: join(state, ...STORE_LIST_SEGMENTS) }
}

/** The refusal's text with every occurrence of the list's own path taken out: what it names besides the list. */
function namedBesidesList(params: {
	refusal: string | undefined
	listPath: string
}): string | undefined {
	return params.refusal?.replaceAll(params.listPath, '')
}

/** The non-blank lines of the list file. */
function linesOf(listPath: string): string[] {
	return readFileSync(listPath, 'utf8')
		.split('\n')
		.filter((line) => line.trim() !== '')
}

/** Real folders that exist, to name as stores. */
function storeFolders(count: number): string[] {
	const root = realpathSync(temporaryFolder('dialecte-stores-'))
	return Array.from({ length: count }, function makeStore(_, index) {
		const folder = join(root, `store-${index}`)
		mkdirSync(folder)
		return folder
	})
}

type PathRow = {
	name: string
	environment: NodeJS.ProcessEnv
	home: string
	expected: string
}

const PATH_ROWS: PathRow[] = [
	{
		name: 'XDG_STATE_HOME set -> $XDG_STATE_HOME/dialecte/lot-stores',
		environment: { XDG_STATE_HOME: '/state' },
		home: '/home/person',
		expected: '/state/dialecte/lot-stores',
	},
	{
		name: 'XDG_STATE_HOME unset -> ~/.local/state/dialecte/lot-stores',
		environment: {},
		home: '/home/person',
		expected: '/home/person/.local/state/dialecte/lot-stores',
	},
	{
		name: 'XDG_STATE_HOME empty -> the home branch (an empty variable is unset)',
		environment: { XDG_STATE_HOME: '' },
		home: '/home/other',
		expected: '/home/other/.local/state/dialecte/lot-stores',
	},
]

describe('storeListPath', { timeout: STORE_CASE_TIMEOUT }, () => {
	for (const row of PATH_ROWS)
		it(row.name, () => {
			expect(storeListPath({ environment: row.environment, home: row.home })).toBe(row.expected)
		})

	it('no parameters, XDG_STATE_HOME stubbed into the test folder -> below it', () => {
		const { state } = stateFolder()
		vi.stubEnv('XDG_STATE_HOME', state)

		expect(storeListPath({})).toBe(join(state, 'dialecte', 'lot-stores'))
	})
})

describe('appendStoreList', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('no list yet -> the list and its folders made, one line holding the store, true', () => {
		const { listPath } = stateFolder()
		const [store] = storeFolders(1)

		expect({ appended: appendStoreList({ store, listPath }), lines: linesOf(listPath) }).toEqual({
			appended: true,
			lines: [store],
		})
	})

	it('the store is on the list -> nothing written, false', () => {
		const { listPath } = stateFolder()
		const [store] = storeFolders(1)
		mkdirSync(join(listPath, '..'), { recursive: true })
		writeFileSync(listPath, `${store}\n`)
		const before = readFileSync(listPath, 'utf8')

		expect({
			appended: appendStoreList({ store, listPath }),
			after: readFileSync(listPath, 'utf8'),
		}).toEqual({ appended: false, after: before })
	})

	it('another store -> one more line, the first kept', () => {
		const { listPath } = stateFolder()
		const [first, second] = storeFolders(2)
		mkdirSync(join(listPath, '..'), { recursive: true })
		writeFileSync(listPath, `${first}\n`)

		expect({
			appended: appendStoreList({ store: second, listPath }),
			lines: linesOf(listPath),
		}).toEqual({ appended: true, lines: [first, second] })
	})

	it('the same store on a line with blanks around it -> counted as present, nothing appended', () => {
		const { listPath } = stateFolder()
		const [store] = storeFolders(1)
		mkdirSync(join(listPath, '..'), { recursive: true })
		writeFileSync(listPath, `  ${store}  \n`)

		expect({
			appended: appendStoreList({ store, listPath }),
			lines: linesOf(listPath).map((line) => line.trim()),
		}).toEqual({ appended: false, lines: [store] })
	})

	it('a list whose last line has no newline -> the new store on a line of its own, the old one intact', () => {
		const { listPath } = stateFolder()
		const [first, second] = storeFolders(2)
		mkdirSync(join(listPath, '..'), { recursive: true })
		writeFileSync(listPath, first)

		expect({
			appended: appendStoreList({ store: second, listPath }),
			lines: linesOf(listPath),
		}).toEqual({ appended: true, lines: [first, second] })
	})

	it('no listPath, XDG_STATE_HOME stubbed -> the list below it', () => {
		const { state } = stateFolder()
		vi.stubEnv('XDG_STATE_HOME', state)
		const [store] = storeFolders(1)

		expect({
			appended: appendStoreList({ store }),
			lines: linesOf(join(state, 'dialecte', 'lot-stores')),
		}).toEqual({ appended: true, lines: [store] })
	})
})

describe('readStoreList', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('no list file -> no stores', () => {
		const { listPath } = stateFolder()

		expect(readStoreList({ listPath })).toEqual([])
	})

	it('a list with a gone path, a duplicate, a blank line and padding -> the stores that exist, once, in order', () => {
		const { listPath } = stateFolder()
		const [first, second] = storeFolders(2)
		mkdirSync(join(listPath, '..'), { recursive: true })
		writeFileSync(
			listPath,
			[second, join(first, 'gone'), '', `  ${first}  `, second, `${first}\r`, ''].join('\n'),
		)

		expect(readStoreList({ listPath })).toEqual([second, first])
	})

	it('no listPath, XDG_STATE_HOME stubbed -> reads the list below it', () => {
		const { state, listPath } = stateFolder()
		vi.stubEnv('XDG_STATE_HOME', state)
		const [store] = storeFolders(1)
		mkdirSync(join(listPath, '..'), { recursive: true })
		writeFileSync(listPath, `${store}\n`)

		expect(readStoreList({})).toEqual([store])
	})

	it('the list a real workspace builds -> its store', () => {
		const { workspace } = createWorkspaceWithLots({ names: ['0001-repo-a'] })
		const store = realpathSync(workspace.store)
		mkdirSync(join(workspace.storeList, '..'), { recursive: true })
		writeFileSync(workspace.storeList, `${store}\n${join(store, 'gone')}\n`)

		expect(readStoreList({ listPath: workspace.storeList })).toEqual([store])
	})
})

describe('storeListRefusal (case 31)', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('the list outside every git work tree -> no refusal', () => {
		const { listPath } = stateFolder()

		expect(storeListRefusal({ listPath })).toBeUndefined()
	})

	it('the list below a work tree, its folders not made yet -> refused, the work tree named', () => {
		isolateGitConfig()
		const repository = realpathSync(
			initializeRepository({ root: join(realpathSync(temporaryFolder('dialecte-wt-')), 'repo') }),
		)
		const listPath = join(repository, 'state', ...STORE_LIST_SEGMENTS)

		expect(namedBesidesList({ refusal: storeListRefusal({ listPath }), listPath })).toEqual(
			expect.stringContaining(repository),
		)
	})

	it('the list below a work tree, its folders made -> refused, the work tree named', () => {
		isolateGitConfig()
		const repository = realpathSync(
			initializeRepository({ root: join(realpathSync(temporaryFolder('dialecte-wt-')), 'repo') }),
		)
		const listPath = join(repository, 'state', ...STORE_LIST_SEGMENTS)
		mkdirSync(join(listPath, '..'), { recursive: true })

		expect(namedBesidesList({ refusal: storeListRefusal({ listPath }), listPath })).toEqual(
			expect.stringContaining(repository),
		)
	})

	it('the list below a work tree, with PATH emptied -> refused all the same (the walk runs no git)', () => {
		isolateGitConfig()
		const repository = realpathSync(
			initializeRepository({ root: join(realpathSync(temporaryFolder('dialecte-wt-')), 'repo') }),
		)
		const listPath = join(repository, 'state', ...STORE_LIST_SEGMENTS)
		vi.stubEnv('PATH', '')

		expect(namedBesidesList({ refusal: storeListRefusal({ listPath }), listPath })).toEqual(
			expect.stringContaining(repository),
		)
	})

	it('the list below a linked worktree (its .git is a file) -> refused, that worktree named', () => {
		const { workspace } = createWorkspaceWithLots({ names: ['0001-repo-a'] })
		const worktree = addWorktreeFolder({ workspace, folderName: 'checkout' })
		const listPath = join(worktree, 'state', ...STORE_LIST_SEGMENTS)

		expect(namedBesidesList({ refusal: storeListRefusal({ listPath }), listPath })).toEqual(
			expect.stringContaining(worktree),
		)
	})

	it('no listPath, XDG_STATE_HOME stubbed below a work tree -> refused', () => {
		isolateGitConfig()
		const repository = realpathSync(
			initializeRepository({ root: join(realpathSync(temporaryFolder('dialecte-wt-')), 'repo') }),
		)
		vi.stubEnv('XDG_STATE_HOME', join(repository, 'state'))
		const listPath = join(repository, 'state', ...STORE_LIST_SEGMENTS)

		expect(namedBesidesList({ refusal: storeListRefusal({}), listPath })).toEqual(
			expect.stringContaining(repository),
		)
	})
})
