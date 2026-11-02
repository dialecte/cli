import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { createScratchRepository, temporaryFolder } from '../../../test/scratch-repository.ts'
import { addWorktree, commonGitDirOf } from '../../../test/scratch-tree.ts'
import {
	INCREMENTAL_FILES_KEPT_PER_PACKAGE,
	INCREMENTAL_STORE_FOLDER,
} from './incremental-cache.constants.ts'
import {
	incrementalCachePathOf,
	seedIncrementalFile,
	storeIncrementalFile,
} from './incremental-cache.ts'
import { MUTATION_STORE_FOLDER } from './mutation.constants.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

// a spy around the real renameSync, so a case can run code between a store's temporary write and its rename
const renameHook = vi.hoisted(() => ({ before: undefined as undefined | (() => void) }))
// and around readFileSync, so a case can run code just before a file is read
// and around rmSync, so a case can have another writer remove a file first
const removeHook = vi.hoisted(() => ({ removedFirst: false, armed: false }))
const readHook = vi.hoisted(() => ({
	before: undefined as undefined | ((path: string) => void),
	after: undefined as undefined | ((path: string) => void),
}))
// and around statSync / lstatSync: an armed hook removes the first `-old` store file about to be stat'd
const statHook = vi.hoisted(() => ({ armed: false, ran: false }))
vi.mock('node:fs', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:fs')>()
	function removeBeforeStat(path: string): void {
		if (!statHook.armed || !path.includes('-old')) return
		statHook.armed = false
		statHook.ran = true
		actual.rmSync(path, { force: true })
	}
	return {
		...actual,
		readFileSync: (...args: Parameters<typeof actual.readFileSync>) => {
			const before = readHook.before
			if (before !== undefined && String(args[0]).endsWith('.json')) {
				readHook.before = undefined
				before(String(args[0]))
			}
			const text = actual.readFileSync(...args)
			const after = readHook.after
			if (after !== undefined && String(args[0]).endsWith('.json')) {
				readHook.after = undefined
				after(String(args[0]))
			}
			return text
		},
		statSync: (...args: Parameters<typeof actual.statSync>) => {
			removeBeforeStat(String(args[0]))
			return actual.statSync(...args)
		},
		lstatSync: (...args: Parameters<typeof actual.lstatSync>) => {
			removeBeforeStat(String(args[0]))
			return actual.lstatSync(...args)
		},
		rmSync: (...args: Parameters<typeof actual.rmSync>) => {
			if (removeHook.armed) {
				removeHook.armed = false
				removeHook.removedFirst = true
				actual.rmSync(args[0], { force: true })
			}
			return actual.rmSync(...args)
		},
		renameSync: (...args: Parameters<typeof actual.renameSync>) => {
			const before = renameHook.before
			renameHook.before = undefined
			before?.()
			return actual.renameSync(...args)
		},
	}
})

afterEach(() => {
	renameHook.before = undefined
	readHook.before = undefined
	readHook.after = undefined
	statHook.armed = false
	statHook.ran = false
	removeHook.armed = false
	removeHook.removedFirst = false
})

const PACKAGE_HASH = '0123456789abcdef'
const OTHER_PACKAGE_HASH = 'fedcba9876543210'
const KEY = 'a'.repeat(64)
const FILE_A = '{"files":{"a.ts":{"mutants":[{"id":"1","status":"Killed"}]}}}\n'
const FILE_B = '{"files":{"b.ts":{"mutants":[{"id":"2","status":"Survived"}]}}}\n'

/** A scratch repository, and a work folder apart from it holding the file Stryker would write. */
function setup(): { root: string; storePath: string; workFile: string; storeFolder: string } {
	const root = createScratchRepository()
	const storeFolder = join(commonGitDirOf(root), MUTATION_STORE_FOLDER, INCREMENTAL_STORE_FOLDER)
	return {
		root,
		storeFolder,
		storePath: join(storeFolder, `${PACKAGE_HASH}-${KEY}.json`),
		workFile: join(temporaryFolder('dialecte-incremental-work-'), 'incremental.json'),
	}
}

/** The text of a file, or undefined when there is none (so a missing file fails the assertion, not the case). */
function textAt(path: string): string | undefined {
	return existsSync(path) ? readFileSync(path, 'utf8') : undefined
}

