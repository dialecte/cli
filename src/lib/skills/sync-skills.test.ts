import {
	chmodSync,
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readlinkSync,
	rmSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { discoverSkillSources, syncSkills } from './sync-skills.ts'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { SkillSource } from './sync-skills.types.ts'

let root: string

function writeSkill(params: { folder: string; name: string }): void {
	mkdirSync(join(params.folder, params.name, 'evals', 'case'), { recursive: true })
	writeFileSync(join(params.folder, params.name, 'SKILL.md'), `---\nname: ${params.name}\n---\n`)
	writeFileSync(join(params.folder, params.name, 'evals', 'case', 'prompt.md'), 'x')
}

function writePackage(params: { folder: string; json: object }): void {
	mkdirSync(params.folder, { recursive: true })
	writeFileSync(join(params.folder, 'package.json'), JSON.stringify(params.json))
}

function coreSkill(): SkillSource[] {
	writeSkill({ folder: join(root, 'core/skills'), name: 'dialecte' })
	return [
		{
			name: 'dialecte',
			path: join(root, 'core/skills/dialecte'),
			origin: '@dialecte/core',
			audience: 'consumer',
		},
	]
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'dialecte-skills-'))
})

afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

describe('discoverSkillSources', () => {
	it('app → skills of its dependencies, packages without skills ignored', () => {
		writePackage({
			folder: root,
			json: {
				dependencies: { '@dialecte/scl': '1' },
				devDependencies: { '@dialecte/core': '1', vitest: '1' },
			},
		})
		writeSkill({ folder: join(root, 'node_modules/@dialecte/scl/skills'), name: 'dialecte-scl' })
		writeSkill({ folder: join(root, 'node_modules/@dialecte/core/skills'), name: 'dialecte' })
		mkdirSync(join(root, 'node_modules/vitest'), { recursive: true })

		expect(discoverSkillSources({ cwd: root })).toEqual({
			sources: [
				{
					name: 'dialecte-scl',
					path: join(root, 'node_modules/@dialecte/scl/skills/dialecte-scl'),
					origin: '@dialecte/scl',
					audience: 'consumer',
				},
				{
					name: 'dialecte',
					path: join(root, 'node_modules/@dialecte/core/skills/dialecte'),
					origin: '@dialecte/core',
					audience: 'consumer',
				},
			],
			missingDependencies: [],
		})
	})

	it('a dependency listed as peer and dev → found once', () => {
		writePackage({
			folder: root,
			json: {
				peerDependencies: { '@dialecte/core': '1' },
				devDependencies: { '@dialecte/core': '1' },
			},
		})
		writeSkill({ folder: join(root, 'node_modules/@dialecte/core/skills'), name: 'dialecte' })

		expect(discoverSkillSources({ cwd: root }).sources.map((source) => source.name)).toEqual([
			'dialecte',
		])
	})

	it('a dependency hoisted to a parent node_modules (workspaces) → found there', () => {
		writePackage({
			folder: join(root, 'packages/app'),
			json: { dependencies: { '@dialecte/scl': '1' } },
		})
		writeSkill({ folder: join(root, 'node_modules/@dialecte/scl/skills'), name: 'dialecte-scl' })

		expect(discoverSkillSources({ cwd: join(root, 'packages/app') }).sources).toEqual([
			{
				name: 'dialecte-scl',
				path: join(root, 'node_modules/@dialecte/scl/skills/dialecte-scl'),
				origin: '@dialecte/scl',
				audience: 'consumer',
			},
		])
	})

	it('a dependency not installed → reported missing', () => {
		writePackage({ folder: root, json: { dependencies: { '@dialecte/scl': '1' } } })

		expect(discoverSkillSources({ cwd: root })).toEqual({
			sources: [],
			missingDependencies: ['@dialecte/scl'],
		})
	})

	it('--from a local workspace → skills of every repository folder, dot folders skipped', () => {
		writeSkill({ folder: join(root, 'core/skills'), name: 'dialecte' })
		writeSkill({ folder: join(root, 'scl/skills'), name: 'dialecte-scl' })
		writeSkill({ folder: join(root, '.worktrees/scl-x/skills'), name: 'dialecte-scl' })

		expect(discoverSkillSources({ cwd: '/elsewhere', from: root })).toEqual({
			sources: [
				{
					name: 'dialecte',
					path: join(root, 'core/skills/dialecte'),
					origin: 'core',
					audience: 'consumer',
				},
				{
					name: 'dialecte-scl',
					path: join(root, 'scl/skills/dialecte-scl'),
					origin: 'scl',
					audience: 'consumer',
				},
			],
			missingDependencies: [],
		})
	})

	it('two sources shipping the same skill name → error naming both', () => {
		writeSkill({ folder: join(root, 'core/skills'), name: 'dialecte' })
		writeSkill({ folder: join(root, 'scl/skills'), name: 'dialecte' })

		expect(() => discoverSkillSources({ cwd: root, from: root })).toThrow(
			'skill "dialecte" is shipped by both core and scl',
		)
	})
})

