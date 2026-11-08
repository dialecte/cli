import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { reachFrom } from '../../../test/import-reach.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { readStoreEntries, readStoreEntry, registeredEntryOf } from './handover-store-read.ts'

import { describe, expect, it } from 'vitest'

const READ_MODULE = join(import.meta.dirname, 'handover-store-read.ts')
const STORE_MODULE = join(import.meta.dirname, 'handover-store.ts')

/** A registry folder holding the entries `name → fields`. */
function registryWith(entries: Record<string, object | string>): string {
	const store = join(temporaryFolder('dialecte-registry-'), 'dialecte-handover')
	mkdirSync(store)
	for (const [name, fields] of Object.entries(entries)) {
		writeFileSync(
			join(store, `${name}.json`),
			typeof fields === 'string' ? fields : JSON.stringify(fields),
		)
	}
	return store
}

function fieldsOf(folder: string, state = 'pending'): object {
	return {
		folder,
		branch: 'feat/a',
		worktree: '/work/tree',
		written: '2026-11-08T10:00:00.000Z',
		state,
	}
}

describe('the registry readers, without git', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('two entries and one that does not parse → the two, by name, with their fields', () => {
		const store = registryWith({
			'2026-11-08-b': fieldsOf('/f/b', 'committed'),
			'2026-11-08-a': fieldsOf('/f/a'),
			'2026-11-08-broken': '{"folder": ',
		})

		expect(readStoreEntries(store).map((entry) => [entry.name, entry.folder, entry.state])).toEqual(
			[
				['2026-11-08-a', '/f/a', 'pending'],
				['2026-11-08-b', '/f/b', 'committed'],
			],
		)
	})

	it('a store folder that does not exist → no entry', () => {
		const store = join(temporaryFolder('dialecte-registry-'), 'dialecte-handover')

		expect(readStoreEntries(store)).toEqual([])
	})

	it('readStoreEntry of a name → that entry; of an unknown name → undefined', () => {
		const store = registryWith({ '2026-11-08-a': fieldsOf('/f/a') })

		expect([
			readStoreEntry({ store, name: '2026-11-08-a' })?.folder,
			readStoreEntry({ store, name: 'unknown' }),
		]).toEqual(['/f/a', undefined])
	})

	it('registeredEntryOf a folder reached through a symlink → the entry naming its real path', () => {
		const root = temporaryFolder('dialecte-registry-')
		const real = join(root, 'lot')
		mkdirSync(real)
		const link = join(root, 'view')
		symlinkSync(real, link)
		const store = registryWith({ '2026-11-08-a': fieldsOf(real), '2026-11-08-b': fieldsOf('/f/b') })

		expect(registeredEntryOf({ store, folder: link })?.name).toBe('2026-11-08-a')
	})

	it('registeredEntryOf a folder no entry names → undefined', () => {
		const store = registryWith({ '2026-11-08-a': fieldsOf('/f/a') })

		expect(registeredEntryOf({ store, folder: '/f/other' })).toBeUndefined()
	})
})

describe('handover-store-read.ts is git-free', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('the modules it reaches → none imports node:child_process, and it reads a real entry', () => {
		const store = registryWith({ '2026-11-08-a': fieldsOf('/f/a') })

		expect({
			childProcessImporters: reachFrom(READ_MODULE).childProcessImporters,
			names: readStoreEntries(store).map((entry) => entry.name),
		}).toEqual({ childProcessImporters: [], names: ['2026-11-08-a'] })
	})

	it('handover-store.ts → uses the readers from the read module, does not restate them', () => {
		const source = readFileSync(STORE_MODULE, 'utf8')

		expect({
			restated: ['readStoreEntries', 'readStoreEntry', 'registeredEntryOf'].filter((name) =>
				new RegExp(`function ${name}\\b`).test(source),
			),
			imported: reachFrom(STORE_MODULE).files.includes(READ_MODULE),
		}).toEqual({ restated: [], imported: true })
	})
})