/** A second work file, in a folder of its own. */
function otherWorkFile(): string {
	return join(temporaryFolder('dialecte-incremental-work-'), 'incremental.json')
}

/** A file in the store, put there by hand (the store's own writer is not what the case is about). */
function putStored(params: { storeFolder: string; storePath: string; text: string }): void {
	mkdirSync(params.storeFolder, { recursive: true })
	writeFileSync(params.storePath, params.text)
}

describe('incrementalCachePathOf', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('→ <git-common-dir>/dialecte-mutation/incremental/<packageHash>-<key>.json', () => {
		const { root, storePath } = setup()

		expect(incrementalCachePathOf({ root, packageHash: PACKAGE_HASH, key: KEY })).toBe(storePath)
	})

	it('another package hash → another path', () => {
		const { root } = setup()

		expect(incrementalCachePathOf({ root, packageHash: OTHER_PACKAGE_HASH, key: KEY })).toBe(
			join(
				commonGitDirOf(root),
				MUTATION_STORE_FOLDER,
				INCREMENTAL_STORE_FOLDER,
				`${OTHER_PACKAGE_HASH}-${KEY}.json`,
			),
		)
	})

	it('from another worktree of the repository → the same path', () => {
		const { root } = setup()
		const second = addWorktree(root)

		expect(incrementalCachePathOf({ root: second, packageHash: PACKAGE_HASH, key: KEY })).toBe(
			incrementalCachePathOf({ root, packageHash: PACKAGE_HASH, key: KEY }),
		)
	})
})

describe('seedIncrementalFile', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('no store file → cold, nothing written at incrementalFile', () => {
		const { root, workFile } = setup()

		expect(
			seedIncrementalFile({ root, packageHash: PACKAGE_HASH, key: KEY, incrementalFile: workFile }),
		).toBe('cold')
		expect(existsSync(workFile)).toBe(false)
	})

	it('a store file → warm, incrementalFile holds its bytes', () => {
		const { root, workFile, storePath, storeFolder } = setup()
		putStored({ storeFolder, storePath, text: FILE_A })

		expect(
			seedIncrementalFile({ root, packageHash: PACKAGE_HASH, key: KEY, incrementalFile: workFile }),
		).toBe('warm')
		expect(textAt(workFile)).toBe(FILE_A)
		expect(textAt(storePath)).toBe(FILE_A)
	})

	it('an unparsable store file → cold, nothing written at incrementalFile', () => {
		const { root, workFile, storeFolder, storePath } = setup()
		putStored({ storeFolder, storePath, text: '{ broken' })

		expect(
			seedIncrementalFile({ root, packageHash: PACKAGE_HASH, key: KEY, incrementalFile: workFile }),
		).toBe('cold')
		expect(existsSync(workFile)).toBe(false)
	})
})

describe('storeIncrementalFile', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a parsable work file → true, the store path holds its bytes, no *.tmp left', () => {
		const { root, workFile, storePath, storeFolder } = setup()
		writeFileSync(workFile, FILE_A)

		expect(
			storeIncrementalFile({
				root,
				packageHash: PACKAGE_HASH,
				key: KEY,
				incrementalFile: workFile,
			}),
		).toBe(true)
		expect(textAt(storePath)).toBe(FILE_A)
		expect(readdirSync(storeFolder)).toEqual([`${PACKAGE_HASH}-${KEY}.json`])
	})

	it('a missing work file, nothing stored before → false, the store still has no file', () => {
		const { root, workFile, storePath } = setup()

		expect(
			storeIncrementalFile({
				root,
				packageHash: PACKAGE_HASH,
				key: KEY,
				incrementalFile: workFile,
			}),
		).toBe(false)
		expect(existsSync(storePath)).toBe(false)
	})

	it('a missing work file, a stored file before → false, the store byte-for-byte unchanged', () => {
		const { root, workFile, storePath, storeFolder } = setup()
		putStored({ storeFolder, storePath, text: FILE_A })

		expect(
			storeIncrementalFile({
				root,
				packageHash: PACKAGE_HASH,
				key: KEY,
				incrementalFile: workFile,
			}),
		).toBe(false)
		expect(textAt(storePath)).toBe(FILE_A)
		expect(readdirSync(storeFolder)).toEqual([`${PACKAGE_HASH}-${KEY}.json`])
	})

	it('an unparsable work file, a stored file before → false, the store byte-for-byte unchanged', () => {
		const { root, workFile, storePath, storeFolder } = setup()
		putStored({ storeFolder, storePath, text: FILE_A })
		writeFileSync(workFile, '{"cut off')

		expect(
			storeIncrementalFile({
				root,
				packageHash: PACKAGE_HASH,
				key: KEY,
				incrementalFile: workFile,
			}),
		).toBe(false)
		expect(textAt(storePath)).toBe(FILE_A)
		expect(readdirSync(storeFolder)).toEqual([`${PACKAGE_HASH}-${KEY}.json`])
	})

	it('an unparsable work file, nothing stored before → false, the store still has no file', () => {
		const { root, workFile, storePath } = setup()
		writeFileSync(workFile, '{"cut off')

		expect(
			storeIncrementalFile({
				root,
				packageHash: PACKAGE_HASH,
				key: KEY,
				incrementalFile: workFile,
			}),
		).toBe(false)
		expect(existsSync(storePath)).toBe(false)
	})
})