describe('syncSkills, left-out skills', () => {
	it('a dependency missing (unshipped kept) and a contributor skill left out → the left-out one removed all the same', () => {
		syncSkills({
			sources: coreSkill(),
			targetFolders: [join(root, '.agents/skills')],
			mode: 'link',
		})

		const report = syncSkills({
			sources: [],
			targetFolders: [join(root, '.agents/skills')],
			mode: 'link',
			keepUnshipped: true,
			leftOut: ['dialecte'],
		})

		expect(report.removed).toEqual(['dialecte'])
		expect(existsSync(join(root, '.agents/skills/dialecte'))).toBe(false)
	})
})

describe('discoverSkillSources, unreadable SKILL.md', () => {
	it('a SKILL.md it may not read → a consumer skill, nothing thrown', () => {
		writePackage({ folder: root, json: { dependencies: { '@acme/odd': '1' } } })
		writeSkill({ folder: join(root, 'node_modules/@acme/odd/skills'), name: 'odd' })
		chmodSync(join(root, 'node_modules/@acme/odd/skills/odd/SKILL.md'), 0o000)

		expect(discoverSkillSources({ cwd: root }).sources.map((source) => source.audience)).toEqual([
			'consumer',
		])
	})

	it('a folder named SKILL.md → not a skill, nothing thrown', () => {
		writePackage({ folder: root, json: { dependencies: { '@acme/odd': '1' } } })
		mkdirSync(join(root, 'node_modules/@acme/odd/skills/odd/SKILL.md'), { recursive: true })

		expect(discoverSkillSources({ cwd: root }).sources).toEqual([])
	})
})

