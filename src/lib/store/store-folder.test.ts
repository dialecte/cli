import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	statSync,
	writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { deadPid } from '../../../test/dead-pid.ts'
import {
	createBranchRepository,
	createLinkedWorktree,
} from '../../../test/handover-store-scenario.ts'
import { otherLivePid } from '../../../test/other-live-pid.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { identityOf, transitionOf, writeRecordFile } from '../../../test/store-records.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { listLotNames, locateStore, publishLotFolder } from './store-folder.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

const LOT_NAME = '0001-repo-branch'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The parameters that build the lot `name` in `store` with the fixed records, and the given seams. */
function lotParams(params: {
	store: string
	name?: string
	beforeIdentity?: (temporaryFolder: string) => void
	beforeRename?: (temporaryFolder: string) => void
}): Parameters<typeof publishLotFolder>[0] {
	const name = params.name ?? LOT_NAME
	return {
		store: params.store,
		name,
		brief: '{"brief":true}\n',
		plan: '# the plan\n',
		firstTransition: transitionOf({ seq: 1 }),
		identity: identityOf({ name }),
		beforeIdentity: params.beforeIdentity,
		beforeRename: params.beforeRename,
	}
}

function newStore(): string {
	const store = join(temporaryFolder('dialecte-store-'), 'dialecte-lots')
	mkdirSync(store)
	return store
}

describe(
	'locateStore: the store found without running git',
	{ timeout: STORE_CASE_TIMEOUT },
	() => {
		it('a main checkout → <common git folder>/dialecte-lots and dialecte-handover', () => {
			const main = createBranchRepository()
			const common = join(realpathSync(main), '.git')
			vi.stubEnv('PATH', '')

			expect(locateStore({ from: main })).toEqual({
				common,
				store: join(common, 'dialecte-lots'),
				registry: join(common, 'dialecte-handover'),
			})
		})

		it('a subfolder of a main checkout → the same store', () => {
			const main = createBranchRepository()
			const common = join(realpathSync(main), '.git')
			vi.stubEnv('PATH', '')

			expect(locateStore({ from: join(main, 'src') })?.store).toBe(join(common, 'dialecte-lots'))
		})

		it("a linked worktree, and a subfolder of it → the main checkout's store (through gitdir and commondir)", () => {
			const main = createBranchRepository()
			const linked = createLinkedWorktree({ root: main, branch: 'feat/other' })
			const expected = join(realpathSync(main), '.git', 'dialecte-lots')
			vi.stubEnv('PATH', '')

			expect(locateStore({ from: linked })?.store).toBe(expected)
			expect(locateStore({ from: join(linked, 'src') })?.store).toBe(expected)
		})

		it('a .git folder holding a relative commondir file → that common folder', () => {
			const root = temporaryFolder('dialecte-store-')
			const common = join(root, 'common.git')
			mkdirSync(common)
			const gitFolder = join(root, 'work', '.git')
			mkdirSync(gitFolder, { recursive: true })
			writeFileSync(join(gitFolder, 'commondir'), '../../common.git\n')

			expect(locateStore({ from: join(root, 'work') })?.store).toBe(
				join(realpathSync(common), 'dialecte-lots'),
			)
		})

		it('a .git file saying "gitdir: <relative path>" to a folder with a commondir file → that common folder', () => {
			const root = temporaryFolder('dialecte-store-')
			const common = join(root, 'main', '.git')
			mkdirSync(join(common, 'worktrees', 'x'), { recursive: true })
			writeFileSync(join(common, 'worktrees', 'x', 'commondir'), '../..\n')
			mkdirSync(join(root, 'linked'))
			writeFileSync(join(root, 'linked', '.git'), 'gitdir: ../main/.git/worktrees/x\n')

			expect(locateStore({ from: join(root, 'linked') })?.store).toBe(
				join(realpathSync(common), 'dialecte-lots'),
			)
		})

		it('a folder in no repository → undefined', () => {
			const folder = temporaryFolder('dialecte-store-')

			expect(locateStore({ from: folder })).toBeUndefined()
		})
	},
)

