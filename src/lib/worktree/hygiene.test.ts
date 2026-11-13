import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createScratchRepository, git, writeFiles } from '../../../test/scratch-repository.ts'
import { checkHygiene, readHygieneBaseline, writeHygieneBaseline } from './hygiene.ts'

import { describe, expect, it } from 'vitest'

describe('checkHygiene', { timeout: 30_000 }, () => {
	it('nothing staged, stash as at the baseline, new files declared → clean', () => {
		const root = createScratchRepository()
		writeHygieneBaseline({ root, now: new Date('2026-10-29T10:00:00Z') })
		writeFiles({ root, files: { 'src/new.ts': 'export {}\n' } })

		expect(checkHygiene({ root, declared: ['src/'] })).toEqual({
			failures: [],
			look: [],
			warnings: [],
			notes: [],
		})
	})

	it('a staged file → a failure naming it, with a read-only look command', () => {
		const root = createScratchRepository()
		writeHygieneBaseline({ root, now: new Date('2026-10-29T10:00:00Z') })
		writeFiles({ root, files: { 'README.md': 'changed\n' } })
		git({ root, args: ['add', 'README.md'] })

		const report = checkHygiene({ root, declared: [] })

		expect(report.failures).toEqual(['1 file(s) staged: README.md'])
		expect(report.look).toEqual([`git -C '${root}' diff --cached --stat`])
	})

	it('a stash pushed on the worktree branch since the baseline → a failure naming the entry, with a quoted look', () => {
		const root = createScratchRepository()
		writeHygieneBaseline({ root, now: new Date('2026-10-29T10:00:00Z') })
		writeFiles({ root, files: { 'README.md': 'changed\n' } })
		git({ root, args: ['stash', '-q'] })

		const report = checkHygiene({ root, declared: [] })

		expect(report.failures).toEqual([
			expect.stringMatching(
				/^a stash entry on this worktree's branch main since the worktree was made \(2026-10-29T10:00:00\.000Z\): WIP on main: [0-9a-f]+ chore: start$/,
			),
		])
		expect(report.look).toContain(`git -C '${root}' stash list`)
	})

	it('a stash pushed by another session on another branch → a note naming its branch, not a failure', () => {
		const root = createScratchRepository()
		writeHygieneBaseline({ root, now: new Date('2026-10-29T10:00:00Z') })
		git({ root, args: ['checkout', '-q', '-b', 'feat/other'] })
		writeFiles({ root, files: { 'README.md': 'changed\n' } })
		git({ root, args: ['stash', 'push', '-q', '-m', 'their work'] })
		git({ root, args: ['checkout', '-q', 'main'] })

		const report = checkHygiene({ root, declared: [] })

		expect(report.failures).toEqual([])
		expect(report.notes).toEqual([
			"1 stash entry pushed since the worktree was made on another branch (not this worktree's): feat/other",
		])
	})

	it('a stash entry older than the baseline → nothing', () => {
		const root = createScratchRepository()
		writeFiles({ root, files: { 'README.md': 'changed\n' } })
		git({ root, args: ['stash', '-q'] })
		writeHygieneBaseline({ root, now: new Date('2026-10-29T10:00:00Z') })

		expect(checkHygiene({ root, declared: [] }).failures).toEqual([])
		expect(checkHygiene({ root, declared: [] }).notes).toEqual([])
	})

	it('a baseline that is not JSON → a note, not a throw', () => {
		const root = createScratchRepository()
		const gitFolder = git({ root, args: ['rev-parse', '--absolute-git-dir'] }).trim()
		writeFileSync(join(gitFolder, 'dialecte-hygiene.json'), '{ broken')

		const report = checkHygiene({ root, declared: [] })

		expect(report.failures).toEqual([])
		expect(report.notes).toEqual([
			'the hygiene baseline cannot be read (not JSON): the stash is not compared',
		])
	})

	it('no baseline → a note, not a failure; a new file not declared → a warning', () => {
		const root = createScratchRepository()
		writeFileSync(join(root, 'stray.log'), 'x\n')

		const report = checkHygiene({ root, declared: ['src/'] })

		expect(report.failures).toEqual([])
		expect(report.notes).toEqual([
			'no hygiene baseline (worktree not made by `dialecte worktree add`): the stash is not compared',
		])
		expect(report.warnings).toEqual([
			'1 new file(s) the change did not declare (--declare <path>): stray.log',
		])
	})

	it('another session drops the top entry, older than the baseline → the older entries do not look new', () => {
		const root = createScratchRepository()
		for (const content of ['first\n', 'second\n']) {
			writeFiles({ root, files: { 'README.md': content } })
			git({ root, args: ['stash', '-q'] })
		}
		writeHygieneBaseline({ root, now: new Date('2026-10-29T10:00:00Z') })
		git({ root, args: ['stash', 'drop', '-q', 'stash@{0}'] })

		const report = checkHygiene({ root, declared: [] })

		expect(report.failures).toEqual([])
		expect(report.notes).toEqual([])
	})

	it('a new entry on this branch under a newer one of another branch → the look names its index', () => {
		const root = createScratchRepository()
		writeHygieneBaseline({ root, now: new Date('2026-10-29T10:00:00Z') })
		writeFiles({ root, files: { 'README.md': 'mine\n' } })
		git({ root, args: ['stash', '-q'] })
		git({ root, args: ['checkout', '-q', '-b', 'feat/other'] })
		writeFiles({ root, files: { 'README.md': 'theirs\n' } })
		git({ root, args: ['stash', '-q'] })
		git({ root, args: ['checkout', '-q', 'main'] })

		const report = checkHygiene({ root, declared: [] })

		expect(report.failures).toHaveLength(1)
		expect(report.look).toEqual([
			`git -C '${root}' stash list`,
			`git -C '${root}' stash show --stat stash@{1}`,
		])
	})
})

describe('writeHygieneBaseline: the branch the worktree was cut from', { timeout: 30_000 }, () => {
	it('a from given → the baseline written holds it beside the head, and reads back with it', () => {
		const root = createScratchRepository()

		const head = git({ root, args: ['rev-parse', 'HEAD'] }).trim()

		expect(
			writeHygieneBaseline({ root, now: new Date('2026-11-12T10:00:00Z'), from: 'feat/x' }),
		).toMatchObject({ head, from: 'feat/x' })
		expect(readHygieneBaseline(root)).toMatchObject({ head, from: 'feat/x' })
	})

	it('no from given → the baseline has no from field', () => {
		const root = createScratchRepository()

		expect(
			Object.keys(writeHygieneBaseline({ root, now: new Date('2026-11-12T10:00:00Z') })),
		).not.toContain('from')
		expect(Object.keys(readHygieneBaseline(root) ?? {})).not.toContain('from')
	})
})