describe(
	'an unparsable store file, then a write-back',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a parsable work file → true, the store now holds the new bytes', () => {
			const { root, workFile, storePath, storeFolder } = setup()
			putStored({ storeFolder, storePath, text: '{ broken' })
			writeFileSync(workFile, FILE_B)

			expect(
				storeIncrementalFile({
					root,
					packageHash: PACKAGE_HASH,
					key: KEY,
					incrementalFile: workFile,
				}),
			).toBe(true)
			expect(textAt(storePath)).toBe(FILE_B)
			expect(readdirSync(storeFolder)).toEqual([`${PACKAGE_HASH}-${KEY}.json`])
		})
	},
)

describe('two runs of one key (forced order)', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('interleaving 1: stores in the order A, B → B holds; a seed between the writes gets A whole, a seed after gets B', () => {
		const { root, storePath } = setup()
		const runA = otherWorkFile()
		const runB = otherWorkFile()
		const seeded = otherWorkFile()
		writeFileSync(runA, FILE_A)
		writeFileSync(runB, FILE_B)

		expect(
			storeIncrementalFile({ root, packageHash: PACKAGE_HASH, key: KEY, incrementalFile: runA }),
		).toBe(true)
		expect(
			seedIncrementalFile({ root, packageHash: PACKAGE_HASH, key: KEY, incrementalFile: seeded }),
		).toBe('warm')
		expect(textAt(seeded)).toBe(FILE_A)
		expect(
			storeIncrementalFile({ root, packageHash: PACKAGE_HASH, key: KEY, incrementalFile: runB }),
		).toBe(true)
		expect(textAt(storePath)).toBe(FILE_B)
		expect(JSON.parse(textAt(storePath) ?? 'null')).toEqual(JSON.parse(FILE_B))
		expect(
			seedIncrementalFile({ root, packageHash: PACKAGE_HASH, key: KEY, incrementalFile: seeded }),
		).toBe('warm')
		expect(textAt(seeded)).toBe(FILE_B)
	})

	it('interleaving 1: stores in the order B, A → A holds; a seed between the writes gets B whole, a seed after gets A', () => {
		const { root, storePath } = setup()
		const runA = otherWorkFile()
		const runB = otherWorkFile()
		const seeded = otherWorkFile()
		writeFileSync(runA, FILE_A)
		writeFileSync(runB, FILE_B)

		expect(
			storeIncrementalFile({ root, packageHash: PACKAGE_HASH, key: KEY, incrementalFile: runB }),
		).toBe(true)
		expect(
			seedIncrementalFile({ root, packageHash: PACKAGE_HASH, key: KEY, incrementalFile: seeded }),
		).toBe('warm')
		expect(textAt(seeded)).toBe(FILE_B)
		expect(
			storeIncrementalFile({ root, packageHash: PACKAGE_HASH, key: KEY, incrementalFile: runA }),
		).toBe(true)
		expect(textAt(storePath)).toBe(FILE_A)
		expect(JSON.parse(textAt(storePath) ?? 'null')).toEqual(JSON.parse(FILE_A))
		expect(
			seedIncrementalFile({ root, packageHash: PACKAGE_HASH, key: KEY, incrementalFile: seeded }),
		).toBe('warm')
		expect(textAt(seeded)).toBe(FILE_A)
	})

	it("interleaving 2: a seed run between a store's temporary write and its rename → the previous whole file", () => {
		const { root, storePath, storeFolder } = setup()
		const next = otherWorkFile()
		const seeded = otherWorkFile()
		putStored({ storeFolder, storePath, text: FILE_A })
		writeFileSync(next, FILE_B)
		const seen: { text?: string } = {}
		const hook = { ran: false }
		renameHook.before = function seedMidWrite() {
			hook.ran = true
			expect(
				seedIncrementalFile({ root, packageHash: PACKAGE_HASH, key: KEY, incrementalFile: seeded }),
			).toBe('warm')
			seen.text = textAt(seeded)
		}

		expect(
			storeIncrementalFile({ root, packageHash: PACKAGE_HASH, key: KEY, incrementalFile: next }),
		).toBe(true)
		// the hook ran: the store wrote through a rename
		expect(hook.ran).toBe(true)
		expect(seen.text).toBe(FILE_A)
		expect(textAt(storePath)).toBe(FILE_B)
	})

	it("interleaving 2: a seed run between the first store's temporary write and its rename → cold", () => {
		const { root, storePath } = setup()
		const next = otherWorkFile()
		const seeded = otherWorkFile()
		writeFileSync(next, FILE_B)
		const hook = { ran: false }
		renameHook.before = function seedMidWrite() {
			hook.ran = true
			expect(
				seedIncrementalFile({ root, packageHash: PACKAGE_HASH, key: KEY, incrementalFile: seeded }),
			).toBe('cold')
		}

		expect(
			storeIncrementalFile({ root, packageHash: PACKAGE_HASH, key: KEY, incrementalFile: next }),
		).toBe(true)
		expect(hook.ran).toBe(true)
		expect(existsSync(seeded)).toBe(false)
		expect(textAt(storePath)).toBe(FILE_B)
	})
})