describe('publishLotFolder', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a free name → true; the folder holds brief.json, plan.md, transitions/000001.json and identity.json, read-only, no temporary left', () => {
		const store = newStore()

		expect(publishLotFolder(lotParams({ store }))).toBe(true)
		const lot = join(store, LOT_NAME)
		expect(readdirSync(store)).toEqual([LOT_NAME])
		expect(readdirSync(lot).sort()).toEqual([
			'brief.json',
			'identity.json',
			'plan.md',
			'transitions',
		])
		expect(readdirSync(join(lot, 'transitions'))).toEqual(['000001.json'])
		expect(readFileSync(join(lot, 'brief.json'), 'utf8')).toBe('{"brief":true}\n')
		expect(readFileSync(join(lot, 'plan.md'), 'utf8')).toBe('# the plan\n')
		expect(JSON.parse(readFileSync(join(lot, 'identity.json'), 'utf8'))).toEqual(
			identityOf({ name: LOT_NAME }),
		)
		expect(JSON.parse(readFileSync(join(lot, 'transitions', '000001.json'), 'utf8'))).toEqual(
			transitionOf({ seq: 1 }),
		)
		expect(
			['brief.json', 'plan.md', 'identity.json', 'transitions/000001.json'].map(
				(name) => statSync(join(lot, name)).mode & 0o777,
			),
		).toEqual([0o444, 0o444, 0o444, 0o444])
	})

	it('while it is built → in .<name>.tmp-<pid>/ without identity.json, the name itself absent', () => {
		const store = newStore()
		const seen: { name: string; entries: string[]; finalExists: boolean }[] = []

		expect(
			publishLotFolder(
				lotParams({
					store,
					beforeIdentity: function observe(temporaryFolder) {
						seen.push({
							name: temporaryFolder.slice(store.length + 1),
							entries: readdirSync(temporaryFolder).sort(),
							finalExists: existsSync(join(store, LOT_NAME)),
						})
					},
				}),
			),
		).toBe(true)
		expect(seen).toEqual([
			{
				name: `.${LOT_NAME}.tmp-${process.pid}`,
				entries: ['brief.json', 'plan.md', 'transitions'],
				finalExists: false,
			},
		])
	})

	it('identity.json written, not yet renamed → the temporary holds it, the name itself still absent and no lot listed', () => {
		const store = newStore()
		const seen: { entries: string[]; finalExists: boolean; lots: string[] }[] = []

		expect(
			publishLotFolder(
				lotParams({
					store,
					beforeRename: function observe(temporaryFolder) {
						seen.push({
							entries: readdirSync(temporaryFolder).sort(),
							finalExists: existsSync(join(store, LOT_NAME)),
							lots: listLotNames({ store }),
						})
					},
				}),
			),
		).toBe(true)
		expect(seen).toEqual([
			{
				entries: ['brief.json', 'identity.json', 'plan.md', 'transitions'],
				finalExists: false,
				lots: [],
			},
		])
	})

	it('the name exists already → false, nothing replaced, no temporary left', () => {
		const store = newStore()
		writeRecordFile({ folder: join(store, LOT_NAME), name: 'marker.txt', text: 'mine' })

		expect(publishLotFolder(lotParams({ store }))).toBe(false)
		expect(readdirSync(store)).toEqual([LOT_NAME])
		expect(readdirSync(join(store, LOT_NAME))).toEqual(['marker.txt'])
		expect(readFileSync(join(store, LOT_NAME, 'marker.txt'), 'utf8')).toBe('mine')
	})

	it('the name exists already as an empty folder → false, the folder still empty, no temporary left', () => {
		const store = newStore()
		mkdirSync(join(store, LOT_NAME))

		expect(publishLotFolder(lotParams({ store }))).toBe(false)
		expect(readdirSync(store)).toEqual([LOT_NAME])
		expect(readdirSync(join(store, LOT_NAME))).toEqual([])
	})

	it('a .tmp- folder of a dead pid → removed by the next build; one of another live pid kept (case 27)', () => {
		const store = newStore()
		const dead = `.0009-repo-old.tmp-${deadPid()}`
		const live = `.0008-repo-other.tmp-${otherLivePid()}`
		writeRecordFile({ folder: join(store, dead), name: 'brief.json', text: '{}' })
		writeRecordFile({ folder: join(store, live), name: 'brief.json', text: '{}' })

		expect(publishLotFolder(lotParams({ store }))).toBe(true)
		expect(readdirSync(store).sort()).toEqual([live, LOT_NAME].sort())
	})
})

describe('listLotNames', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('lots with an identity.json → their names, sorted; a folder without one, a .tmp- folder and a file are no lot', () => {
		const store = newStore()
		for (const name of ['0002-repo-b', '0001-repo-a']) {
			writeRecordFile({
				folder: join(store, name),
				name: 'identity.json',
				text: JSON.stringify(identityOf({ name })),
			})
		}
		writeRecordFile({
			folder: join(store, '0003-repo-no-identity'),
			name: 'brief.json',
			text: '{}',
		})
		writeRecordFile({
			folder: join(store, `.0004-repo-c.tmp-${deadPid()}`),
			name: 'identity.json',
			text: JSON.stringify(identityOf({ name: '0004-repo-c' })),
		})
		writeFileSync(join(store, 'stray.txt'), '')

		expect(listLotNames({ store })).toEqual(['0001-repo-a', '0002-repo-b'])
	})

	it('a store folder that does not exist → none', () => {
		const store = join(temporaryFolder('dialecte-store-'), 'dialecte-lots')

		expect(listLotNames({ store })).toEqual([])
	})
})
