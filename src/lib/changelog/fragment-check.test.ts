/** A visible change brings its changelog fragment: a README, command page or command-map edit adds `changes/<name>.md` (or a note). */
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../../test/scratch-checks.constants.ts'
import { createScratchRepository, git, writeFiles } from '../../../test/scratch-repository.ts'
import { checkChangeFragment } from './fragment-check.ts'

import { describe, expect, it } from 'vitest'

const COMMAND_MAP = 'src/lib/command-map/command-map.constants.ts'

/**
 * A committed package keeping fragments (or not), its package.json declaring `asking` as `dialecte.changelog.asking`
 * when given, its base the commit; then `files` written as the change.
 */
function changeOf(params: {
	fragments?: boolean
	asking?: unknown
	files: Record<string, string>
}): {
	root: string
	base: string
} {
	const root = createScratchRepository({
		...(params.asking !== undefined && {
			'package.json': `${JSON.stringify({ name: 'demo', dialecte: { changelog: { asking: params.asking } } })}\n`,
		}),
		'README.md': '# demo\n',
		[COMMAND_MAP]: 'export const COMMAND_MAP = {}\n',
		'src/a.ts': 'export const a = 1\n',
		...(params.fragments !== false && { 'changes/.gitkeep': '' }),
	})
	const base = git({ root, args: ['rev-parse', 'HEAD'] }).trim()
	writeFiles({ root, files: params.files })
	return { root, base }
}