/** The store's files named `<packageHash>-<name>.json`, by name, sorted. */
function namesOf(params: { storeFolder: string; packageHash: string }): string[] {
	return readdirSync(params.storeFolder)
		.filter((file) => file.startsWith(`${params.packageHash}-`) && file.endsWith('.json'))
		.sort()
}

/** A store file of `packageHash` named by `name`, put there by hand, its modification time `secondsFromNow` from now. */
function putAged(params: {
	storeFolder: string
	packageHash: string
	name: string
	secondsFromNow: number
	text?: string
}): void {
	const path = join(params.storeFolder, `${params.packageHash}-${params.name}.json`)
	putStored({ storeFolder: params.storeFolder, storePath: path, text: params.text ?? FILE_A })
	const when = new Date(Date.now() + params.secondsFromNow * 1000)
	utimesSync(path, when, when)
}

/** The store as four files of the package (oldest first, in the past) and one of another package. */
function fullStore(): ReturnType<typeof setup> & { olderNames: string[] } {
	const context = setup()
	const olderNames = ['old1', 'old2', 'old3', 'old4']
	olderNames.forEach((name, index) =>
		putAged({
			storeFolder: context.storeFolder,
			packageHash: PACKAGE_HASH,
			name,
			secondsFromNow: -1000 + index * 10,
		}),
	)
	putAged({
		storeFolder: context.storeFolder,
		packageHash: OTHER_PACKAGE_HASH,
		name: 'theirs',
		secondsFromNow: -5000,
		text: FILE_B,
	})
	return { ...context, olderNames }
}

