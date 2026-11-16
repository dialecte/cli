/** A lock file is never seen empty: it comes into place whole, whether created or put back. */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from '../../test/scratch-repository.ts'
import { createLockFile, replaceLockFile } from './pid-lock.ts'

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:fs')>()
	return { ...actual, writeFileSync: vi.fn(actual.writeFileSync) }
})

const TEXT = '4242\nMon Nov 16 10:00:00 2026\n'

beforeEach(function clearSpy() {
	vi.mocked(writeFileSync).mockClear()
})

/** The paths `writeFileSync` was asked to write. */
function writtenPaths(): string[] {
	return vi.mocked(writeFileSync).mock.calls.map(([path]) => String(path))
}

describe('createLockFile: the lock comes into place whole', () => {
	it('no lock there → created holding the text, never written at its own path, no other file left', () => {
		const folder = temporaryFolder('dialecte-pid-lock-')
		const lockPath = join(folder, 'tree.json.lock')

		const created = createLockFile({ lockPath, text: TEXT })

		expect({
			created,
			text: readFileSync(lockPath, 'utf8'),
			writtenAtLock: writtenPaths().includes(lockPath),
			files: readdirSync(folder),
		}).toEqual({ created: true, text: TEXT, writtenAtLock: false, files: ['tree.json.lock'] })
	})

	it('a lock there → false, the lock as it was, no other file left', () => {
		const folder = temporaryFolder('dialecte-pid-lock-')
		const lockPath = join(folder, 'tree.json.lock')
		writeFileSync(lockPath, 'held\n')

		const created = createLockFile({ lockPath, text: TEXT })

		expect({
			created,
			text: readFileSync(lockPath, 'utf8'),
			files: readdirSync(folder),
		}).toEqual({ created: false, text: 'held\n', files: ['tree.json.lock'] })
	})
})

describe('replaceLockFile: a lock put back comes into place whole', () => {
	it('a lock there → it holds the new text, never written at its own path, no other file left', () => {
		const folder = temporaryFolder('dialecte-pid-lock-')
		const lockPath = join(folder, 'tree.json.lock')
		writeFileSync(lockPath, 'held\n')
		vi.mocked(writeFileSync).mockClear()

		replaceLockFile({ lockPath, text: TEXT })

		expect({
			text: readFileSync(lockPath, 'utf8'),
			writtenAtLock: writtenPaths().includes(lockPath),
			files: readdirSync(folder),
		}).toEqual({ text: TEXT, writtenAtLock: false, files: ['tree.json.lock'] })
	})
})