describe('checkChangeFragment', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it.each<{ label: string; asking?: unknown; files: Record<string, string>; failed: string }>([
		{
			label: 'the README edited, no fragment',
			files: { 'README.md': '# demo\n\nmore.\n' },
			failed:
				'README.md changed with no changelog fragment: write changes/<lot>.md, or changes/<lot>.none.md saying why no entry',
		},
		{
			label: 'the command map the package lists in dialecte.changelog.asking edited, no fragment',
			asking: [COMMAND_MAP],
			files: { [COMMAND_MAP]: 'export const COMMAND_MAP = { a: 1 }\n' },
			failed: `${COMMAND_MAP} changed with no changelog fragment: write changes/<lot>.md, or changes/<lot>.none.md saying why no entry`,
		},
		{
			label: 'a guide under doc/ edited, no fragment',
			files: { 'doc/guide.md': '# guide\n' },
			failed:
				'doc/guide.md changed with no changelog fragment: write changes/<lot>.md, or changes/<lot>.none.md saying why no entry',
		},
		{
			label: 'a file under a folder the package lists edited, no fragment',
			asking: ['src/api/'],
			files: { 'src/api/x.ts': 'export const x = 1\n' },
			failed:
				'src/api/x.ts changed with no changelog fragment: write changes/<lot>.md, or changes/<lot>.none.md saying why no entry',
		},
		{
			label: 'a list entry spelled ./src/api/ (git names no path so)',
			asking: ['./src/api/'],
			files: { 'src/a.ts': 'export const a = 2\n' },
			failed:
				'dialecte.changelog.asking in package.json is not a list of paths: a list of file or folder/ paths',
		},
		{
			label: 'a list entry that is an absolute path',
			asking: ['/abs/x'],
			files: { 'src/a.ts': 'export const a = 2\n' },
			failed:
				'dialecte.changelog.asking in package.json is not a list of paths: a list of file or folder/ paths',
		},
		{
			label: 'a list entry with a backslash',
			asking: ['src\\\\api\\\\'],
			files: { 'src/a.ts': 'export const a = 2\n' },
			failed:
				'dialecte.changelog.asking in package.json is not a list of paths: a list of file or folder/ paths',
		},
		{
			label: 'a list entry that is empty',
			asking: [''],
			files: { 'src/a.ts': 'export const a = 2\n' },
			failed:
				'dialecte.changelog.asking in package.json is not a list of paths: a list of file or folder/ paths',
		},
		{
			label: 'dialecte.changelog.asking that is a string',
			asking: 'src/api/',
			files: { 'src/a.ts': 'export const a = 2\n' },
			failed:
				'dialecte.changelog.asking in package.json is not a list of paths: a list of file or folder/ paths',
		},
		{
			label: 'dialecte.changelog.asking that is no list of paths',
			asking: ['README.md', 3],
			files: { 'src/a.ts': 'export const a = 2\n' },
			failed:
				'dialecte.changelog.asking in package.json is not a list of paths: a list of file or folder/ paths',
		},
	])('$label → failed, naming the file', ({ asking, files, failed }) => {
		expect(checkChangeFragment(changeOf({ asking, files }))).toEqual({
			status: 'failed',
			reason: failed,
		})
	})

	it('the command map edited in a package that does not list it → passed, no fragment asked', () => {
		const change = changeOf({ files: { [COMMAND_MAP]: 'export const COMMAND_MAP = { a: 1 }\n' } })

		expect(checkChangeFragment(change)).toEqual({
			status: 'passed',
			note: 'no README, doc/ or listed file changed: no fragment asked',
		})
	})

	it('a command page edited, no fragment → failed, naming the page', () => {
		const change = changeOf({ files: { 'doc/commands/gate.md': '# dialecte gate\n\nmore.\n' } })

		expect(checkChangeFragment(change)).toEqual({
			status: 'failed',
			reason:
				'doc/commands/gate.md changed with no changelog fragment: write changes/<lot>.md, or changes/<lot>.none.md saying why no entry',
		})
	})

	it.each<{ label: string; files: Record<string, string>; problem: string }>([
		{
			label: 'the README edited with an empty no-entry note',
			files: { 'README.md': '# Demo\n', 'changes/lot.none.md': '\n' },
			problem: 'changes/lot.none.md: a no-entry note holds no reason',
		},
		{
			label: 'the README edited with a fragment that cannot be read',
			files: { 'README.md': '# Demo\n', 'changes/lot.md': 'loose\n' },
			problem: 'changes/lot.md: text before the first section heading',
		},
	])('$label → failed, naming the file and its problem', ({ files, problem }) => {
		expect(checkChangeFragment(changeOf({ files }))).toEqual({ status: 'failed', reason: problem })
	})

	it('the README edit committed after the base, no fragment → failed: the change since the base is read, not the working files', () => {
		const { root, base } = changeOf({ files: { 'README.md': '# demo\n\nmore.\n' } })
		git({ root, args: ['commit', '-qam', 'docs: more'] })

		expect(checkChangeFragment({ root, base })).toMatchObject({ status: 'failed' })
	})

	it('the README renamed (git sees a rename) → failed: the old path counts', () => {
		const { root, base } = changeOf({ files: {} })
		git({ root, args: ['mv', 'README.md', 'docs-readme.md'] })

		expect(checkChangeFragment({ root, base })).toMatchObject({ status: 'failed' })
	})

	it('a release: CHANGELOG.md edited and the fragments deleted with the README edit → passed, the release answers it', () => {
		const { root, base } = changeOf({
			files: { 'README.md': '# demo\n\nmore.\n', 'CHANGELOG.md': '# Changelog\n' },
		})

		expect(checkChangeFragment({ root, base })).toMatchObject({ status: 'passed' })
	})

	it("a base git cannot read → failed with git's reason, nothing thrown", () => {
		const { root } = changeOf({ files: { 'README.md': '# demo\n\nmore.\n' } })

		expect(checkChangeFragment({ root, base: 'f'.repeat(40) })).toMatchObject({
			status: 'failed',
			reason: expect.stringMatching(/^the change since f{12} cannot be read: /),
		})
	})

	it.each<{ label: string; files: Record<string, string> }>([
		{
			label: 'the README edited with a fragment',
			files: { 'README.md': '# demo\n\nmore.\n', 'changes/lot.md': '### Added\n\n- more.\n' },
		},
		{
			label: 'the README edited with a no-entry note',
			files: { 'README.md': '# Demo\n', 'changes/lot.none.md': 'a heading case fix\n' },
		},
	])('$label → passed', ({ files }) => {
		expect(checkChangeFragment(changeOf({ files }))).toMatchObject({ status: 'passed' })
	})

	it('only a source file edited → passed: nothing asks for a fragment', () => {
		expect(
			checkChangeFragment(changeOf({ files: { 'src/a.ts': 'export const a = 2\n' } })),
		).toEqual({
			status: 'passed',
			note: 'no README, doc/ or listed file changed: no fragment asked',
		})
	})

	it('a package without changes/ → passed, saying it keeps no fragments', () => {
		expect(
			checkChangeFragment(
				changeOf({ fragments: false, files: { 'README.md': '# demo\n\nmore.\n' } }),
			),
		).toEqual({
			status: 'passed',
			note: 'no changes/ folder: the package keeps no changelog fragments',
		})
	})
})