describe(
	'eviction: the newest files of a package are kept',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it.each([
			['A then B', ['keyA', 'keyB']],
			['B then A', ['keyB', 'keyA']],
		])(
			'interleaving 5: two writers, %s, the store holding 4 files of the package → each survives its own eviction; 4 remain, the two newest among them; the other package is untouched',
			(_order, keys) => {
				const { root, storeFolder } = fullStore()
				const writes = keys.map((name) => {
					const workFile = otherWorkFile()
					writeFileSync(workFile, FILE_B)
					return { name, workFile }
				})
				const [first, second] = writes as [(typeof writes)[number], (typeof writes)[number]]

				expect(
					storeIncrementalFile({
						root,
						packageHash: PACKAGE_HASH,
						key: first.name,
						incrementalFile: first.workFile,
					}),
				).toBe(true)
				expect(namesOf({ storeFolder, packageHash: PACKAGE_HASH })).toHaveLength(
					INCREMENTAL_FILES_KEPT_PER_PACKAGE,
				)
				expect(namesOf({ storeFolder, packageHash: PACKAGE_HASH })).toContain(
					`${PACKAGE_HASH}-${first.name}.json`,
				)
				expect(
					storeIncrementalFile({
						root,
						packageHash: PACKAGE_HASH,
						key: second.name,
						incrementalFile: second.workFile,
					}),
				).toBe(true)

				expect(namesOf({ storeFolder, packageHash: PACKAGE_HASH })).toEqual([
					`${PACKAGE_HASH}-keyA.json`,
					`${PACKAGE_HASH}-keyB.json`,
					`${PACKAGE_HASH}-old3.json`,
					`${PACKAGE_HASH}-old4.json`,
				])
				expect(textAt(join(storeFolder, `${OTHER_PACKAGE_HASH}-theirs.json`))).toBe(FILE_B)
			},
		)

		it('interleaving 6: the file just written is kept although its modification time is older than the others', () => {
			const context = setup()
			const { root, storeFolder } = context
			;['f1', 'f2', 'f3', 'f4'].forEach((name, index) =>
				putAged({
					storeFolder,
					packageHash: PACKAGE_HASH,
					name,
					secondsFromNow: 3600 * (index + 1),
				}),
			)
			writeFileSync(context.workFile, FILE_B)

			expect(
				storeIncrementalFile({
					root,
					packageHash: PACKAGE_HASH,
					key: 'fresh',
					incrementalFile: context.workFile,
				}),
			).toBe(true)
			expect(namesOf({ storeFolder, packageHash: PACKAGE_HASH })).toEqual([
				`${PACKAGE_HASH}-f2.json`,
				`${PACKAGE_HASH}-f3.json`,
				`${PACKAGE_HASH}-f4.json`,
				`${PACKAGE_HASH}-fresh.json`,
			])
		})

		it('a package with fewer than 4 files → nothing is evicted', () => {
			const context = setup()
			putAged({
				storeFolder: context.storeFolder,
				packageHash: PACKAGE_HASH,
				name: 'one',
				secondsFromNow: -10,
			})
			writeFileSync(context.workFile, FILE_B)

			expect(
				storeIncrementalFile({
					root: context.root,
					packageHash: PACKAGE_HASH,
					key: 'two',
					incrementalFile: context.workFile,
				}),
			).toBe(true)
			expect(namesOf({ storeFolder: context.storeFolder, packageHash: PACKAGE_HASH })).toEqual([
				`${PACKAGE_HASH}-one.json`,
				`${PACKAGE_HASH}-two.json`,
			])
		})

		it('*.tmp files and foreign names, however old → never evicted', () => {
			const { root, storeFolder, workFile } = fullStore()
			const foreign = [
				`${PACKAGE_HASH}-old5.json.123.abcd.tmp`,
				'notes.txt',
				'other.json',
				`${PACKAGE_HASH}.json`,
			]
			for (const name of foreign) {
				writeFileSync(join(storeFolder, name), 'x')
				utimesSync(join(storeFolder, name), new Date(0), new Date(0))
			}
			writeFileSync(workFile, FILE_B)

			expect(
				storeIncrementalFile({
					root,
					packageHash: PACKAGE_HASH,
					key: 'fresh',
					incrementalFile: workFile,
				}),
			).toBe(true)
			expect(
				readdirSync(storeFolder)
					.filter((name) => foreign.includes(name))
					.sort(),
			).toEqual([...foreign].sort())
			expect(namesOf({ storeFolder, packageHash: PACKAGE_HASH })).toHaveLength(
				INCREMENTAL_FILES_KEPT_PER_PACKAGE,
			)
			expect(namesOf({ storeFolder, packageHash: PACKAGE_HASH })).toContain(
				`${PACKAGE_HASH}-fresh.json`,
			)
		})

		it('a file another writer removed first → no error, the others still evicted', () => {
			const { root, storeFolder, workFile } = fullStore()
			writeFileSync(workFile, FILE_B)
			// the first file the eviction removes is gone already, as if another writer's eviction took it
			removeHook.armed = true

			expect(
				storeIncrementalFile({
					root,
					packageHash: PACKAGE_HASH,
					key: 'fresh',
					incrementalFile: workFile,
				}),
			).toBe(true)
			expect(removeHook.removedFirst).toBe(true)
			expect(namesOf({ storeFolder, packageHash: PACKAGE_HASH })).toHaveLength(
				INCREMENTAL_FILES_KEPT_PER_PACKAGE,
			)
		})
	},
)

