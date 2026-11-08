import {
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { PERMISSION_BITS, WRITABLE_MODE } from '../../../test/replacement-observer.constants.ts'
import {
	observeReplacement,
	publishedFromTemporary,
	temporariesLeftBeside,
} from '../../../test/replacement-observer.ts'
import { createScratchRepository, temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { thrownBy } from '../../../test/thrown-by.ts'
import {
	BRANCH,
	FIRST_WRITE,
	OLD_CLI_ENTRY_STATE,
	SECOND_WRITE,
} from './handover-store-atomic.constants.ts'
import { entryPathOf, readStoreEntry } from './handover-store-read.ts'
import {
	handoverStoreOf,
	nextHandoverName,
	recordHandoverState,
	registerHandover,
} from './handover-store.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { EntryStateRecord, HandWrittenEntryParams } from './handover-store-atomic.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** A scratch repository, its registry's location, and a hand-over folder outside it; XDG_STATE_HOME is the test's own. */
function createRegistryScenario() {
	vi.stubEnv('XDG_STATE_HOME', temporaryFolder('dialecte-state-'))
	const root = createScratchRepository()
	const folder = realpathSync(temporaryFolder('dialecte-handover-'))
	const store = handoverStoreOf(root)
	const name = nextHandoverName({ store, branch: BRANCH, now: FIRST_WRITE })
	return { root, folder, store, name, entryPath: entryPathOf({ store, name }) }
}

/** The entry text of a hand-over in `state`, as an entry written by hand holds it. */
function handWrittenEntry(params: HandWrittenEntryParams): string {
	return `${JSON.stringify(
		{
			folder: params.folder,
			branch: BRANCH,
			worktree: '/work/.worktrees/0001-x',
			written: FIRST_WRITE.toISOString(),
			state: params.state,
		},
		null,
		2,
	)}\n`
}

function stateOfTemporary(temporaryBytes: Buffer): unknown {
	return (JSON.parse(temporaryBytes.toString('utf8')) as EntryStateRecord).state
}

describe('writeStoreEntry: the entry is replaced whole', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a registered folder, its state recorded committed → a reader of the entry sees the old bytes until the rename, the state never flips, the new bytes after', () => {
		const { root, folder, store, name, entryPath } = createRegistryScenario()
		registerHandover({ root, folder, branch: BRANCH, now: FIRST_WRITE })
		const oldBytes = readFileSync(entryPath)
		const observer = observeReplacement({ path: entryPath })
		const statesSeen: unknown[] = []
		function seamReadingTheState(temporaryPath: string): void {
			observer.seam(temporaryPath)
			statesSeen.push(readStoreEntry({ store, name })?.state)
		}

		expect(
			recordHandoverState({
				store,
				folder,
				state: 'committed',
				afterTemporaryWritten: seamReadingTheState,
			}),
		).toBeUndefined()

		expect(observer.observations).toHaveLength(1)
		expect(observer.observations[0].temporaryIsOwn).toBe(true)
		expect(observer.observations[0].finalBytes).toEqual(oldBytes)
		expect(observer.observations[0].temporaryMode).toBe(WRITABLE_MODE)
		expect(stateOfTemporary(observer.observations[0].temporaryBytes)).toBe('committed')
		expect(statesSeen).toEqual(['pending'])
		expect(readStoreEntry({ store, name })?.state).toBe('committed')
		expect(readFileSync(entryPath)).toEqual(observer.observations[0].temporaryBytes)
		expect(publishedFromTemporary({ observer, path: entryPath })).toBe(true)
		expect(statSync(entryPath).mode & PERMISSION_BITS).toBe(WRITABLE_MODE)
		expect(temporariesLeftBeside(entryPath)).toEqual([])
	})

	it('a registered folder registered again → the entry is replaced through a temporary, the old bytes whole until the rename, the same name answered', () => {
		const { root, folder, store, name, entryPath } = createRegistryScenario()
		registerHandover({ root, folder, branch: BRANCH, now: FIRST_WRITE })
		const oldBytes = readFileSync(entryPath)
		const observer = observeReplacement({ path: entryPath })

		expect(
			registerHandover({
				root,
				folder,
				branch: BRANCH,
				now: SECOND_WRITE,
				afterTemporaryWritten: observer.seam,
			}),
		).toBe(name)

		expect(observer.observations).toHaveLength(1)
		expect(observer.observations[0].temporaryIsOwn).toBe(true)
		expect(observer.observations[0].finalBytes).toEqual(oldBytes)
		expect(observer.observations[0].temporaryMode).toBe(WRITABLE_MODE)
		expect(readStoreEntry({ store, name })?.written).toBe(SECOND_WRITE.toISOString())
		expect(readFileSync(entryPath)).toEqual(observer.observations[0].temporaryBytes)
		expect(publishedFromTemporary({ observer, path: entryPath })).toBe(true)
		expect(statSync(entryPath).mode & PERMISSION_BITS).toBe(WRITABLE_MODE)
		expect(temporariesLeftBeside(entryPath)).toEqual([])
	})
})

