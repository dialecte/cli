import { createScratchRepository, git, writeFiles } from '../../test/scratch-repository.ts'
import { readStagedFile } from './git.ts'

import { describe, expect, it } from 'vitest'

/** A repository whose merge of `feat` into `main` stops on a conflict in `conflicted.txt`. */
function conflictedRepository(): string {
	const root = createScratchRepository({ 'conflicted.txt': 'base\n', 'plain.txt': 'plain\n' })
	git({ root, args: ['checkout', '-q', '-b', 'feat'] })
	writeFiles({ root, files: { 'conflicted.txt': 'feat\n' } })
	git({ root, args: ['commit', '-q', '-am', 'feat: change'] })
	git({ root, args: ['checkout', '-q', 'main'] })
	writeFiles({ root, files: { 'conflicted.txt': 'main\n' } })
	git({ root, args: ['commit', '-q', '-am', 'feat: other change'] })
	expect(() => git({ root, args: ['merge', 'feat'] })).toThrow()
	return root
}

describe('readStagedFile', () => {
	it('a file the index holds → its bytes', () => {
		const root = createScratchRepository({ 'plain.txt': 'plain\n' })

		expect(readStagedFile({ root, file: 'plain.txt' })).toEqual(Buffer.from('plain\n'))
	})

	it('a file the index does not hold → undefined', () => {
		const root = createScratchRepository({})

		expect(readStagedFile({ root, file: 'absent.txt' })).toBeUndefined()
	})

	it('an unmerged (conflicted) path → throws, never undefined', () => {
		const root = conflictedRepository()

		expect(() => readStagedFile({ root, file: 'conflicted.txt' })).toThrow()
	})

	it('a path of the same index that merged cleanly → its bytes', () => {
		const root = conflictedRepository()

		expect(readStagedFile({ root, file: 'README.md' })).toEqual(Buffer.from('scratch\n'))
	})
})
