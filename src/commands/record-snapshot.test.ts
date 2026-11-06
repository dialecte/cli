import {
	chmodSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	realpathSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import {
	createScratchRepository,
	git,
	initializeRepository,
	temporaryFolder,
	writeFiles,
} from '../../test/scratch-repository.ts'
import { runRecord } from './record.ts'

import { describe, expect, it } from 'vitest'

/** Bytes no text tool keeps: NUL, a high byte, a lone line feed. */
const BINARY_BEFORE = Buffer.from([0, 1, 2, 0, 255, 10, 0])
const BINARY_AFTER = Buffer.from([0, 1, 3, 0, 254, 10, 0, 0])

/** An empty hand-over folder outside every repository. */
function handoverFolder(): string {
	return realpathSync(temporaryFolder('dialecte-handover-'))
}

function headOf(root: string): string {
	return git({ root, args: ['rev-parse', 'HEAD'] }).trim()
}

/** The call of `record snapshot`. */
function snapshotCall(params: { cwd: string; folder: string; round?: string }) {
	return { cwd: params.cwd, argv: ['snapshot', params.folder, '--round', params.round ?? '1'] }
}

function summary(params: {
	round?: number
	copied: number
	deleted: number
	root: string
	folder: string
}) {
	return `lot snapshot: round-${params.round ?? 1} - ${params.copied} copied, ${params.deleted} deleted, base ${headOf(params.root).slice(0, 12)} - ${params.folder}`
}

/** Every file and symlink under `folder`, relative to it, sorted (folders themselves not listed). */
function listTree(folder: string): string[] {
	const found: string[] = []
	function walk(relative: string): void {
		for (const name of readdirSync(join(folder, relative))) {
			const path = relative ? `${relative}/${name}` : name
			if (lstatSync(join(folder, path)).isDirectory()) walk(path)
			else found.push(path)
		}
	}
	walk('')
	return found.sort()
}

describe('dialecte record snapshot', { timeout: 60_000 }, () => {
	it('a modified tracked file and a new file → both copied byte for byte, an empty .deleted, .base = HEAD and a newline', () => {
		const root = createScratchRepository({ 'src/a.ts': 'base a\n' })
		writeFiles({ root, files: { 'src/a.ts': 'changed a\n', 'src/new.ts': 'new\n' } })
		const folder = handoverFolder()

		expect(runRecord(snapshotCall({ cwd: root, folder }))).toEqual({
			exitCode: 0,
			output: summary({ copied: 2, deleted: 0, root, folder }),
		})
		expect(listTree(join(folder, 'round-1'))).toEqual(['src/a.ts', 'src/new.ts'])
		expect(readFileSync(join(folder, 'round-1/src/a.ts'), 'utf8')).toBe('changed a\n')
		expect(readFileSync(join(folder, 'round-1/src/new.ts'), 'utf8')).toBe('new\n')
		expect(readFileSync(join(folder, 'round-1.deleted'), 'utf8')).toBe('')
		expect(readFileSync(join(folder, 'round-1.base'), 'utf8')).toBe(`${headOf(root)}\n`)
	})

	it('a successful snapshot → exactly round-<n>/, round-<n>.deleted and round-<n>.base in the folder, no partial left', () => {
		const root = createScratchRepository({ 'a.ts': 'a\n' })
		writeFiles({ root, files: { 'a.ts': 'b\n' } })
		const folder = handoverFolder()

		expect(runRecord(snapshotCall({ cwd: root, folder })).exitCode).toBe(0)
		expect(readdirSync(folder).sort()).toEqual(['round-1', 'round-1.base', 'round-1.deleted'])
	})

	it('nothing changed → round-<n>/ made empty, an empty .deleted, 0 copied', () => {
		const root = createScratchRepository({ 'a.ts': 'a\n' })
		const folder = handoverFolder()

		expect(runRecord(snapshotCall({ cwd: root, folder }))).toEqual({
			exitCode: 0,
			output: summary({ copied: 0, deleted: 0, root, folder }),
		})
		expect(statSync(join(folder, 'round-1')).isDirectory()).toBe(true)
		expect(readdirSync(join(folder, 'round-1'))).toEqual([])
		expect(readFileSync(join(folder, 'round-1.deleted'), 'utf8')).toBe('')
	})

	it('a staged rename (git mv) → the new path copied, the old path in .deleted', () => {
		const root = createScratchRepository({ 'src/old.ts': 'kept\n' })
		git({ root, args: ['mv', 'src/old.ts', 'src/renamed.ts'] })
		const folder = handoverFolder()

		expect(runRecord(snapshotCall({ cwd: root, folder }))).toEqual({
			exitCode: 0,
			output: summary({ copied: 1, deleted: 1, root, folder }),
		})
		expect(listTree(join(folder, 'round-1'))).toEqual(['src/renamed.ts'])
		expect(readFileSync(join(folder, 'round-1/src/renamed.ts'), 'utf8')).toBe('kept\n')
		expect(readFileSync(join(folder, 'round-1.deleted'), 'utf8')).toBe('src/old.ts\0')
	})

	it('a staged rename whose old path is back on disk → both paths copied, nothing deleted', () => {
		const root = createScratchRepository({ 'src/old.ts': 'kept\n' })
		git({ root, args: ['mv', 'src/old.ts', 'src/renamed.ts'] })
		writeFiles({ root, files: { 'src/old.ts': 'a new old\n' } })
		const folder = handoverFolder()

		expect(runRecord(snapshotCall({ cwd: root, folder }))).toEqual({
			exitCode: 0,
			output: summary({ copied: 2, deleted: 0, root, folder }),
		})
		expect(listTree(join(folder, 'round-1'))).toEqual(['src/old.ts', 'src/renamed.ts'])
		expect(readFileSync(join(folder, 'round-1/src/old.ts'), 'utf8')).toBe('a new old\n')
		expect(readFileSync(join(folder, 'round-1.deleted'), 'utf8')).toBe('')
	})

	it('an unstaged rm and a staged git rm → both in .deleted, sorted, each followed by a NUL; nothing copied', () => {
		const root = createScratchRepository({ 'b-gone.ts': 'b\n', 'a-removed.ts': 'a\n' })
		rmSync(join(root, 'b-gone.ts'))
		git({ root, args: ['rm', '-q', 'a-removed.ts'] })
		const folder = handoverFolder()

		expect(runRecord(snapshotCall({ cwd: root, folder }))).toEqual({
			exitCode: 0,
			output: summary({ copied: 0, deleted: 2, root, folder }),
		})
		expect(readFileSync(join(folder, 'round-1.deleted'), 'utf8')).toBe('a-removed.ts\0b-gone.ts\0')
		expect(readdirSync(join(folder, 'round-1'))).toEqual([])
	})

	it('a staged rename z.ts → a.ts and a deleted m.ts → .deleted sorted by path (m.ts before z.ts), not in status order', () => {
		const root = createScratchRepository({ 'z.ts': 'z\n', 'm.ts': 'm\n' })
		git({ root, args: ['mv', 'z.ts', 'a.ts'] })
		rmSync(join(root, 'm.ts'))
		const folder = handoverFolder()

		expect(runRecord(snapshotCall({ cwd: root, folder }))).toEqual({
			exitCode: 0,
			output: summary({ copied: 1, deleted: 2, root, folder }),
		})
		expect(readFileSync(join(folder, 'round-1.deleted'), 'utf8')).toBe('m.ts\0z.ts\0')
		expect(listTree(join(folder, 'round-1'))).toEqual(['a.ts'])
	})

	it('a tracked file x replaced by a folder x/ holding y.ts → x in .deleted, x/y.ts copied', () => {
		const root = createScratchRepository({ x: 'x file\n' })
		rmSync(join(root, 'x'))
		writeFiles({ root, files: { 'x/y.ts': 'y\n' } })
		const folder = handoverFolder()

		expect(runRecord(snapshotCall({ cwd: root, folder }))).toEqual({
			exitCode: 0,
			output: summary({ copied: 1, deleted: 1, root, folder }),
		})
		expect(readFileSync(join(folder, 'round-1.deleted'), 'utf8')).toBe('x\0')
		expect(listTree(join(folder, 'round-1'))).toEqual(['x/y.ts'])
		expect(readFileSync(join(folder, 'round-1/x/y.ts'), 'utf8')).toBe('y\n')
	})

	it('leftover round-1.partial/ and round-1.deleted.partial from a crashed run → removed, the snapshot taken, no partial left', () => {
		const root = createScratchRepository({ 'a.ts': 'a\n' })
		writeFiles({ root, files: { 'a.ts': 'a2\n' } })
		const folder = handoverFolder()
		writeFiles({
			root: folder,
			files: { 'round-1.partial/junk.ts': 'junk\n', 'round-1.deleted.partial': 'junk\0' },
		})

		expect(runRecord(snapshotCall({ cwd: root, folder }))).toEqual({
			exitCode: 0,
			output: summary({ copied: 1, deleted: 0, root, folder }),
		})
		expect(readdirSync(folder).sort()).toEqual(['round-1', 'round-1.base', 'round-1.deleted'])
		expect(listTree(join(folder, 'round-1'))).toEqual(['a.ts'])
		expect(readFileSync(join(folder, 'round-1.deleted'), 'utf8')).toBe('')
	})

	it('a binary file (NUL bytes) modified and one added → copied byte for byte', () => {
		const root = createScratchRepository()
		writeFileSync(join(root, 'data.bin'), BINARY_BEFORE)
		git({ root, args: ['add', 'data.bin'] })
		git({ root, args: ['commit', '-q', '-m', 'chore: binary'] })
		writeFileSync(join(root, 'data.bin'), BINARY_AFTER)
		writeFileSync(join(root, 'added.bin'), BINARY_BEFORE)
		const folder = handoverFolder()

		expect(runRecord(snapshotCall({ cwd: root, folder }))).toEqual({
			exitCode: 0,
			output: summary({ copied: 2, deleted: 0, root, folder }),
		})
		expect(readFileSync(join(folder, 'round-1/data.bin'))).toEqual(BINARY_AFTER)
		expect(readFileSync(join(folder, 'round-1/added.bin'))).toEqual(BINARY_BEFORE)
	})

	it('a new nested folder → each of its files copied, an ignored file inside it left out (the folder is not copied whole)', () => {
		const root = createScratchRepository({ '.gitignore': '*.log\n' })
		writeFiles({
			root,
			files: { 'new/deep/x.ts': 'x\n', 'new/z.ts': 'z\n', 'new/deep/debug.log': 'ignored\n' },
		})
		const folder = handoverFolder()

		expect(runRecord(snapshotCall({ cwd: root, folder }))).toEqual({
			exitCode: 0,
			output: summary({ copied: 2, deleted: 0, root, folder }),
		})
		expect(listTree(join(folder, 'round-1'))).toEqual(['new/deep/x.ts', 'new/z.ts'])
	})

	it('paths with a space and non-ASCII characters → copied and listed as they are, not quoted', () => {
		const root = createScratchRepository({
			'dir with space/été.ts': 'before\n',
			'ü gone.ts': 'gone\n',
		})
		writeFiles({ root, files: { 'dir with space/été.ts': 'after\n', 'naïve file.ts': 'new\n' } })
		rmSync(join(root, 'ü gone.ts'))
		const folder = handoverFolder()

		expect(runRecord(snapshotCall({ cwd: root, folder }))).toEqual({
			exitCode: 0,
			output: summary({ copied: 2, deleted: 1, root, folder }),
		})
		expect(listTree(join(folder, 'round-1'))).toEqual(['dir with space/été.ts', 'naïve file.ts'])
		expect(readFileSync(join(folder, 'round-1/dir with space/été.ts'), 'utf8')).toBe('after\n')
		expect(readFileSync(join(folder, 'round-1.deleted'), 'utf8')).toBe('ü gone.ts\0')
	})

	it('a file added then removed (status AD) → neither copied nor deleted', () => {
		const root = createScratchRepository()
		writeFiles({ root, files: { 'tmp.ts': 'temporary\n' } })
		git({ root, args: ['add', 'tmp.ts'] })
		rmSync(join(root, 'tmp.ts'))
		const folder = handoverFolder()

		expect(runRecord(snapshotCall({ cwd: root, folder }))).toEqual({
			exitCode: 0,
			output: summary({ copied: 0, deleted: 0, root, folder }),
		})
		expect(readdirSync(join(folder, 'round-1'))).toEqual([])
		expect(readFileSync(join(folder, 'round-1.deleted'), 'utf8')).toBe('')
	})

	it('run from a subfolder → the whole worktree is snapshot, paths relative to its root', () => {
		const root = createScratchRepository({ 'src/a.ts': 'a\n', 'top.ts': 'top\n' })
		writeFiles({ root, files: { 'src/a.ts': 'a2\n', 'top.ts': 'top2\n' } })
		const folder = handoverFolder()

		expect(runRecord(snapshotCall({ cwd: join(root, 'src'), folder }))).toEqual({
			exitCode: 0,
			output: summary({ copied: 2, deleted: 0, root, folder }),
		})
		expect(listTree(join(folder, 'round-1'))).toEqual(['src/a.ts', 'top.ts'])
	})

	it('a symlink → copied as a symlink with the same target', () => {
		const root = createScratchRepository({ 'target.txt': 'target\n' })
		symlinkSync('target.txt', join(root, 'link'))
		const folder = handoverFolder()

		expect(runRecord(snapshotCall({ cwd: root, folder }))).toEqual({
			exitCode: 0,
			output: summary({ copied: 1, deleted: 0, root, folder }),
		})
		expect(lstatSync(join(folder, 'round-1/link')).isSymbolicLink()).toBe(true)
		expect(readlinkSync(join(folder, 'round-1/link'))).toBe('target.txt')
	})

	it('an executable bit (mode-only change and a new script) → kept on the copy; a plain file stays plain', () => {
		const root = createScratchRepository({ 'run.sh': 'echo run\n', 'plain.ts': 'plain\n' })
		chmodSync(join(root, 'run.sh'), 0o755)
		writeFiles({ root, files: { 'tool.sh': 'echo tool\n', 'plain.ts': 'plain 2\n' } })
		chmodSync(join(root, 'tool.sh'), 0o755)
		const folder = handoverFolder()

		expect(runRecord(snapshotCall({ cwd: root, folder }))).toEqual({
			exitCode: 0,
			output: summary({ copied: 3, deleted: 0, root, folder }),
		})
		expect(statSync(join(folder, 'round-1/run.sh')).mode & 0o111).toBe(0o111)
		expect(statSync(join(folder, 'round-1/tool.sh')).mode & 0o111).toBe(0o111)
		expect(statSync(join(folder, 'round-1/plain.ts')).mode & 0o111).toBe(0)
	})

	it('.dialecte/lot.json at the root and in a package → never part of the snapshot', () => {
		const root = createScratchRepository({ 'a.ts': 'a\n' })
		writeFiles({
			root,
			files: {
				'a.ts': 'a2\n',
				'.dialecte/lot.json': '{}\n',
				'packages/x/.dialecte/lot.json': '{}\n',
			},
		})
		const folder = handoverFolder()

		expect(runRecord(snapshotCall({ cwd: root, folder }))).toEqual({
			exitCode: 0,
			output: summary({ copied: 1, deleted: 0, root, folder }),
		})
		expect(listTree(join(folder, 'round-1'))).toEqual(['a.ts'])
	})

	it('round-1 taken → round-2 is taken beside it, against the same base', () => {
		const root = createScratchRepository({ 'a.ts': 'a\n' })
		writeFiles({ root, files: { 'a.ts': 'one\n' } })
		const folder = handoverFolder()

		expect(runRecord(snapshotCall({ cwd: root, folder, round: '1' }))).toEqual({
			exitCode: 0,
			output: summary({ round: 1, copied: 1, deleted: 0, root, folder }),
		})
		writeFiles({ root, files: { 'a.ts': 'two\n' } })

		expect(runRecord(snapshotCall({ cwd: root, folder, round: '2' }))).toEqual({
			exitCode: 0,
			output: summary({ round: 2, copied: 1, deleted: 0, root, folder }),
		})
		expect(readFileSync(join(folder, 'round-1/a.ts'), 'utf8')).toBe('one\n')
		expect(readFileSync(join(folder, 'round-2/a.ts'), 'utf8')).toBe('two\n')
	})

	for (const existing of ['round-1', 'round-1.deleted', 'round-1.base'])
		it(`${existing} exists already → refused, exit 1, nothing written or changed`, () => {
			const root = createScratchRepository({ 'a.ts': 'a\n' })
			writeFiles({ root, files: { 'a.ts': 'a2\n' } })
			const folder = handoverFolder()
			if (existing === 'round-1') mkdirSync(join(folder, existing))
			else writeFileSync(join(folder, existing), 'kept\n')

			expect(runRecord(snapshotCall({ cwd: root, folder }))).toEqual({
				exitCode: 1,
				output: expect.stringMatching(/^lot snapshot: /),
			})
			expect(readdirSync(folder)).toEqual([existing])
			if (existing === 'round-1') expect(readdirSync(join(folder, existing))).toEqual([])
			else expect(readFileSync(join(folder, existing), 'utf8')).toBe('kept\n')
		})

	it('an untracked nested repository → refused, exit 1, nothing written', () => {
		const root = createScratchRepository({ 'a.ts': 'a\n' })
		writeFiles({ root, files: { 'a.ts': 'a2\n' } })
		initializeRepository({ root: join(root, 'nested'), files: { 'inner.ts': 'inner\n' } })
		const folder = handoverFolder()

		expect(runRecord(snapshotCall({ cwd: root, folder }))).toEqual({
			exitCode: 1,
			output: expect.stringMatching(/^lot snapshot: .*nested\//),
		})
		expect(readdirSync(folder)).toEqual([])
	})

	it('cwd not in a git work tree → refused, exit 1, nothing written', () => {
		const cwd = realpathSync(temporaryFolder('dialecte-not-a-repository-'))
		const folder = handoverFolder()

		expect(runRecord(snapshotCall({ cwd, folder }))).toEqual({
			exitCode: 1,
			output: expect.stringMatching(/^lot snapshot: /),
		})
		expect(readdirSync(folder)).toEqual([])
	})

	it('a folder inside the repository → refused, exit 1, nothing written', () => {
		const root = createScratchRepository({ 'a.ts': 'a\n' })
		writeFiles({ root, files: { 'a.ts': 'a2\n' } })
		const top = git({ root, args: ['rev-parse', '--show-toplevel'] }).trim()
		const folder = join(root, 'handover')

		expect(runRecord(snapshotCall({ cwd: root, folder }))).toEqual({
			exitCode: 1,
			output: `lot snapshot: ${folder} is inside the repository ${top}: a hand-over folder stays outside every repository`,
		})
		expect(existsSync(folder)).toBe(false)
	})

	for (const round of ['0', '-1', '1.5', 'x', undefined])
		it(`--round ${round ?? '(missing)'} → a one-line usage, exit 2, nothing written`, () => {
			const root = createScratchRepository({ 'a.ts': 'a\n' })
			writeFiles({ root, files: { 'a.ts': 'a2\n' } })
			const folder = handoverFolder()

			expect(
				runRecord({
					cwd: root,
					argv: ['snapshot', folder, ...(round === undefined ? [] : ['--round', round])],
				}),
			).toEqual({ exitCode: 2, output: expect.stringMatching(/^lot snapshot[^\n]*$/) })
			expect(readdirSync(folder)).toEqual([])
		})
})

/** A repository holding a submodule `sub` (a gitlink at HEAD) checked out at its first commit. */
function repositoryWithSubmodule(): string {
	const root = createScratchRepository({ 'a.ts': 'a\n' })
	initializeRepository({ root: join(root, 'sub'), files: { 'inner.ts': 'inner\n' } })
	git({ root, args: ['add', 'sub'] })
	git({ root, args: ['commit', '-q', '-m', 'chore: submodule'] })
	return root
}

/** `text` with every regular-expression character escaped. */
function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

describe('dialecte record snapshot - round 1 fixes', { timeout: 60_000 }, () => {
	it("a folder inside a linked worktree's git folder → refused naming the git folder, exit 1, nothing written", () => {
		const parent = realpathSync(temporaryFolder('dialecte-snapshot-'))
		const main = initializeRepository({ root: join(parent, 'repo'), files: { 'a.ts': 'a\n' } })
		const lot = join(parent, 'lot')
		git({ root: main, args: ['worktree', 'add', '--quiet', '-b', 'feat-x', lot, 'main'] })
		writeFiles({ root: lot, files: { 'a.ts': 'a2\n' } })
		const lotGitFolder = git({ root: lot, args: ['rev-parse', '--absolute-git-dir'] }).trim()
		const folder = join(lotGitFolder, 'handover')

		expect(runRecord(snapshotCall({ cwd: lot, folder }))).toEqual({
			exitCode: 1,
			output: expect.stringMatching(
				new RegExp(
					`^lot snapshot: ${escapeRegExp(folder)} is inside the git folder (${escapeRegExp(lotGitFolder)}|${escapeRegExp(join(main, '.git'))}): a hand-over folder stays outside every repository$`,
				),
			),
		})
		expect(existsSync(folder)).toBe(false)
	})

	it('a folder inside <repo>/.git → refused naming the git folder, exit 1, nothing written', () => {
		const root = initializeRepository({
			root: join(realpathSync(temporaryFolder('dialecte-snapshot-')), 'repo'),
			files: { 'a.ts': 'a\n' },
		})
		writeFiles({ root, files: { 'a.ts': 'a2\n' } })
		const gitFolder = git({ root, args: ['rev-parse', '--absolute-git-dir'] }).trim()
		const folder = join(root, '.git', 'handover')

		expect(runRecord(snapshotCall({ cwd: root, folder }))).toEqual({
			exitCode: 1,
			output: `lot snapshot: ${folder} is inside the git folder ${gitFolder}: a hand-over folder stays outside every repository`,
		})
		expect(existsSync(folder)).toBe(false)
	})

	it('a submodule moved to another commit (status M sub) → refused naming it, exit 1, nothing written', () => {
		const root = repositoryWithSubmodule()
		writeFiles({ root, files: { 'sub/inner.ts': 'inner 2\n', 'a.ts': 'a2\n' } })
		git({ root: join(root, 'sub'), args: ['commit', '-q', '-am', 'chore: move'] })
		const folder = handoverFolder()

		expect(runRecord(snapshotCall({ cwd: root, folder }))).toEqual({
			exitCode: 1,
			output: expect.stringMatching(/^lot snapshot: .*\bsub\b/),
		})
		expect(readdirSync(folder)).toEqual([])
	})

	it('a submodule with changes inside it (not moved) → refused naming it, exit 1, nothing written', () => {
		const root = repositoryWithSubmodule()
		writeFiles({ root, files: { 'sub/inner.ts': 'dirty\n' } })
		const folder = handoverFolder()

		expect(runRecord(snapshotCall({ cwd: root, folder }))).toEqual({
			exitCode: 1,
			output: expect.stringMatching(/^lot snapshot: .*\bsub\b/),
		})
		expect(readdirSync(folder)).toEqual([])
	})

	it('a submodule folder removed (status D sub) → refused naming it, exit 1, nothing written (never in .deleted)', () => {
		const root = repositoryWithSubmodule()
		rmSync(join(root, 'sub'), { recursive: true, force: true })
		const folder = handoverFolder()

		expect(runRecord(snapshotCall({ cwd: root, folder }))).toEqual({
			exitCode: 1,
			output: expect.stringMatching(/^lot snapshot: .*\bsub\b/),
		})
		expect(readdirSync(folder)).toEqual([])
	})

	it('record snapshot --round 1 -- <folder> → the folder after -- is read as the folder', () => {
		const root = createScratchRepository({ 'a.ts': 'a\n' })
		writeFiles({ root, files: { 'a.ts': 'a2\n' } })
		const folder = handoverFolder()

		expect(runRecord({ cwd: root, argv: ['snapshot', '--round', '1', '--', folder] })).toEqual({
			exitCode: 0,
			output: summary({ copied: 1, deleted: 0, root, folder }),
		})
	})
})

describe('dialecte record snapshot - a submodule newly added', { timeout: 60_000 }, () => {
	for (const dirty of [false, true])
		it(`a submodule added to the index, not at HEAD (status ${dirty ? 'AM' : 'A '} sub) → refused naming it, exit 1, nothing written`, () => {
			const root = createScratchRepository({ 'a.ts': 'a\n' })
			initializeRepository({ root: join(root, 'sub'), files: { 'inner.ts': 'inner\n' } })
			git({ root, args: ['add', 'sub'] })
			writeFiles({
				root,
				files: { 'a.ts': 'a2\n', ...(dirty ? { 'sub/inner.ts': 'dirty\n' } : {}) },
			})
			const folder = handoverFolder()

			expect(runRecord(snapshotCall({ cwd: root, folder }))).toEqual({
				exitCode: 1,
				output: expect.stringMatching(/^lot snapshot: .*\bsub\b/),
			})
			expect(readdirSync(folder)).toEqual([])
		})
})