describe('syncSkills', () => {
	it('link mode → relative symlink per target folder', () => {
		const report = syncSkills({
			sources: coreSkill(),
			targetFolders: [join(root, '.claude/skills'), join(root, '.agents/skills')],
			mode: 'link',
		})

		expect(report).toEqual({ installed: ['dialecte'], removed: [], conflicts: [] })
		expect(readlinkSync(join(root, '.claude/skills/dialecte'))).toBe('../../core/skills/dialecte')
		expect(lstatSync(join(root, '.agents/skills/dialecte')).isSymbolicLink()).toBe(true)
	})

	it('copy mode → copied without evals, marker written', () => {
		syncSkills({
			sources: coreSkill(),
			targetFolders: [join(root, '.github/skills')],
			mode: 'copy',
		})

		expect(existsSync(join(root, '.github/skills/dialecte/SKILL.md'))).toBe(true)
		expect(existsSync(join(root, '.github/skills/dialecte/evals'))).toBe(false)
		expect(readFileSync(join(root, '.github/skills/dialecte/.dialecte-skill'), 'utf8')).toBe(
			'@dialecte/core\n',
		)
	})

	it('a folder of the same name without marker → conflict, left untouched', () => {
		writeSkill({ folder: join(root, '.claude/skills'), name: 'dialecte' })

		const report = syncSkills({
			sources: coreSkill(),
			targetFolders: [join(root, '.claude/skills')],
			mode: 'link',
		})

		expect(report.conflicts).toEqual([join(root, '.claude/skills/dialecte')])
		expect(lstatSync(join(root, '.claude/skills/dialecte')).isDirectory()).toBe(true)
	})

	it('an installed link the user replaced with their own folder → kept, conflict', () => {
		const targetFolders = [join(root, '.claude/skills')]
		const sources = coreSkill()
		syncSkills({ sources, targetFolders, mode: 'link' })
		;(function forkSkill(): void {
			const link = join(root, '.claude/skills/dialecte')
			lstatSync(link)
			unlinkSync(link)
			writeSkill({ folder: join(root, '.claude/skills'), name: 'dialecte' })
			writeFileSync(join(link, 'SKILL.md'), 'my fork')
		})()

		const resync = syncSkills({ sources, targetFolders, mode: 'link' })
		const removal = syncSkills({ sources: [], targetFolders, mode: 'link' })

		expect(resync.conflicts).toEqual([join(root, '.claude/skills/dialecte')])
		expect(removal.removed).toEqual([])
		expect(readFileSync(join(root, '.claude/skills/dialecte/SKILL.md'), 'utf8')).toBe('my fork')
	})

	it('re-sync and removal of links → the source skill and its files intact', () => {
		const targetFolders = [join(root, '.claude/skills')]
		const sources = coreSkill()
		syncSkills({ sources, targetFolders, mode: 'link' })
		syncSkills({ sources, targetFolders, mode: 'link' })
		syncSkills({ sources: [], targetFolders, mode: 'link' })

		expect(existsSync(join(root, '.claude/skills/dialecte'))).toBe(false)
		expect(existsSync(join(root, 'core/skills/dialecte/SKILL.md'))).toBe(true)
		expect(existsSync(join(root, 'core/skills/dialecte/evals/case/prompt.md'))).toBe(true)
	})

	it('a manifest name that is not a skill name (../) → never touched, even carrying the copy marker', () => {
		mkdirSync(join(root, '.claude/skills'), { recursive: true })
		writeFileSync(
			join(root, '.claude/skills/.dialecte-skills.json'),
			JSON.stringify({ installed: ['../../src'] }),
		)
		// what the manifest name points at looks like a copy sync made: only the name check protects it
		mkdirSync(join(root, 'src'), { recursive: true })
		writeFileSync(join(root, 'src/.dialecte-skill'), '@dialecte/core\n')
		writeFileSync(join(root, 'src/index.ts'), 'export {}\n')

		const report = syncSkills({
			sources: [],
			targetFolders: [join(root, '.claude/skills')],
			mode: 'link',
		})

		expect(report.removed).toEqual([])
		expect(existsSync(join(root, 'src/index.ts'))).toBe(true)
	})

	it('a skill installed before and no longer shipped → removed; own skills kept', () => {
		syncSkills({
			sources: coreSkill(),
			targetFolders: [join(root, '.claude/skills')],
			mode: 'copy',
		})
		writeSkill({ folder: join(root, '.claude/skills'), name: 'my-own' })

		const report = syncSkills({
			sources: [],
			targetFolders: [join(root, '.claude/skills')],
			mode: 'copy',
		})

		expect(report.removed).toEqual(['dialecte'])
		expect(existsSync(join(root, '.claude/skills/dialecte'))).toBe(false)
		expect(existsSync(join(root, '.claude/skills/my-own'))).toBe(true)
	})

	it('keepUnshipped (a dependency could not be found) → nothing removed', () => {
		const targetFolders = [join(root, '.claude/skills')]
		syncSkills({ sources: coreSkill(), targetFolders, mode: 'link' })

		const report = syncSkills({ sources: [], targetFolders, mode: 'link', keepUnshipped: true })

		expect(report.removed).toEqual([])
		expect(lstatSync(join(root, '.claude/skills/dialecte')).isSymbolicLink()).toBe(true)
	})

	it('a link left by an interrupted sync (not in the manifest) → recognised and replaced', () => {
		const sources = coreSkill()
		mkdirSync(join(root, '.claude/skills'), { recursive: true })
		symlinkSync('../../core/skills/dialecte', join(root, '.claude/skills/dialecte'), 'dir')

		expect(
			syncSkills({ sources, targetFolders: [join(root, '.claude/skills')], mode: 'link' })
				.conflicts,
		).toEqual([])
	})

	it('a user link not in the manifest to another skills/<name> folder → conflict, link kept', () => {
		const sources = coreSkill()
		writeSkill({ folder: join(root, 'fork/skills'), name: 'dialecte' })
		mkdirSync(join(root, '.claude/skills'), { recursive: true })
		symlinkSync('../../fork/skills/dialecte', join(root, '.claude/skills/dialecte'), 'dir')

		const report = syncSkills({
			sources,
			targetFolders: [join(root, '.claude/skills')],
			mode: 'link',
		})

		expect(report.conflicts).toEqual([join(root, '.claude/skills/dialecte')])
		expect(readlinkSync(join(root, '.claude/skills/dialecte'))).toBe('../../fork/skills/dialecte')
	})

	it('a user link not in the manifest, nothing shipped → not removed (only the manifest decides)', () => {
		writeSkill({ folder: join(root, 'fork/skills'), name: 'my-skill' })
		mkdirSync(join(root, '.claude/skills'), { recursive: true })
		symlinkSync('../../fork/skills/my-skill', join(root, '.claude/skills/my-skill'), 'dir')

		const report = syncSkills({
			sources: [],
			targetFolders: [join(root, '.claude/skills')],
			mode: 'link',
		})

		expect(report.removed).toEqual([])
		expect(readlinkSync(join(root, '.claude/skills/my-skill'))).toBe('../../fork/skills/my-skill')
	})

	it('two target folders, a conflict in one → installed in the other', () => {
		writeSkill({ folder: join(root, '.claude/skills'), name: 'dialecte' })

		const report = syncSkills({
			sources: coreSkill(),
			targetFolders: [join(root, '.claude/skills'), join(root, '.agents/skills')],
			mode: 'link',
		})

		expect(report).toEqual({
			installed: ['dialecte'],
			removed: [],
			conflicts: [join(root, '.claude/skills/dialecte')],
		})
		expect(lstatSync(join(root, '.agents/skills/dialecte')).isSymbolicLink()).toBe(true)
	})

	it('second sync → replaces its own install', () => {
		const targetFolders = [join(root, '.claude/skills')]
		syncSkills({ sources: coreSkill(), targetFolders, mode: 'copy' })

		expect(syncSkills({ sources: coreSkill(), targetFolders, mode: 'link' })).toEqual({
			installed: ['dialecte'],
			removed: [],
			conflicts: [],
		})
		expect(lstatSync(join(root, '.claude/skills/dialecte')).isSymbolicLink()).toBe(true)
	})

	it('sync → the manifest records each installed skill with the package and version it came from', () => {
		const targetFolder = join(root, '.claude/skills')
		const [source] = coreSkill()

		syncSkills({
			sources: [{ ...source, version: '0.8.0' }],
			targetFolders: [targetFolder],
			mode: 'copy',
		})

		expect(JSON.parse(readFileSync(join(targetFolder, '.dialecte-skills.json'), 'utf8'))).toEqual({
			installed: ['dialecte'],
			versions: { dialecte: { package: '@dialecte/core', version: '0.8.0' } },
		})
	})
})

describe('discoverSkillSources, versions', () => {
	it('an installed dependency → its skills carry the version of its package.json', () => {
		writePackage({ folder: root, json: { dependencies: { '@dialecte/core': '1' } } })
		writePackage({ folder: join(root, 'node_modules/@dialecte/core'), json: { version: '0.8.0' } })
		writeSkill({ folder: join(root, 'node_modules/@dialecte/core/skills'), name: 'dialecte' })

		expect(discoverSkillSources({ cwd: root }).sources[0].version).toBe('0.8.0')
	})
})