describe('createStoreEntry: exclusive, whole and writable', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a new folder → the name does not exist while the temporary waits, the temporary holds the whole entry at 0644, the published entry is 0644 and the same bytes', () => {
		const { root, folder, store, name, entryPath } = createRegistryScenario()
		const observer = observeReplacement({ path: entryPath })

		expect(
			registerHandover({
				root,
				folder,
				branch: BRANCH,
				now: FIRST_WRITE,
				afterTemporaryWritten: observer.seam,
			}),
		).toBe(name)

		expect(observer.observations).toHaveLength(1)
		expect(observer.observations[0].temporaryIsOwn).toBe(true)
		expect(observer.observations[0].finalBytes).toBeUndefined()
		expect(observer.observations[0].temporaryMode).toBe(WRITABLE_MODE)
		expect(readFileSync(entryPath)).toEqual(observer.observations[0].temporaryBytes)
		expect(publishedFromTemporary({ observer, path: entryPath })).toBe(true)
		expect(statSync(entryPath).mode & PERMISSION_BITS).toBe(WRITABLE_MODE)
		expect(readStoreEntry({ store, name })?.folder).toBe(folder)
		expect(temporariesLeftBeside(entryPath)).toEqual([])
	})

	it('another writer takes the name while the temporary waits → this writer loses and registers under the next name, the other entry kept byte for byte', () => {
		const { root, folder, store, name, entryPath } = createRegistryScenario()
		const otherFolder = realpathSync(temporaryFolder('dialecte-other-handover-'))
		const otherText = handWrittenEntry({ folder: otherFolder, state: 'pending' })
		let interlopers = 0
		function takeTheNameOnce(): void {
			if (interlopers > 0) return
			interlopers += 1
			mkdirSync(store, { recursive: true })
			writeFileSync(entryPath, otherText, { flag: 'wx' })
		}

		expect(
			registerHandover({
				root,
				folder,
				branch: BRANCH,
				now: FIRST_WRITE,
				afterTemporaryWritten: takeTheNameOnce,
			}),
		).toBe(`${name}-2`)

		expect(interlopers).toBe(1)
		expect(readFileSync(entryPath)).toEqual(Buffer.from(otherText))
		expect(readStoreEntry({ store, name: `${name}-2` })?.folder).toBe(folder)
		expect(readdirSync(store).sort()).toEqual([`${name}-2.json`, `${name}.json`])
	})

	it('an entry created by this cli, then rewritten by an older cli with a plain writeFileSync → the write succeeds and the entry reads committed', () => {
		const { root, folder, store, name, entryPath } = createRegistryScenario()
		const observer = observeReplacement({ path: entryPath })
		registerHandover({
			root,
			folder,
			branch: BRANCH,
			now: FIRST_WRITE,
			afterTemporaryWritten: observer.seam,
		})
		const olderCliText = handWrittenEntry({ folder, state: OLD_CLI_ENTRY_STATE })

		expect(observer.observations.map((seen) => seen.temporaryMode)).toEqual([WRITABLE_MODE])
		expect(statSync(entryPath).mode & PERMISSION_BITS).toBe(WRITABLE_MODE)
		expect(writeFileSync(entryPath, olderCliText)).toBeUndefined()
		expect(readFileSync(entryPath)).toEqual(Buffer.from(olderCliText))
		expect(readStoreEntry({ store, name })?.state).toBe('committed')
	})
})

describe('registerHandover never un-commits a hand-over', { timeout: STORE_CASE_TIMEOUT }, () => {
	it.each([
		{ spelling: 'the folder as the entry holds it', linked: false },
		{ spelling: 'a link to the folder', linked: true },
	])(
		'an entry written committed for the folder, registered again by $spelling → throws a refusal naming the entry, the entry unchanged, no other entry',
		({ linked }) => {
			const { root, folder, store, name, entryPath } = createRegistryScenario()
			const entryText = handWrittenEntry({ folder, state: 'committed' })
			mkdirSync(store, { recursive: true })
			writeFileSync(entryPath, entryText)
			const given = linked ? join(temporaryFolder('dialecte-link-'), 'linked-folder') : folder
			if (linked) symlinkSync(folder, given)
			function registerAgain(): string {
				return registerHandover({ root, folder: given, branch: BRANCH, now: SECOND_WRITE })
			}

			expect(thrownBy(registerAgain)).toBeInstanceOf(Error)
			expect(thrownBy(registerAgain)?.message).toContain(name)
			expect(readFileSync(entryPath)).toEqual(Buffer.from(entryText))
			expect(readdirSync(store)).toEqual([`${name}.json`])
		},
	)
})
