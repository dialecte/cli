import {
	chmodSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	readlinkSync,
	realpathSync,
	symlinkSync,
} from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder, writeFiles } from '../../../test/scratch-repository.ts'
import { linkSiblings } from './sibling-links.ts'

import { describe, expect, it } from 'vitest'

/**
 * A workspace holding the main checkout `cli`, its sibling `core` and the worktree
 * `.worktrees/cli-thing` whose package.json holds `dependencies` (no git needed: the links are files).
 */
function createWorkspace(params: {
	devDependencies?: Record<string, string>
	sections?: Record<string, Record<string, string>>
}): { workspace: string; repository: string; worktree: string; core: string } {
	const workspace = temporaryFolder('dialecte-sibling-links-')
	const repository = join(workspace, 'cli')
	const worktree = join(workspace, '.worktrees', 'cli-thing')
	const core = join(workspace, 'core')
	const packageJson = JSON.stringify({
		name: '@dialecte/cli',
		...(params.devDependencies && { devDependencies: params.devDependencies }),
		...params.sections,
	})
	writeFiles({ root: repository, files: { 'package.json': packageJson } })
	writeFiles({ root: worktree, files: { 'package.json': packageJson } })
	writeFiles({ root: core, files: { 'package.json': '{ "name": "@dialecte/core" }\n' } })
	return { workspace, repository, worktree, core }
}

