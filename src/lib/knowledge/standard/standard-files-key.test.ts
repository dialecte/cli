import { manifestHashOf, sha256Of } from '../../../../test/standard-workspace.ts'
import { standardFilesKey } from './standard-files-key.ts'

import { describe, expect, it } from 'vitest'

import type { StandardFileHash } from './standard-files-key.types.ts'

const FILE_TEXTS: Record<string, string> = {
	'example-0000/one': 'The first file.\n',
	'example-0000/two': 'The second file.\n',
	'example-0000/three': 'The third file.\n',
}

/** The (id, sha256) pairs of the texts, in the order the record lists them. */
function hashesOf(texts: Record<string, string>): StandardFileHash[] {
	return Object.entries(texts).map(([id, text]) => ({ id, sha256: sha256Of(text) }))
}

const KEY_PATTERN = /^sha256:[0-9a-f]{64}$/

describe('standardFilesKey (D14)', () => {
	it('is `sha256:` and 64 hex characters', () => {
		expect(standardFilesKey({ files: hashesOf(FILE_TEXTS) })).toMatch(KEY_PATTERN)
	})

	it('the same pairs in another order → the same key', () => {
		const files = hashesOf(FILE_TEXTS)

		expect(standardFilesKey({ files: [...files].reverse() })).toBe(standardFilesKey({ files }))
	})

	it('a file id changed → another key', () => {
		const files = hashesOf(FILE_TEXTS)
		const renamed = files.map((file, index) =>
			index === 0 ? { ...file, id: 'example-0000/uno' } : file,
		)

		expect(standardFilesKey({ files: renamed })).not.toBe(standardFilesKey({ files }))
	})

	it('a file sha changed → another key', () => {
		const files = hashesOf(FILE_TEXTS)
		const edited = files.map((file, index) =>
			index === 0 ? { ...file, sha256: sha256Of('another text') } : file,
		)

		expect(standardFilesKey({ files: edited })).not.toBe(standardFilesKey({ files }))
	})

	it('a file added or removed → another key', () => {
		const files = hashesOf(FILE_TEXTS)

		expect([
			standardFilesKey({ files: files.slice(1) }),
			standardFilesKey({ files: [...files, { id: 'example-0000/four', sha256: sha256Of('4') }] }),
		]).not.toContain(standardFilesKey({ files }))
	})

	it("is not K1's manifest hash of the same files: no index format inside", () => {
		const manifestHash = manifestHashOf({ files: FILE_TEXTS })

		expect([
			standardFilesKey({ files: hashesOf(FILE_TEXTS) }),
			standardFilesKey({ files: hashesOf(FILE_TEXTS) }).slice('sha256:'.length),
		]).not.toContain(manifestHash)
	})
})
