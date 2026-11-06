import {
	chmodSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	readlinkSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

import {
	git,
	initializeRepository,
	temporaryFolder,
	writeFiles,
} from '../../test/scratch-repository.ts'
import { runRecord } from './record.ts'
import { runReview } from './review.ts'

import { describe, expect, it } from 'vitest'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { ReviewDelta } from '../lib/review-rounds/review-rounds.types.ts'

const NOW = new Date('2026-10-31T10:00:00Z')

const BINARY_BEFORE = Buffer.from([0, 1, 2, 0, 255, 10, 0])
const BINARY_AFTER = Buffer.from([0, 1, 3, 0, 254, 10, 0, 0])

/**
 * A repository at `<temporary folder>/repo` (the real path, so git and the test spell it alike); the
 * `.worktrees/` folder a throwaway worktree lands in sits beside it and goes with the temporary folder.
 */
function repository(files: Record<string, string> = {}): string {
	return initializeRepository({
		root: join(realpathSync(temporaryFolder('dialecte-review-')), 'repo'),
		files,
	})
}

/** An empty hand-over folder outside every repository. */
function handoverFolder(): string {
	return realpathSync(temporaryFolder('dialecte-handover-'))
}

function headOf(root: string): string {
	return git({ root, args: ['rev-parse', 'HEAD'] }).trim()
}

/** A snapshot written by hand: `round-<n>/` with `files`, `round-<n>.deleted` with `deleted`, `.base` when given. */
function writeRound(params: {
	folder: string
	round?: number
	files?: Record<string, string | Buffer>
	deleted?: string[]
	base?: string
}): void {
	const name = `round-${params.round ?? 1}`
	mkdirSync(join(params.folder, name), { recursive: true })
	for (const [path, content] of Object.entries(params.files ?? {})) {
		mkdirSync(dirname(join(params.folder, name, path)), { recursive: true })
		writeFileSync(join(params.folder, name, path), content)
	}
	writeFileSync(
		join(params.folder, `${name}.deleted`),
		(params.deleted ?? []).map((path) => `${path}\0`).join(''),
	)
	if (params.base) writeFileSync(join(params.folder, `${name}.base`), `${params.base}\n`)
}

/** The call of `review delta` (round 2 unless given). */
function deltaCall(params: { cwd: string; folder: string; round?: string; flags?: string[] }): {
	cwd: string
	argv: string[]
	now: Date
} {
	return {
		cwd: params.cwd,
		argv: ['delta', params.folder, '--round', params.round ?? '2', ...(params.flags ?? [])],
		now: NOW,
	}
}

/** A `review delta --json` result with its output read back (left as text when the command refused). */
function readDelta(result: CommandResult): { exitCode: number; delta: ReviewDelta | string } {
	return {
		exitCode: result.exitCode,
		delta: result.exitCode === 0 ? (JSON.parse(result.output) as ReviewDelta) : result.output,
	}
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** A diff text holding `lines` and no escape byte (no colour). */
function plainDiffHolding(lines: string) {
	const escape = String.fromCharCode(27)
	return expect.stringMatching(new RegExp(`^[^${escape}]*${escapeRegExp(lines)}[^${escape}]*$`))
}

function commitAll(root: string): void {
	git({ root, args: ['add', '-A'] })
	git({ root, args: ['commit', '-q', '-m', 'chore: more'] })
}

describe('dialecte review delta', { timeout: 60_000 }, () => {
	it('a file in round-1 and in the worktree, changed since → round-1 → worktree, its diff from the round-1 copy', () => {
		const root = repository({ 'a.ts': 'base\n' })
		const folder = handoverFolder()
		writeRound({ folder, files: { 'a.ts': 'old\n' }, base: headOf(root) })
		writeFiles({ root, files: { 'a.ts': 'new\n' } })

		expect(readDelta(runReview(deltaCall({ cwd: root, folder, flags: ['--json'] })))).toEqual({
			exitCode: 0,
			delta: {
				round: 2,
				previous: join(folder, 'round-1'),
				root,
				files: [
					{
						path: 'a.ts',
						form: 'round-1 → worktree',
						diff: expect.stringContaining('-old\n+new\n'),
					},
				],
			},
		})
	})

	it('a file unchanged since round-1 (but changed against HEAD) → not listed', () => {
		const root = repository({ 'a.ts': 'base\n', 'b.ts': 'b\n' })
		const folder = handoverFolder()
		writeRound({ folder, files: { 'a.ts': 'same\n', 'b.ts': 'old b\n' } })
		writeFiles({ root, files: { 'a.ts': 'same\n', 'b.ts': 'new b\n' } })

		expect(readDelta(runReview(deltaCall({ cwd: root, folder, flags: ['--json'] })))).toEqual({
			exitCode: 0,
			delta: expect.objectContaining({
				files: [
					{
						path: 'b.ts',
						form: 'round-1 → worktree',
						diff: expect.stringContaining('-old b\n+new b\n'),
					},
				],
			}),
		})
	})

	it('nothing changed since round-1 → "nothing changed since round-1", exit 0', () => {
		const root = repository({ 'a.ts': 'base\n' })
		const folder = handoverFolder()
		writeRound({ folder, files: { 'a.ts': 'same\n' } })
		writeFiles({ root, files: { 'a.ts': 'same\n' } })

		expect(runReview(deltaCall({ cwd: root, folder }))).toEqual({
			exitCode: 0,
			output: 'lot delta: nothing changed since round-1',
		})
	})

	it('a file in round-1 gone from the worktree (tracked or not) → round-1 → deleted, its lines removed', () => {
		const root = repository({ 'gone.ts': 'gone at head\n' })
		const folder = handoverFolder()
		writeRound({
			folder,
			files: { 'gone.ts': 'gone in round 1\n', 'scratch.ts': 'scratch in round 1\n' },
		})
		rmSync(join(root, 'gone.ts'))

		expect(readDelta(runReview(deltaCall({ cwd: root, folder, flags: ['--json'] })))).toEqual({
			exitCode: 0,
			delta: expect.objectContaining({
				files: [
					{
						path: 'gone.ts',
						form: 'round-1 → deleted',
						diff: expect.stringContaining('-gone in round 1\n'),
					},
					{
						path: 'scratch.ts',
						form: 'round-1 → deleted',
						diff: expect.stringContaining('-scratch in round 1\n'),
					},
				],
			}),
		})
	})

	it('a file deleted in round-1 and back now → deleted → worktree, the whole file added', () => {
		const root = repository({ 'back.ts': 'back again\n' })
		const folder = handoverFolder()
		writeRound({ folder, deleted: ['back.ts'] })

		expect(readDelta(runReview(deltaCall({ cwd: root, folder, flags: ['--json'] })))).toEqual({
			exitCode: 0,
			delta: expect.objectContaining({
				files: [
					{
						path: 'back.ts',
						form: 'deleted → worktree',
						diff: expect.stringContaining('+back again\n'),
					},
				],
			}),
		})
	})

	it('a file deleted in round-1 and still deleted → not listed', () => {
		const root = repository({ 'gone.ts': 'gone\n', 'a.ts': 'a\n' })
		const folder = handoverFolder()
		writeRound({ folder, files: { 'a.ts': 'a1\n' }, deleted: ['gone.ts'] })
		rmSync(join(root, 'gone.ts'))
		writeFiles({ root, files: { 'a.ts': 'a2\n' } })

		expect(readDelta(runReview(deltaCall({ cwd: root, folder, flags: ['--json'] })))).toEqual({
			exitCode: 0,
			delta: expect.objectContaining({
				files: [
					{ path: 'a.ts', form: 'round-1 → worktree', diff: expect.stringContaining('-a1\n+a2\n') },
				],
			}),
		})
	})

	it('a tracked file clean at round-1, changed or deleted now → base → worktree, its diff against HEAD', () => {
		const root = repository({ 'c.ts': 'base c\n', 'd.ts': 'base d\n' })
		const folder = handoverFolder()
		writeRound({ folder })
		writeFiles({ root, files: { 'c.ts': 'changed c\n' } })
		rmSync(join(root, 'd.ts'))

		expect(readDelta(runReview(deltaCall({ cwd: root, folder, flags: ['--json'] })))).toEqual({
			exitCode: 0,
			delta: expect.objectContaining({
				files: [
					{
						path: 'c.ts',
						form: 'base → worktree',
						diff: expect.stringContaining('-base c\n+changed c\n'),
					},
					{ path: 'd.ts', form: 'base → worktree', diff: expect.stringContaining('-base d\n') },
				],
			}),
		})
	})

	it('a new file not in round-1 nor at HEAD → new → worktree, the whole file added', () => {
		const root = repository()
		const folder = handoverFolder()
		writeRound({ folder })
		writeFiles({ root, files: { 'src/e.ts': 'brand new\n' } })

		expect(readDelta(runReview(deltaCall({ cwd: root, folder, flags: ['--json'] })))).toEqual({
			exitCode: 0,
			delta: expect.objectContaining({
				files: [
					{
						path: 'src/e.ts',
						form: 'new → worktree',
						diff: expect.stringContaining('+brand new\n'),
					},
				],
			}),
		})
	})

	it('several files from every source → listed once each, sorted by path', () => {
		const root = repository({ 'm.ts': 'm\n', 'z.ts': 'z\n' })
		const folder = handoverFolder()
		writeRound({ folder, files: { 'z.ts': 'z1\n', 'b.ts': 'b1\n' } })
		writeFiles({ root, files: { 'z.ts': 'z2\n', 'b.ts': 'b2\n', 'm.ts': 'm2\n', 'a.ts': 'a\n' } })

		expect(readDelta(runReview(deltaCall({ cwd: root, folder, flags: ['--json'] })))).toEqual({
			exitCode: 0,
			delta: expect.objectContaining({
				files: [
					{ path: 'a.ts', form: 'new → worktree', diff: expect.stringContaining('+a\n') },
					{ path: 'b.ts', form: 'round-1 → worktree', diff: expect.stringContaining('-b1\n+b2\n') },
					{ path: 'm.ts', form: 'base → worktree', diff: expect.stringContaining('-m\n+m2\n') },
					{ path: 'z.ts', form: 'round-1 → worktree', diff: expect.stringContaining('-z1\n+z2\n') },
				],
			}),
		})
	})

	it('a binary file changed since round-1 → listed, compared byte for byte', () => {
		const root = repository()
		const folder = handoverFolder()
		writeRound({ folder, files: { 'data.bin': BINARY_BEFORE } })
		writeFileSync(join(root, 'data.bin'), BINARY_AFTER)

		expect(readDelta(runReview(deltaCall({ cwd: root, folder, flags: ['--json'] })))).toEqual({
			exitCode: 0,
			delta: expect.objectContaining({
				files: [
					{
						path: 'data.bin',
						form: 'round-1 → worktree',
						diff: expect.stringContaining('Binary files'),
					},
				],
			}),
		})
	})

	it('a binary file identical to its round-1 copy → not listed', () => {
		const root = repository()
		const folder = handoverFolder()
		writeRound({ folder, files: { 'data.bin': BINARY_AFTER } })
		writeFileSync(join(root, 'data.bin'), BINARY_AFTER)

		expect(runReview(deltaCall({ cwd: root, folder }))).toEqual({
			exitCode: 0,
			output: 'lot delta: nothing changed since round-1',
		})
	})

	it('paths with a space and non-ASCII characters → listed as they are', () => {
		const root = repository({ 'dir with space/été.ts': 'base\n' })
		const folder = handoverFolder()
		writeRound({ folder, files: { 'dir with space/été.ts': 'round 1\n' } })
		writeFiles({ root, files: { 'dir with space/été.ts': 'now\n', 'naïve file.ts': 'new\n' } })

		expect(readDelta(runReview(deltaCall({ cwd: root, folder, flags: ['--json'] })))).toEqual({
			exitCode: 0,
			delta: expect.objectContaining({
				files: [
					{
						path: 'dir with space/été.ts',
						form: 'round-1 → worktree',
						diff: expect.stringContaining('-round 1\n+now\n'),
					},
					{
						path: 'naïve file.ts',
						form: 'new → worktree',
						diff: expect.stringContaining('+new\n'),
					},
				],
			}),
		})
	})

	it('a symlink in round-1 whose target changed → listed round-1 → worktree', () => {
		const root = repository({ 'one.txt': 'one\n', 'two.txt': 'two\n' })
		const folder = handoverFolder()
		writeRound({ folder })
		symlinkSync('one.txt', join(folder, 'round-1', 'link'))
		symlinkSync('two.txt', join(root, 'link'))

		expect(readDelta(runReview(deltaCall({ cwd: root, folder, flags: ['--json'] })))).toEqual({
			exitCode: 0,
			delta: expect.objectContaining({
				files: [
					{
						path: 'link',
						form: 'round-1 → worktree',
						diff: expect.stringMatching(/-one\.txt[\s\S]*\+two\.txt/),
					},
				],
			}),
		})
	})

	it('.dialecte/lot.json in the worktree → never listed', () => {
		const root = repository({ 'a.ts': 'a\n' })
		const folder = handoverFolder()
		writeRound({ folder })
		writeFiles({ root, files: { '.dialecte/lot.json': '{}\n', 'pkg/.dialecte/lot.json': '{}\n' } })

		expect(runReview(deltaCall({ cwd: root, folder }))).toEqual({
			exitCode: 0,
			output: 'lot delta: nothing changed since round-1',
		})
	})

	it('run from a subfolder → the root is the worktree top, paths relative to it', () => {
		const root = repository({ 'src/a.ts': 'base\n' })
		const folder = handoverFolder()
		writeRound({ folder, files: { 'src/a.ts': 'old\n' } })
		writeFiles({ root, files: { 'src/a.ts': 'new\n' } })

		expect(
			readDelta(runReview(deltaCall({ cwd: join(root, 'src'), folder, flags: ['--json'] }))),
		).toEqual({
			exitCode: 0,
			delta: {
				round: 2,
				previous: join(folder, 'round-1'),
				root,
				files: [
					{
						path: 'src/a.ts',
						form: 'round-1 → worktree',
						diff: expect.stringContaining('-old\n+new\n'),
					},
				],
			},
		})
	})

	it('text output → the head line with the count, then per file a ── <file> (<form>) line and git diff as is', () => {
		const root = repository({ 'a.ts': 'base\n' })
		const folder = handoverFolder()
		writeRound({ folder, files: { 'a.ts': 'old\n' } })
		writeFiles({ root, files: { 'a.ts': 'new\n', 'e.ts': 'e\n' } })

		expect(runReview(deltaCall({ cwd: root, folder }))).toEqual({
			exitCode: 0,
			output: expect.stringMatching(
				new RegExp(
					`^${escapeRegExp(`lot delta: round-1 → worktree ${root} - 2 file(s) changed`)}\n` +
						`── a\\.ts \\(round-1 → worktree\\)\ndiff --git [\\s\\S]*-old\n\\+new\n` +
						`[\\s\\S]*── e\\.ts \\(new → worktree\\)\ndiff --git [\\s\\S]*\\+e\n?$`,
				),
			),
		})
	})

	it('snapshot taken by record snapshot (rename, deletion, binary), then fixes → each file in its form, the unchanged ones left out', () => {
		const root = repository({ 'a.ts': 'a\n', 'b.ts': 'b\n', 'c.ts': 'c\n', 'gone.ts': 'gone\n' })
		const folder = handoverFolder()
		git({ root, args: ['mv', 'a.ts', 'moved.ts'] })
		rmSync(join(root, 'b.ts'))
		writeFiles({ root, files: { 'c.ts': 'c1\n' } })
		writeFileSync(join(root, 'bin.dat'), BINARY_BEFORE)

		expect(runRecord({ cwd: root, argv: ['snapshot', folder, '--round', '1'] })).toEqual({
			exitCode: 0,
			output: expect.stringMatching(/^lot snapshot: round-1 /),
		})
		writeFiles({ root, files: { 'moved.ts': 'a2\n', 'b.ts': 'b\n' } })
		writeFileSync(join(root, 'bin.dat'), BINARY_AFTER)
		rmSync(join(root, 'gone.ts'))

		expect(readDelta(runReview(deltaCall({ cwd: root, folder, flags: ['--json'] })))).toEqual({
			exitCode: 0,
			delta: {
				round: 2,
				previous: join(folder, 'round-1'),
				root,
				files: [
					{ path: 'b.ts', form: 'deleted → worktree', diff: expect.stringContaining('+b\n') },
					{
						path: 'bin.dat',
						form: 'round-1 → worktree',
						diff: expect.stringContaining('Binary files'),
					},
					{ path: 'gone.ts', form: 'base → worktree', diff: expect.stringContaining('-gone\n') },
					{
						path: 'moved.ts',
						form: 'round-1 → worktree',
						diff: expect.stringContaining('-a\n+a2\n'),
					},
				],
			},
		})
	})

	it('a rename made after round-1 (git mv c.ts c2.ts) → c.ts base → worktree with its lines removed, c2.ts new → worktree', () => {
		const root = repository({ 'c.ts': 'c line\n' })
		const folder = handoverFolder()
		writeRound({ folder, base: headOf(root) })
		git({ root, args: ['mv', 'c.ts', 'c2.ts'] })

		expect(readDelta(runReview(deltaCall({ cwd: root, folder, flags: ['--json'] })))).toEqual({
			exitCode: 0,
			delta: expect.objectContaining({
				files: [
					{ path: 'c.ts', form: 'base → worktree', diff: expect.stringContaining('-c line\n') },
					{ path: 'c2.ts', form: 'new → worktree', diff: expect.stringContaining('+c line\n') },
				],
			}),
		})
	})

	it("repository colour, external diff and textconv settings → ignored: git's own plain diff, no ESC byte", () => {
		const root = repository({
			'.gitattributes': '*.ts diff=upper\n',
			'a.ts': 'base a\n',
			'c.ts': 'base c\n',
		})
		git({ root, args: ['config', 'color.ui', 'always'] })
		git({ root, args: ['config', 'diff.external', 'false'] })
		git({ root, args: ['config', 'diff.upper.textconv', 'tr a-z A-Z'] })
		const folder = handoverFolder()
		writeRound({ folder, files: { 'a.ts': 'old\n' } })
		writeFiles({ root, files: { 'a.ts': 'new\n', 'c.ts': 'changed c\n' } })

		expect(readDelta(runReview(deltaCall({ cwd: root, folder, flags: ['--json'] })))).toEqual({
			exitCode: 0,
			delta: expect.objectContaining({
				files: [
					{
						path: 'a.ts',
						form: 'round-1 → worktree',
						diff: plainDiffHolding('-old\n+new\n'),
					},
					{
						path: 'c.ts',
						form: 'base → worktree',
						diff: plainDiffHolding('-base c\n+changed c\n'),
					},
				],
			}),
		})
	})

	it('--round 3 → reads round-2: the previous snapshot is round-2, the form names it', () => {
		const root = repository({ 'a.ts': 'base\n' })
		const folder = handoverFolder()
		writeRound({ folder, round: 1, files: { 'a.ts': 'round 1\n' } })
		writeRound({ folder, round: 2, files: { 'a.ts': 'round 2\n' } })
		writeFiles({ root, files: { 'a.ts': 'now\n' } })

		expect(
			readDelta(runReview(deltaCall({ cwd: root, folder, round: '3', flags: ['--json'] }))),
		).toEqual({
			exitCode: 0,
			delta: {
				round: 3,
				previous: join(folder, 'round-2'),
				root,
				files: [
					{
						path: 'a.ts',
						form: 'round-2 → worktree',
						diff: expect.stringContaining('-round 2\n+now\n'),
					},
				],
			},
		})
	})

	it('a .dialecte/lot.json inside a hand-made round-1/ → never listed', () => {
		const root = repository()
		const folder = handoverFolder()
		writeRound({
			folder,
			files: { '.dialecte/lot.json': '{}\n', 'pkg/.dialecte/lot.json': '{}\n' },
		})

		expect(runReview(deltaCall({ cwd: root, folder }))).toEqual({
			exitCode: 0,
			output: 'lot delta: nothing changed since round-1',
		})
	})

	for (const [label, flags] of [
		['an unknown option', ['--colour']],
		['an extra word', ['extra']],
	] as const)
		it(`${label} → a one-line usage, exit 2`, () => {
			const root = repository()
			const folder = handoverFolder()
			writeRound({ folder })

			expect(runReview(deltaCall({ cwd: root, folder, flags: [...flags] }))).toEqual({
				exitCode: 2,
				output: expect.stringMatching(/^lot delta[^\n]*$/),
			})
		})

	it('round-1.base differs from HEAD → refused, exit 1, naming both', () => {
		const root = repository({ 'a.ts': 'a\n' })
		const folder = handoverFolder()
		const base = headOf(root)
		writeRound({ folder, files: { 'a.ts': 'a1\n' }, base })
		writeFiles({ root, files: { 'a.ts': 'a2\n' } })
		commitAll(root)
		const head = headOf(root)

		expect(runReview(deltaCall({ cwd: root, folder }))).toEqual({
			exitCode: 1,
			output: expect.stringMatching(
				new RegExp(
					`HEAD moved since round-1 \\(base ${base.slice(0, 12)}[0-9a-f]*, HEAD ${head.slice(0, 12)}[0-9a-f]*\\)`,
				),
			),
		})
	})

	it('no round-1/ → refused, exit 1, naming it', () => {
		const root = repository()
		const folder = handoverFolder()
		writeFileSync(join(folder, 'round-1.deleted'), '')

		expect(runReview(deltaCall({ cwd: root, folder }))).toEqual({
			exitCode: 1,
			output: expect.stringMatching(/^lot delta: .*round-1(?!\.deleted)/),
		})
	})

	it('no round-1.deleted → refused, exit 1, naming it', () => {
		const root = repository()
		const folder = handoverFolder()
		writeRound({ folder })
		rmSync(join(folder, 'round-1.deleted'))

		expect(runReview(deltaCall({ cwd: root, folder }))).toEqual({
			exitCode: 1,
			output: expect.stringMatching(/^lot delta: .*round-1\.deleted/),
		})
	})

	for (const round of ['1', '0', '-1', '1.5', 'x'])
		it(`--round ${round} → a one-line usage, exit 2`, () => {
			const root = repository()
			const folder = handoverFolder()
			writeRound({ folder })

			expect(runReview(deltaCall({ cwd: root, folder, round }))).toEqual({
				exitCode: 2,
				output: expect.stringMatching(/^lot delta[^\n]*$/),
			})
		})

	it('no --round → a one-line usage, exit 2', () => {
		const root = repository()
		const folder = handoverFolder()
		writeRound({ folder })

		expect(runReview({ cwd: root, argv: ['delta', folder], now: NOW })).toEqual({
			exitCode: 2,
			output: expect.stringMatching(/^lot delta[^\n]*$/),
		})
	})

	it('a folder inside the repository → refused, exit 1', () => {
		const root = repository()
		const folder = join(root, 'handover')
		writeRound({ folder })

		expect(runReview(deltaCall({ cwd: root, folder }))).toEqual({
			exitCode: 1,
			output: expect.stringContaining(
				`${folder} is inside the repository ${root}: a hand-over folder stays outside every repository`,
			),
		})
	})
})

describe('dialecte review delta --worktree', { timeout: 60_000 }, () => {
	/** HEAD: keep.ts, old.ts, a file `x`; round-1: keep.ts changed, x turned into a folder, a symlink, old.ts deleted. */
	function lotWithRoundOne(): { root: string; folder: string; throwaway: string } {
		const root = repository({ 'keep.ts': 'keep\n', 'old.ts': 'old\n', x: 'x file\n' })
		const folder = handoverFolder()
		writeRound({
			folder,
			files: { 'keep.ts': 'keep round 1\n', 'x/inner.ts': 'inner\n', 'new.ts': 'new\n' },
			deleted: ['old.ts', 'x'],
			base: headOf(root),
		})
		symlinkSync('keep.ts', join(folder, 'round-1', 'link'))
		writeFiles({ root, files: { 'keep.ts': 'keep now\n' } })
		return { root, folder, throwaway: join(dirname(root), '.worktrees', 'repo-main-round-1') }
	}

	it('a branch <lot branch>-round-<n-1> checked out beside the lot: HEAD, the deletions, then round-1 copied over', () => {
		const { root, folder, throwaway } = lotWithRoundOne()

		expect(runReview(deltaCall({ cwd: root, folder, flags: ['--worktree'] })).exitCode).toBe(0)
		expect(git({ root: throwaway, args: ['rev-parse', '--abbrev-ref', 'HEAD'] }).trim()).toBe(
			'main-round-1',
		)
		expect(readFileSync(join(throwaway, 'keep.ts'), 'utf8')).toBe('keep round 1\n')
		expect(readFileSync(join(throwaway, 'x/inner.ts'), 'utf8')).toBe('inner\n')
		expect(readFileSync(join(throwaway, 'new.ts'), 'utf8')).toBe('new\n')
		expect(existsSync(join(throwaway, 'old.ts'))).toBe(false)
		expect(lstatSync(join(throwaway, 'link')).isSymbolicLink()).toBe(true)
		expect(readlinkSync(join(throwaway, 'link'))).toBe('keep.ts')
	})

	it('the throwaway status: the deletions staged by git rm, round-1 copied as working-tree changes', () => {
		const { root, folder, throwaway } = lotWithRoundOne()

		expect(runReview(deltaCall({ cwd: root, folder, flags: ['--worktree'] })).exitCode).toBe(0)
		expect(git({ root: throwaway, args: ['status', '--porcelain', '--untracked-files=all'] })).toBe(
			' M keep.ts\nD  old.ts\nD  x\n?? link\n?? new.ts\n?? x/inner.ts\n',
		)
	})

	it('the lot is a linked worktree on feat-x ahead of main → branch feat-x-round-1 from feat-x, the removal cd into the main checkout', () => {
		const parent = realpathSync(temporaryFolder('dialecte-review-'))
		const main = initializeRepository({ root: join(parent, 'repo'), files: { 'a.ts': 'a\n' } })
		const lot = join(parent, 'lot')
		git({ root: main, args: ['worktree', 'add', '--quiet', '-b', 'feat-x', lot, 'main'] })
		writeFiles({ root: lot, files: { 'feature.ts': 'feature\n' } })
		commitAll(lot)
		const folder = handoverFolder()
		writeRound({ folder, files: { 'a.ts': 'a round 1\n' }, base: headOf(lot) })
		writeFiles({ root: lot, files: { 'a.ts': 'a now\n' } })
		const throwaway = join(parent, '.worktrees', 'repo-feat-x-round-1')

		expect(runReview(deltaCall({ cwd: lot, folder, flags: ['--worktree'] }))).toEqual({
			exitCode: 0,
			output: expect.stringMatching(
				new RegExp(
					`${escapeRegExp(`throwaway worktree: ${throwaway} (branch feat-x-round-1, round-1 applied)`)}[\\s\\S]*` +
						escapeRegExp(
							`cd '${main}' && git worktree remove --force '${throwaway}' && git branch -D 'feat-x-round-1'`,
						),
				),
			),
		})
		expect(git({ root: throwaway, args: ['rev-parse', '--abbrev-ref', 'HEAD'] }).trim()).toBe(
			'feat-x-round-1',
		)
		expect(readFileSync(join(throwaway, 'feature.ts'), 'utf8')).toBe('feature\n')
		expect(readFileSync(join(throwaway, 'a.ts'), 'utf8')).toBe('a round 1\n')
	})

	it('the output names the throwaway and its removal command with an absolute cd', () => {
		const { root, folder, throwaway } = lotWithRoundOne()

		expect(runReview(deltaCall({ cwd: root, folder, flags: ['--worktree'] }))).toEqual({
			exitCode: 0,
			output: expect.stringMatching(
				new RegExp(
					`${escapeRegExp(`throwaway worktree: ${throwaway} (branch main-round-1, round-1 applied)`)}[\\s\\S]*` +
						escapeRegExp(
							`cd '${root}' && git worktree remove --force '${throwaway}' && git branch -D 'main-round-1'`,
						),
				),
			),
		})
	})

	it('--json --worktree → the throwaway in the JSON', () => {
		const { root, folder, throwaway } = lotWithRoundOne()

		expect(
			readDelta(runReview(deltaCall({ cwd: root, folder, flags: ['--json', '--worktree'] }))),
		).toEqual({
			exitCode: 0,
			delta: expect.objectContaining({
				throwaway: {
					path: throwaway,
					branch: 'main-round-1',
					removal: `cd '${root}' && git worktree remove --force '${throwaway}' && git branch -D 'main-round-1'`,
				},
			}),
		})
	})

	it("the lot's worktree is never changed: its status is the same before and after", () => {
		const { root, folder } = lotWithRoundOne()
		const before = git({ root, args: ['status', '--porcelain'] })

		expect(runReview(deltaCall({ cwd: root, folder, flags: ['--worktree'] })).exitCode).toBe(0)
		expect(git({ root, args: ['status', '--porcelain'] })).toBe(before)
		expect(readFileSync(join(root, 'keep.ts'), 'utf8')).toBe('keep now\n')
	})

	it('no deletions in round-1 (an empty .deleted) → the throwaway is made all the same', () => {
		const root = repository({ 'a.ts': 'a\n' })
		const folder = handoverFolder()
		writeRound({ folder, files: { 'a.ts': 'a1\n' }, base: headOf(root) })
		writeFiles({ root, files: { 'a.ts': 'a2\n' } })
		const throwaway = join(dirname(root), '.worktrees', 'repo-main-round-1')

		expect(runReview(deltaCall({ cwd: root, folder, flags: ['--worktree'] })).exitCode).toBe(0)
		expect(readFileSync(join(throwaway, 'a.ts'), 'utf8')).toBe('a1\n')
	})

	it('the branch exists already → refused, exit 1, no worktree added, the lot unchanged', () => {
		const { root, folder } = lotWithRoundOne()
		git({ root, args: ['branch', 'main-round-1'] })
		const before = git({ root, args: ['status', '--porcelain'] })
		const worktrees = git({ root, args: ['worktree', 'list', '--porcelain'] })

		expect(runReview(deltaCall({ cwd: root, folder, flags: ['--worktree'] }))).toEqual({
			exitCode: 1,
			output: expect.stringContaining('main-round-1'),
		})
		expect(git({ root, args: ['worktree', 'list', '--porcelain'] })).toBe(worktrees)
		expect(git({ root, args: ['status', '--porcelain'] })).toBe(before)
	})

	it('a detached HEAD → refused, exit 1, no branch nor worktree made', () => {
		const { root, folder } = lotWithRoundOne()
		git({ root, args: ['checkout', '-q', '--detach'] })

		expect(runReview(deltaCall({ cwd: root, folder, flags: ['--worktree'] }))).toEqual({
			exitCode: 1,
			output: expect.stringMatching(/^lot delta: .*detached/),
		})
		expect(git({ root, args: ['branch', '--list', 'main-round-1'] })).toBe('')
		expect(
			git({ root, args: ['worktree', 'list', '--porcelain'] }).match(/^worktree /gm),
		).toHaveLength(1)
	})
})

describe('dialecte review delta - round 1 fixes', { timeout: 60_000 }, () => {
	it('a folder inside <repo>/.git → refused naming the git folder, exit 1', () => {
		const root = repository({ 'a.ts': 'a\n' })
		const gitFolder = git({ root, args: ['rev-parse', '--absolute-git-dir'] }).trim()
		const folder = join(root, '.git', 'handover')
		writeRound({ folder, files: { 'a.ts': 'a1\n' } })
		writeFiles({ root, files: { 'a.ts': 'a2\n' } })

		expect(runReview(deltaCall({ cwd: root, folder }))).toEqual({
			exitCode: 1,
			output: `lot delta: ${folder} is inside the git folder ${gitFolder}: a hand-over folder stays outside every repository`,
		})
	})

	it('an untracked nested repository in the worktree → refused naming it, exit 1, never skipped', () => {
		const root = repository({ 'a.ts': 'a\n' })
		const folder = handoverFolder()
		writeRound({ folder, files: { 'a.ts': 'a1\n' } })
		writeFiles({ root, files: { 'a.ts': 'a2\n' } })
		initializeRepository({ root: join(root, 'nested'), files: { 'inner.ts': 'inner\n' } })

		expect(runReview(deltaCall({ cwd: root, folder }))).toEqual({
			exitCode: 1,
			output: expect.stringMatching(/^lot delta: .*nested/),
		})
	})

	it('a submodule (a gitlink at HEAD) that status lists → refused naming it, exit 1', () => {
		const root = repository({ 'a.ts': 'a\n' })
		initializeRepository({ root: join(root, 'sub'), files: { 'inner.ts': 'inner\n' } })
		git({ root, args: ['add', 'sub'] })
		git({ root, args: ['commit', '-q', '-m', 'chore: submodule'] })
		const folder = handoverFolder()
		writeRound({ folder, files: { 'a.ts': 'a1\n' }, base: headOf(root) })
		writeFiles({ root, files: { 'a.ts': 'a2\n', 'sub/inner.ts': 'dirty\n' } })

		expect(runReview(deltaCall({ cwd: root, folder }))).toEqual({
			exitCode: 1,
			output: expect.stringMatching(/^lot delta: .*\bsub\b/),
		})
	})

	it('--worktree failing inside addWorktree after git worktree add (the lot node_modules cannot be copied) → exit 1, the error and the removal command', () => {
		const root = repository({ '.gitignore': 'node_modules/\n', 'a.ts': 'a\n' })
		writeFiles({ root, files: { 'node_modules/pkg/index.js': 'export {}\n' } })
		chmodSync(join(root, 'node_modules/pkg/index.js'), 0o000)
		const folder = handoverFolder()
		writeRound({ folder, files: { 'a.ts': 'a1\n' }, base: headOf(root) })
		writeFiles({ root, files: { 'a.ts': 'a2\n' } })
		const throwaway = join(dirname(root), '.worktrees', 'repo-main-round-1')

		expect(runReview(deltaCall({ cwd: root, folder, flags: ['--worktree'] }))).toEqual({
			exitCode: 1,
			output: expect.stringMatching(
				new RegExp(
					`^lot delta: [\\s\\S]*node_modules[\\s\\S]*${escapeRegExp(
						`cd '${root}' && git worktree remove --force '${throwaway}' && git branch -D 'main-round-1'`,
					)}`,
				),
			),
		})
		expect(existsSync(throwaway)).toBe(true)
	})

	it('a deleted g*.ts beside a tracked g1.ts → the throwaway removes g*.ts only (pathspecs taken literally)', () => {
		const root = repository({ 'g*.ts': 'star\n', 'g1.ts': 'one\n' })
		const folder = handoverFolder()
		writeRound({ folder, deleted: ['g*.ts'], base: headOf(root) })
		rmSync(join(root, 'g*.ts'))
		const throwaway = join(dirname(root), '.worktrees', 'repo-main-round-1')

		expect(runReview(deltaCall({ cwd: root, folder, flags: ['--worktree'] })).exitCode).toBe(0)
		expect(readFileSync(join(throwaway, 'g1.ts'), 'utf8')).toBe('one\n')
		expect(existsSync(join(throwaway, 'g*.ts'))).toBe(false)
		expect(git({ root: throwaway, args: ['status', '--porcelain', '--untracked-files=all'] })).toBe(
			'D  g*.ts\n',
		)
	})

	it('base → worktree of a deleted g*.ts beside a changed g1.ts → its diff holds that one file only', () => {
		const root = repository({ 'g*.ts': 'star\n', 'g1.ts': 'one\n' })
		const folder = handoverFolder()
		writeRound({ folder, base: headOf(root) })
		rmSync(join(root, 'g*.ts'))
		writeFiles({ root, files: { 'g1.ts': 'one 2\n' } })

		expect(readDelta(runReview(deltaCall({ cwd: root, folder, flags: ['--json'] })))).toEqual({
			exitCode: 0,
			delta: expect.objectContaining({
				files: [
					{
						path: 'g*.ts',
						form: 'base → worktree',
						diff: expect.stringMatching(/^(?![\s\S]*g1\.ts)[\s\S]*-star\n/),
					},
					{
						path: 'g1.ts',
						form: 'base → worktree',
						diff: expect.stringContaining('-one\n+one 2\n'),
					},
				],
			}),
		})
	})

	it('review delta --round 2 --json -- <folder> → the folder after -- is read as the folder', () => {
		const root = repository({ 'a.ts': 'a\n' })
		const folder = handoverFolder()
		writeRound({ folder, files: { 'a.ts': 'a1\n' } })
		writeFiles({ root, files: { 'a.ts': 'a2\n' } })

		expect(
			readDelta(
				runReview({ cwd: root, argv: ['delta', '--round', '2', '--json', '--', folder], now: NOW }),
			),
		).toEqual({
			exitCode: 0,
			delta: expect.objectContaining({
				files: [
					{ path: 'a.ts', form: 'round-1 → worktree', diff: expect.stringContaining('-a1\n+a2\n') },
				],
			}),
		})
	})
})

describe('dialecte review delta - a submodule newly added', { timeout: 60_000 }, () => {
	for (const dirty of [false, true])
		it(`a submodule added to the index, not at HEAD (status ${dirty ? 'AM' : 'A '} sub) → refused naming it, exit 1`, () => {
			const root = repository({ 'a.ts': 'a\n' })
			const folder = handoverFolder()
			writeRound({ folder, files: { 'a.ts': 'a1\n' }, base: headOf(root) })
			initializeRepository({ root: join(root, 'sub'), files: { 'inner.ts': 'inner\n' } })
			git({ root, args: ['add', 'sub'] })
			writeFiles({
				root,
				files: { 'a.ts': 'a2\n', ...(dirty ? { 'sub/inner.ts': 'dirty\n' } : {}) },
			})

			expect(runReview(deltaCall({ cwd: root, folder }))).toEqual({
				exitCode: 1,
				output: expect.stringMatching(/^lot delta: .*\bsub\b/),
			})
		})
})