describe('eviction: the edge cases', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a listed file removed between the folder listing and its stat → true, no throw, 4 kept, the just-written one among them', () => {
		const { root, storeFolder, workFile } = fullStore()
		writeFileSync(workFile, FILE_B)
		statHook.armed = true

		expect(
			storeIncrementalFile({
				root,
				packageHash: PACKAGE_HASH,
				key: 'fresh',
				incrementalFile: workFile,
			}),
		).toBe(true)
		expect(statHook.ran).toBe(true)
		expect(namesOf({ storeFolder, packageHash: PACKAGE_HASH })).toHaveLength(
			INCREMENTAL_FILES_KEPT_PER_PACKAGE,
		)
		expect(namesOf({ storeFolder, packageHash: PACKAGE_HASH })).toContain(
			`${PACKAGE_HASH}-fresh.json`,
		)
	})

	it('two files with the same modification time at the boundary → the greater name counts as newer and is kept', () => {
		const context = setup()
		const { root, storeFolder, workFile } = context
		;['a', 'b', 'c', 'd'].forEach((name) =>
			putAged({ storeFolder, packageHash: PACKAGE_HASH, name, secondsFromNow: -100 }),
		)
		const sameTime = new Date(Date.now() - 100_000)
		for (const name of ['a', 'b', 'c', 'd'])
			utimesSync(join(storeFolder, `${PACKAGE_HASH}-${name}.json`), sameTime, sameTime)
		writeFileSync(workFile, FILE_B)

		expect(
			storeIncrementalFile({
				root,
				packageHash: PACKAGE_HASH,
				key: 'fresh',
				incrementalFile: workFile,
			}),
		).toBe(true)
		expect(namesOf({ storeFolder, packageHash: PACKAGE_HASH })).toEqual([
			`${PACKAGE_HASH}-b.json`,
			`${PACKAGE_HASH}-c.json`,
			`${PACKAGE_HASH}-d.json`,
			`${PACKAGE_HASH}-fresh.json`,
		])
	})

	it.each([
		['missing', undefined],
		['unparsable', '{"cut off'],
	])(
		'a write-back returning false (%s work file), 6 files of the package placed by hand → nothing evicted',
		(_name, text) => {
			const { root, storeFolder, workFile } = setup()
			const names = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6']
			names.forEach((name, index) =>
				putAged({ storeFolder, packageHash: PACKAGE_HASH, name, secondsFromNow: -100 + index }),
			)
			if (text !== undefined) writeFileSync(workFile, text)

			expect(
				storeIncrementalFile({
					root,
					packageHash: PACKAGE_HASH,
					key: 'fresh',
					incrementalFile: workFile,
				}),
			).toBe(false)
			expect(namesOf({ storeFolder, packageHash: PACKAGE_HASH })).toEqual(
				names.map((name) => `${PACKAGE_HASH}-${name}.json`),
			)
		},
	)
})

describe('a seed racing an eviction', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('interleaving 7: the store file removed after the existence check, before the read → cold, no throw, nothing written', () => {
		const { root, workFile, storePath, storeFolder } = setup()
		putStored({ storeFolder, storePath, text: FILE_A })
		const hook = { ran: false }
		readHook.before = function evictBeforeRead(path) {
			hook.ran = true
			rmSync(path, { force: true })
		}

		expect(
			seedIncrementalFile({ root, packageHash: PACKAGE_HASH, key: KEY, incrementalFile: workFile }),
		).toBe('cold')
		expect(hook.ran).toBe(true)
		expect(existsSync(workFile)).toBe(false)
	})

	it('interleaving 7: the store file removed right after the seed read it → warm, incrementalFile holds the bytes it read', () => {
		const { root, workFile, storePath, storeFolder } = setup()
		putStored({ storeFolder, storePath, text: FILE_A })
		const hook = { ran: false }
		readHook.after = function evictAfterRead(path) {
			hook.ran = true
			rmSync(path, { force: true })
		}

		expect(
			seedIncrementalFile({ root, packageHash: PACKAGE_HASH, key: KEY, incrementalFile: workFile }),
		).toBe('warm')
		expect(hook.ran).toBe(true)
		expect(textAt(workFile)).toBe(FILE_A)
	})
})
