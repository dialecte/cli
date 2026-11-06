import { existsSync, mkdirSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { claimWorktreeIndex, worktreeFolderName, worktreeIndexOf } from './worktree-index.ts'

import { describe, expect, it } from 'vitest'

/** A workspace's `.worktrees/` holding the given folders, links (name → target) and claims. */
function createWorktreesFolder(
	params: {
		folders?: string[]
		links?: Record<string, string>
		claims?: string[]
		files?: string[]
	} = {},
): string {
	const worktreesFolder = join(temporaryFolder('dialecte-worktree-index-'), '.worktrees')
	mkdirSync(worktreesFolder)
	for (const folder of params.folders ?? []) mkdirSync(join(worktreesFolder, folder))
	for (const [name, target] of Object.entries(params.links ?? {}))
		symlinkSync(target, join(worktreesFolder, name))
	for (const file of params.files ?? []) writeFileSync(join(worktreesFolder, file), '')
	if (params.claims?.length) {
		mkdirSync(join(worktreesFolder, '.index'))
		for (const claim of params.claims) writeFileSync(join(worktreesFolder, '.index', claim), '')
	}
	return worktreesFolder
}

function claimsOf(worktreesFolder: string): string[] {
	return readdirSync(join(worktreesFolder, '.index')).sort()
}

describe('claimWorktreeIndex', () => {
	it('an empty .worktrees/ → 0001, its claim .index/0001 created', () => {
		const worktreesFolder = createWorktreesFolder()

		expect(claimWorktreeIndex({ worktreesFolder })).toBe('0001')
		expect(claimsOf(worktreesFolder)).toEqual(['0001'])
	})

	it('no .worktrees/ folder yet → 0001, the folder and the claim made', () => {
		const worktreesFolder = join(temporaryFolder('dialecte-worktree-index-'), '.worktrees')

		expect(claimWorktreeIndex({ worktreesFolder })).toBe('0001')
		expect(existsSync(join(worktreesFolder, '.index', '0001'))).toBe(true)
	})

	it('a numbered folder 0007-core-a and a numbered link 0009-cli-b beside unnumbered entries → 0010', () => {
		const worktreesFolder = createWorktreesFolder({
			folders: ['0007-core-a', 'cli-x', '171-short', '00x8-core-odd'],
			links: { '0009-cli-b': '../elsewhere', core: '../core' },
			files: ['.DS_Store'],
		})

		expect(claimWorktreeIndex({ worktreesFolder })).toBe('0010')
	})

	it('a claim 0012 whose worktree was pruned, beside the folder 0007-core-a → 0013: a number is never reused', () => {
		const worktreesFolder = createWorktreesFolder({ folders: ['0007-core-a'], claims: ['0012'] })

		expect(claimWorktreeIndex({ worktreesFolder })).toBe('0013')
		expect(claimsOf(worktreesFolder)).toEqual(['0012', '0013'])
	})

	it('a folder 0020-cli-x above the highest claim 0012 → 0021', () => {
		const worktreesFolder = createWorktreesFolder({ folders: ['0020-cli-x'], claims: ['0012'] })

		expect(claimWorktreeIndex({ worktreesFolder })).toBe('0021')
	})

	it('another run claims the picked number between the pick and the claim → the loser takes the next, both claims there', () => {
		const worktreesFolder = createWorktreesFolder()
		const taken: string[] = []

		expect(
			claimWorktreeIndex({
				worktreesFolder,
				afterPick: function otherRun() {
					taken.push(claimWorktreeIndex({ worktreesFolder }))
				},
			}),
		).toBe('0002')
		expect(taken).toEqual(['0001'])
		expect(claimsOf(worktreesFolder)).toEqual(['0001', '0002'])
	})

	it('a claim 9999 → 10000: past four digits the index grows', () => {
		const worktreesFolder = createWorktreesFolder({ claims: ['9999'] })

		expect(claimWorktreeIndex({ worktreesFolder })).toBe('10000')
	})

	it('a file in .index/ that is no index (notes.txt) → counted for nothing', () => {
		const worktreesFolder = createWorktreesFolder({ claims: ['0003', 'notes.txt'] })

		expect(claimWorktreeIndex({ worktreesFolder })).toBe('0004')
	})
})

describe('worktreeIndexOf', () => {
	it.each([
		{ path: '/w/.worktrees/0171-cli-x', index: '0171' },
		{ path: '/w/.worktrees/10000-core-y', index: '10000' },
		{ path: '/w/.worktrees/0171-cli-x-round-2', index: '0171' },
		{ path: '/w/.worktrees/cli-x', index: undefined },
		{ path: '/w/.worktrees/171-cli-x', index: undefined },
		{ path: '/w/0171', index: undefined },
		{ path: '/w/cli', index: undefined },
	])('$path → $index', ({ path, index }) => {
		expect(worktreeIndexOf(path)).toBe(index)
	})
})

describe('worktreeIndexOf outside .worktrees/', () => {
	it.each([
		{ path: '/w/0171-cli', index: undefined },
		{ path: '/w/elsewhere/0171-cli-x', index: undefined },
	])(
		'a numbered-looking folder whose parent is not .worktrees ($path) → $index',
		({ path, index }) => {
			expect(worktreeIndexOf(path)).toBe(index)
		},
	)
})

describe('worktreeFolderName', () => {
	it.each([
		{ repository: '/w/cli', branch: 'feat/x', name: '0007-cli-x' },
		{ repository: '/w/core', branch: 'main', name: '0007-core-main' },
		{ repository: '/w/scl', branch: 'feat/a/b-round-1', name: '0007-scl-b-round-1' },
	])('$repository on $branch → $name', ({ repository, branch, name }) => {
		expect(worktreeFolderName({ index: '0007', repository, branch })).toBe(name)
	})
})