describe('linkSiblings', () => {
	it('a file: dependency reaching .worktrees/core, the sibling present beside the main checkout → a relative link ../core made: created', () => {
		const { workspace, repository, worktree, core } = createWorkspace({
			devDependencies: { '@dialecte/core': 'file:../core', demo: '1.0.0' },
		})
		const link = join(workspace, '.worktrees', 'core')

		expect(linkSiblings({ worktree, repository })).toEqual([
			{ dependency: '@dialecte/core', link, target: core, outcome: 'created' },
		])
		expect(lstatSync(link).isSymbolicLink()).toBe(true)
		expect(readlinkSync(link)).toBe('../core')
		expect(realpathSync(link)).toBe(realpathSync(core))
	})

	for (const section of [
		'dependencies',
		'devDependencies',
		'optionalDependencies',
		'peerDependencies',
	])
		it(`a link: dependency in ${section} → linked like a file: one`, () => {
			const { workspace, repository, worktree, core } = createWorkspace({
				sections: { [section]: { '@dialecte/core': 'link:../core' } },
			})
			const link = join(workspace, '.worktrees', 'core')

			expect(linkSiblings({ worktree, repository })).toEqual([
				{ dependency: '@dialecte/core', link, target: core, outcome: 'created' },
			])
			expect(readlinkSync(link)).toBe('../core')
		})

	it('the sibling missing beside the main checkout → nothing made: skipped, naming it', () => {
		const { workspace, repository, worktree } = createWorkspace({
			devDependencies: { '@dialecte/plc': 'file:../plc' },
		})
		const link = join(workspace, '.worktrees', 'plc')
		const target = join(workspace, 'plc')

		expect(linkSiblings({ worktree, repository })).toEqual([
			{ dependency: '@dialecte/plc', link, target, outcome: `skipped: ${target} missing` },
		])
		expect(existsSync(link) || isLink(link)).toBe(false)
	})

	for (const situation of [
		{ name: 'a relative link to the sibling', text: '../core' },
		{ name: 'an absolute link to the sibling', text: 'absolute' },
	])
		it(`${situation.name} already there → present, left as it is`, () => {
			const { workspace, repository, worktree, core } = createWorkspace({
				devDependencies: { '@dialecte/core': 'file:../core' },
			})
			const link = join(workspace, '.worktrees', 'core')
			const text = situation.text === 'absolute' ? core : situation.text
			symlinkSync(text, link)

			expect(linkSiblings({ worktree, repository })).toEqual([
				{ dependency: '@dialecte/core', link, target: core, outcome: 'present' },
			])
			expect(readlinkSync(link)).toBe(text)
		})

	it('run twice → created, then present', () => {
		const { workspace, repository, worktree, core } = createWorkspace({
			devDependencies: { '@dialecte/core': 'file:../core' },
		})
		const link = join(workspace, '.worktrees', 'core')

		expect([
			linkSiblings({ worktree, repository }),
			linkSiblings({ worktree, repository }),
		]).toEqual([
			[{ dependency: '@dialecte/core', link, target: core, outcome: 'created' }],
			[{ dependency: '@dialecte/core', link, target: core, outcome: 'present' }],
		])
		expect(readlinkSync(link)).toBe('../core')
	})

	for (const situation of [
		{ name: 'a link to another folder', text: '../other', makeTarget: true },
		{ name: 'a dangling link', text: '../gone', makeTarget: false },
	])
		it(`${situation.name} where the sibling link goes → kept, naming what it points to`, () => {
			const { workspace, repository, worktree, core } = createWorkspace({
				devDependencies: { '@dialecte/core': 'file:../core' },
			})
			const link = join(workspace, '.worktrees', 'core')
			if (situation.makeTarget) mkdirSync(join(workspace, 'other'))
			symlinkSync(situation.text, link)

			expect(linkSiblings({ worktree, repository })).toEqual([
				{
					dependency: '@dialecte/core',
					link,
					target: core,
					outcome: `kept: points to ${situation.text}, not ${core}`,
				},
			])
			expect(readlinkSync(link)).toBe(situation.text)
		})

	for (const situation of [
		{
			kind: 'folder',
			make: (link: string) => writeFiles({ root: link, files: { 'mine.txt': 'mine\n' } }),
		},
		{
			kind: 'file',
			make: (link: string) => writeFiles({ root: join(link, '..'), files: { core: 'mine\n' } }),
		},
	])
		it(`a real ${situation.kind} where the sibling link goes → kept, never replaced`, () => {
			const { workspace, repository, worktree, core } = createWorkspace({
				devDependencies: { '@dialecte/core': 'file:../core' },
			})
			const link = join(workspace, '.worktrees', 'core')
			situation.make(link)

			expect(linkSiblings({ worktree, repository })).toEqual([
				{
					dependency: '@dialecte/core',
					link,
					target: core,
					outcome: `kept: a real ${situation.kind}`,
				},
			])
			expect(lstatSync(link).isSymbolicLink()).toBe(false)
			expect(
				readFileSync(situation.kind === 'folder' ? join(link, 'mine.txt') : link, 'utf8'),
			).toBe('mine\n')
		})

	it('a path into a sibling whose folder is not under .worktrees/ (file:../core/sub/pkg, no .worktrees/core) → skipped, naming the missing folder; nothing made', () => {
		const { workspace, repository, worktree, core } = createWorkspace({
			devDependencies: { pkg: 'file:../core/sub/pkg' },
		})
		writeFiles({ root: join(core, 'sub', 'pkg'), files: { 'package.json': '{}\n' } })
		const link = join(workspace, '.worktrees', 'core', 'sub', 'pkg')

		expect(linkSiblings({ worktree, repository })).toEqual([
			{
				dependency: 'pkg',
				link,
				target: join(core, 'sub', 'pkg'),
				outcome: expect.stringMatching(
					new RegExp(
						`^skipped: ${escapeRegExp(join(workspace, '.worktrees', 'core'))}(/sub)? missing$`,
					),
				),
			},
		])
		expect(
			existsSync(join(workspace, '.worktrees', 'core')) ||
				isLink(join(workspace, '.worktrees', 'core')),
		).toBe(false)
	})

	it('a .worktrees/ folder where no link can be made (read-only) → skipped, naming the error code; nothing made', () => {
		const { workspace, repository, worktree, core } = createWorkspace({
			devDependencies: { '@dialecte/core': 'file:../core' },
		})
		const worktrees = join(workspace, '.worktrees')
		const link = join(worktrees, 'core')
		chmodSync(worktrees, 0o555)

		try {
			expect(linkSiblings({ worktree, repository })).toEqual([
				{
					dependency: '@dialecte/core',
					link,
					target: core,
					outcome: 'skipped: cannot make the link (EACCES)',
				},
			])
			expect(existsSync(link) || isLink(link)).toBe(false)
		} finally {
			chmodSync(worktrees, 0o755)
		}
	})

	it('a file: path inside the repository → no link needed, not reported', () => {
		const { repository, worktree } = createWorkspace({
			devDependencies: { local: 'file:./packages/local', demo: '^1.0.0' },
		})
		writeFiles({ root: repository, files: { 'packages/local/package.json': '{}\n' } })

		expect(linkSiblings({ worktree, repository })).toEqual([])
	})

	it('a path leaving .worktrees/ → skipped, nothing made', () => {
		const { workspace, repository, worktree } = createWorkspace({
			devDependencies: { far: 'file:../../far' },
		})
		const link = join(workspace, 'far')

		expect(linkSiblings({ worktree, repository })).toEqual([
			{
				dependency: 'far',
				link,
				target: join(workspace, '..', 'far'),
				outcome: 'skipped: outside .worktrees/',
			},
		])
		expect(existsSync(link) || isLink(link)).toBe(false)
	})

	for (const situation of [
		{ name: 'to the sibling', text: '../core', result: 'present', outcome: () => 'present' },
		{
			name: 'elsewhere',
			text: '../elsewhere',
			result: 'kept',
			outcome: (core: string) => `kept: points to ../elsewhere, not ${core}`,
		},
	])
		it(`a link made ${situation.name} by another process between the check and the creation → read again: ${situation.result}`, () => {
			const { workspace, repository, worktree, core } = createWorkspace({
				devDependencies: { '@dialecte/core': 'file:../core' },
			})
			const link = join(workspace, '.worktrees', 'core')

			expect(
				linkSiblings({
					worktree,
					repository,
					beforeLink: (path) => symlinkSync(situation.text, path),
				}),
			).toEqual([
				{ dependency: '@dialecte/core', link, target: core, outcome: situation.outcome(core) },
			])
			expect(readlinkSync(link)).toBe(situation.text)
		})
})

function isLink(path: string): boolean {
	try {
		return lstatSync(path).isSymbolicLink()
	} catch {
		return false
	}
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
