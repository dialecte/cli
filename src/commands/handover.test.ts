import { spawn, spawnSync } from 'node:child_process'
import {
	chmodSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { createFakeClock } from '../../test/fake-clock.ts'
import {
	createScratchRepository,
	git,
	writeFiles,
	temporaryFolder,
} from '../../test/scratch-repository.ts'
import { isProcessAlive } from '../lib/process-alive.ts'
import { runHandover, runHandoverList, runHandoverRun } from './handover.ts'

import { describe, expect, it } from 'vitest'

import type { LotsFile } from '../lib/handover/handover.types.ts'

/**
 * Each case makes repositories and runs git (and npx, hooks, clones) dozens of times: on a loaded machine
 * that takes seconds, so the bound leaves room; it is never a measure of speed.
 */
const SCRATCH_REPOSITORY_TIMEOUT = 60_000

/** The cli's entry in the sources: Node runs it with its type stripping. */
const CLI_SOURCE = join(import.meta.dirname, '..', 'cli.ts')

/** Polls until `check` holds, failing after `bound` milliseconds (slack for a loaded machine). */
async function waitFor(params: { check: () => boolean; bound: number }): Promise<void> {
	const deadline = Date.now() + params.bound
	while (!params.check()) {
		if (Date.now() > deadline) throw new Error(`still waiting after ${params.bound} ms`)
		await new Promise((resolveWait) => setTimeout(resolveWait, 100))
	}
}

/** Kept out of the literals: `lot` followed by a number reads as a plan tag to `dialecte rules`. */
const LOT = 'lot'

/** The cli a hand-over names as its fallback: never run by these tests. */
const WRITER_CLI = '/opt/dialecte/dist/cli.js'

function headOf(root: string): string {
	return git({ root, args: ['rev-parse', 'HEAD'] }).trim()
}

/** A repository with two changed files and a lots file covering both. */
function prepare(
	params: {
		lots?: LotsFile['lots']
		files?: Record<string, string>
		overrides?: Partial<LotsFile>
		committed?: Record<string, string>
	} = {},
): {
	root: string
	lotsPath: string
	out: string
} {
	const root = createScratchRepository({
		'src/read.ts': 'export function read() {}\n',
		...params.committed,
	})
	writeFiles({
		root,
		files: params.files ?? {
			'src/read.ts': 'export function read() {\n\treturn 1\n}\n',
			'CHANGELOG.md': '# Changelog\n\n- read answers 1\n',
		},
	})
	const out = temporaryFolder('dialecte-handover-')
	const lotsPath = join(out, 'lots.json')
	const lotsFile: LotsFile = {
		repository: root,
		branch: 'main',
		head: headOf(root).slice(0, 7),
		gates: 'npm run check',
		lots: params.lots ?? [
			{ paths: ['src/'], message: 'feat(read): read answers one\n\nThe body.' },
			{ paths: ['CHANGELOG.md'], message: 'docs(changelog): read' },
		],
		...params.overrides,
	}
	writeFileSync(lotsPath, JSON.stringify(lotsFile))
	return { root, lotsPath, out }
}

function writeHandover(params: { lotsPath: string; argv?: string[] }) {
	return runHandover({ argv: [params.lotsPath, ...(params.argv ?? [])], cliPath: WRITER_CLI })
}

/** `handover run` on the folder, every line it printed kept. */
async function runFolder(params: {
	out: string
	argv?: string[]
	scratchRoot?: string
}): Promise<{ exitCode: number; lines: string[]; text: string }> {
	const lines: string[] = []
	const exitCode = await runHandoverRun({
		argv: [params.out, ...(params.argv ?? [])],
		write: (line) => lines.push(line),
		clock: createFakeClock(),
		colour: false,
		scratchRoot: params.scratchRoot ?? temporaryFolder('dialecte-scratch-root-'),
	})
	return { exitCode, lines, text: lines.join('\n') }
}

function subjectsOf(params: { root: string; count: number }): string[] {
	return git({ root: params.root, args: ['log', '--format=%s', `-${params.count}`] })
		.trim()
		.split('\n')
}

/** A pre-commit hook in `.husky/_`, as husky installs it: ignored by git, named by core.hooksPath. */
function installHook(params: { root: string; script: string }): void {
	const { root } = params
	writeFiles({ root, files: { '.gitignore': '.husky/_\nnode_modules\n' } })
	git({ root, args: ['add', '.gitignore'] })
	git({ root, args: ['commit', '-q', '-m', 'chore: ignore the hooks folder'] })
	mkdirSync(join(root, '.husky/_'), { recursive: true })
	writeFileSync(join(root, '.husky/_/pre-commit'), `#!/bin/sh\n${params.script}\n`)
	chmodSync(join(root, '.husky/_/pre-commit'), 0o755)
	git({ root, args: ['config', 'core.hooksPath', '.husky/_'] })
}

describe('handover (write)', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a changed file in no lot → refused, nothing written', () => {
		const { lotsPath, out } = prepare({
			lots: [{ paths: ['src/'], message: 'feat(read): read answers one' }],
		})

		const result = writeHandover({ lotsPath })

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain('changed file in no lot: CHANGELOG.md')
		expect(existsSync(join(out, 'commit.sh'))).toBe(false)
	})

	it('a lot message with a ticket tag → refused, nothing written', () => {
		const { lotsPath, out } = prepare({
			lots: [
				{ paths: ['src/'], message: `feat(read): read answers one (${'#'}3102)` },
				{ paths: ['CHANGELOG.md'], message: 'docs(changelog): read' },
			],
		})

		const result = writeHandover({ lotsPath })

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain(`message, line 1: ticket number \`${'#'}3102\``)
		expect(existsSync(join(out, 'commit.sh'))).toBe(false)
	})

	it('a plan tag in an eval prompt under skills/ → refused when the folder is written', () => {
		const { lotsPath } = prepare({
			files: { 'skills/demo/evals/case/prompt.md': `You implement ${'lot'} T5.\n` },
			lots: [{ paths: ['skills/'], message: 'feat(skills): an eval case' }],
		})

		const result = writeHandover({ lotsPath })

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain('skills/demo/evals/case/prompt.md:1: plan tag')
	})

	it('another branch, another HEAD and a staged file → each refused', () => {
		const { root, lotsPath } = prepare()
		git({ root, args: ['checkout', '-q', '-b', 'other'] })
		git({ root, args: ['add', 'CHANGELOG.md'] })

		const result = writeHandover({ lotsPath })

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain('expected branch main, the repository is on other')
		expect(result.output).toContain('something is staged already')
		git({ root, args: ['reset', '-q'] })
		git({ root, args: ['checkout', '-q', 'main'] })
		git({ root, args: ['commit', '-q', '--allow-empty', '-m', 'chore: moved'] })
		expect(writeHandover({ lotsPath }).output).toContain('expected HEAD')
	})

	it('core.hooksPath naming a folder that does not exist → refused, naming it and how to restore it', () => {
		const { root, lotsPath, out } = prepare()
		git({ root, args: ['config', 'core.hooksPath', '.husky/_'] })

		const result = writeHandover({ lotsPath })

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain(
			`core.hooksPath is .husky/_ but ${join(root, '.husky/_')} does not exist`,
		)
		expect(result.output).toContain('Restore it')
		expect(existsSync(join(out, 'commit.sh'))).toBe(false)
	})

	it('written → the folder holds lots.json, the snapshot and a commit.sh that only runs the cli; nothing per lot', () => {
		const { lotsPath, out } = prepare()

		expect(writeHandover({ lotsPath }).exitCode).toBe(0)

		expect(readdirSync(out).sort()).toEqual([
			'commit.sh',
			'files.deleted',
			'files.sha256',
			'files.txt',
			'lots.json',
			'lots.sha256',
		])
		const commands = readFileSync(join(out, 'commit.sh'), 'utf8')
			.split('\n')
			.filter((line) => line && !line.startsWith('#'))
		expect(commands.at(-1)).toBe('exec npx --no-install @dialecte/cli handover run "$HERE" "$@"')
		expect(commands).toContain('if [ -z "${BASH_VERSION:-}" ]; then exec bash "$0" "$@"; fi')
	})

	it('written → the card: repository, worktree, branch, HEAD, gates, each lot with files, +/- and subject, the cd and the command', () => {
		const { root, lotsPath, out } = prepare()

		const result = writeHandover({ lotsPath })

		expect(result.exitCode).toBe(0)
		const lines = result.output.split('\n')
		expect(lines[0]).toMatch(/^┌─ hand-over ─+┐$/)
		expect(lines).toEqual(
			expect.arrayContaining([
				expect.stringMatching(new RegExp(`^│ repository  ${root} +│$`)),
				expect.stringMatching(new RegExp(`^│ worktree    ${root} +│$`)),
				expect.stringMatching(/^│ branch      main +│$/),
				expect.stringMatching(/^│ HEAD        [0-9a-f]{12} +│$/),
				expect.stringMatching(/^│ gates       npm run check +│$/),
				expect.stringMatching(
					/^│ lots \(2\)    1  1 file  \+3 -1  pending  feat\(read\): read answers one +│$/,
				),
				expect.stringMatching(/^│ {13}2  1 file  \+3 -0  pending  docs\(changelog\): read +│$/),
			]),
		)
		expect(lines.filter((line) => line.startsWith('│')).map((line) => line.length)).toEqual(
			Array(8).fill(lines[0].length),
		)
		expect(lines.at(-1)).toBe(`cd '${out}' && bash commit.sh`)
	})

	it('--json → the same content as data', () => {
		const { root, lotsPath, out } = prepare()

		const result = writeHandover({ lotsPath, argv: ['--json'] })

		expect(JSON.parse(result.output)).toMatchObject({
			folder: out,
			repository: root,
			worktree: root,
			branch: 'main',
			gates: 'npm run check',
			lots: [
				{
					index: 1,
					fileCount: 1,
					insertions: 3,
					deletions: 1,
					subject: 'feat(read): read answers one',
				},
				{ index: 2, fileCount: 1, insertions: 3, deletions: 0, subject: 'docs(changelog): read' },
			],
			command: `cd '${out}' && bash commit.sh`,
		})
	})

	it('written already → refused without --rehash; --rehash after an edit → the run commits the edit', async () => {
		const { root, lotsPath, out } = prepare()
		expect(writeHandover({ lotsPath }).exitCode).toBe(0)
		writeFiles({ root, files: { 'src/read.ts': 'export function read() {\n\treturn 2\n}\n' } })

		expect(writeHandover({ lotsPath }).exitCode).toBe(2)
		expect(writeHandover({ lotsPath, argv: ['--rehash'] }).exitCode).toBe(0)
		const ran = await runFolder({ out })
		expect(ran.exitCode).toBe(0)
		expect(git({ root, args: ['show', 'HEAD~1:src/read.ts'] })).toContain('return 2')
	})

	it('the repository held by another hand-over → refused', () => {
		const { lotsPath } = prepare()
		expect(writeHandover({ lotsPath }).exitCode).toBe(0)
		const otherOut = temporaryFolder('dialecte-handover-')

		const result = writeHandover({ lotsPath, argv: ['--out', otherOut] })

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain('the repository is held by')
	})

	it('a multi-line gates text → comment lines of the script header, never run', () => {
		const { lotsPath, out } = prepare({
			overrides: { gates: 'npm run check (219 tests)\ntouch INJECTED\n# and more' },
		})

		expect(writeHandover({ lotsPath }).exitCode).toBe(0)
		const header = readFileSync(join(out, 'commit.sh'), 'utf8').split('\n').slice(1, 7)
		spawnSync('sh', [join(out, 'commit.sh')], { cwd: out, encoding: 'utf8' })

		expect(existsSync(join(out, 'INJECTED'))).toBe(false)
		expect(header.every((line) => line.startsWith('#'))).toBe(true)
	})

	it('an empty or too short head, or a branch on two lines → usage error, nothing written', () => {
		for (const overrides of [{ head: '' }, { head: 'abc' }, { branch: 'main\nmain' }]) {
			const { lotsPath, out } = prepare({ overrides })

			const result = writeHandover({ lotsPath })

			expect({ overrides, exitCode: result.exitCode }).toEqual({ overrides, exitCode: 2 })
			expect(existsSync(join(out, 'commit.sh'))).toBe(false)
		}
	})

	it('a colour in an svg → not a ticket number, the hand-over goes through', async () => {
		const { lotsPath, out } = prepare({
			files: {
				'doc/logo.svg': `<svg><rect fill="${'#'}123456"/></svg>\n`,
				'CHANGELOG.md': '# Changelog\n',
			},
			lots: [
				{ paths: ['doc/'], message: 'docs(logo): a logo' },
				{ paths: ['CHANGELOG.md'], message: 'docs(changelog): logo' },
			],
		})

		expect(writeHandover({ lotsPath }).exitCode).toBe(0)
		const ran = await runFolder({ out })
		expect(ran.exitCode).toBe(0)
	})
})

describe('commit.sh', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('run with sh in a repository installing the cli → it runs `handover run` on its own folder', () => {
		const { root, lotsPath, out } = prepare()
		const cli = join(root, 'node_modules/@dialecte/cli')
		writeFiles({
			root,
			files: {
				'.gitignore': 'node_modules\n',
				'node_modules/@dialecte/cli/package.json': JSON.stringify({
					name: '@dialecte/cli',
					bin: { dialecte: 'cli.js' },
				}),
				'node_modules/@dialecte/cli/cli.js': `#!/usr/bin/env node\nconsole.log('ARGS ' + process.argv.slice(2).join(' '))\n`,
			},
		})
		chmodSync(join(cli, 'cli.js'), 0o755)
		mkdirSync(join(root, 'node_modules/.bin'))
		spawnSync('ln', ['-s', '../@dialecte/cli/cli.js', join(root, 'node_modules/.bin/dialecte')])
		git({ root, args: ['add', '.gitignore'] })
		git({ root, args: ['commit', '-q', '-m', 'chore: ignore'] })
		writeFileSync(
			lotsPath,
			JSON.stringify({ ...JSON.parse(readFileSync(lotsPath, 'utf8')), head: headOf(root) }),
		)
		expect(writeHandover({ lotsPath }).exitCode).toBe(0)

		const result = spawnSync('sh', [join(out, 'commit.sh'), '--rehearse'], {
			cwd: out,
			encoding: 'utf8',
		})

		expect(result.stdout.trim().split('\n').at(-1)).toBe(`ARGS handover run ${out} --rehearse`)
	})

	it('no cli installed in the repository → one line naming the repository and the fix, exit 1', () => {
		const { root, lotsPath, out } = prepare()
		expect(writeHandover({ lotsPath }).exitCode).toBe(0)

		const result = spawnSync('sh', [join(out, 'commit.sh')], { cwd: out, encoding: 'utf8' })

		expect(result.status).toBe(1)
		expect(result.stderr.trim().split('\n')).toEqual([
			`>> no @dialecte/cli with \`handover run\` installed in ${root}: npm install --save-dev @dialecte/cli@latest there, or run: node '${WRITER_CLI}' handover run '${out}'`,
		])
		expect(git({ root, args: ['log', '--format=%s', '-1'] }).trim()).toBe('chore: start')
	})
})

describe('handover run', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('every guard green → one line each with its result and duration, then lot n/N, its commit and stat, the card; the lock released', async () => {
		const { root, lotsPath, out } = prepare()
		expect(writeHandover({ lotsPath }).exitCode).toBe(0)
		const lockPath = join(root, '.git', 'dialecte-handover.lock')
		expect(readFileSync(lockPath, 'utf8')).toBe(`${join(out, 'commit.sh')}\n`)

		const result = await runFolder({ out })

		expect(result.exitCode).toBe(0)
		expect(result.lines.slice(1, 11)).toEqual([
			`✓ repository  ${root}  0.0 s`,
			'✓ lots        2 lot(s) as reviewed  0.0 s',
			'✓ hooks       git hooks folder  0.0 s',
			'✓ branch      main  0.0 s',
			expect.stringMatching(/^✓ head        [0-9a-f]{12}  0\.0 s$/),
			'✓ index       empty  0.0 s',
			'✓ snapshot    2 file(s)  0.0 s',
			'✓ deleted     0 file(s) absent  0.0 s',
			'✓ outside     no other file changed  0.0 s',
			'✓ references  2 file(s), 2 message(s)  0.0 s',
		])
		expect(result.lines).toContain(`${LOT} 1/2  1 file(s)  feat(read): read answers one`)
		expect(result.lines).toContain(`${LOT} 2/2  1 file(s)  docs(changelog): read`)
		expect(result.text).toMatch(/^✓ [0-9a-f]{12} feat\(read\): read answers one {2}0\.0 s$/m)
		expect(result.text).toContain('src/read.ts | 4')
		expect(result.text).toContain('done: 2 commit(s) on main in 0.0 s. Nothing pushed.')
		expect(result.text).toMatch(/│ lots \(2\) +1 +1 file +\+3 -1 +[0-9a-f]{7} +feat\(read\)/)
		expect(subjectsOf({ root: root, count: 3 })).toEqual([
			'docs(changelog): read',
			'feat(read): read answers one',
			'chore: start',
		])
		expect(git({ root, args: ['log', '--format=%b', '-1', 'HEAD~1'] }).trim()).toBe('The body.')
		expect(git({ root, args: ['status', '--porcelain'] })).toBe('')
		expect(existsSync(lockPath)).toBe(false)
	})

	it('a file edited after the snapshot → refused at the snapshot guard, nothing committed', async () => {
		const { root, lotsPath, out } = prepare()
		expect(writeHandover({ lotsPath }).exitCode).toBe(0)
		const head = headOf(root)
		writeFiles({ root, files: { 'src/read.ts': 'export function read() {\n\treturn 2\n}\n' } })

		const result = await runFolder({ out })

		expect(result.exitCode).toBe(1)
		expect(result.text).toMatch(/^✗ snapshot +1 file\(s\) differ from the reviewed snapshot/m)
		expect(result.lines).toContain('    src/read.ts')
		expect(result.text).not.toContain(`${LOT} 1/2`)
		expect(headOf(root)).toBe(head)
	})

	it('a file changed outside the lots after the hand-over → refused, naming it', async () => {
		const { root, lotsPath, out } = prepare()
		expect(writeHandover({ lotsPath }).exitCode).toBe(0)
		writeFiles({ root, files: { 'src/other.ts': 'export function other() {}\n' } })

		const result = await runFolder({ out })

		expect(result.exitCode).toBe(1)
		expect(result.text).toMatch(/^✗ outside +1 file\(s\) changed outside the lots/m)
		expect(result.lines).toContain('    src/other.ts')
	})

	it('lots.json edited after the hand-over (a tag added to a message) → refused at the lots guard, before the first commit', async () => {
		const { root, lotsPath, out } = prepare()
		expect(writeHandover({ lotsPath }).exitCode).toBe(0)
		const head = headOf(root)
		const lotsFile = JSON.parse(readFileSync(lotsPath, 'utf8')) as LotsFile
		lotsFile.lots[1].message = `docs(changelog): read (${'#'}3102)`
		writeFileSync(lotsPath, JSON.stringify(lotsFile))

		const result = await runFolder({ out })

		expect(result.exitCode).toBe(1)
		expect(result.text).toMatch(
			/^✗ lots +lots\.json changed since the hand-over was written: `dialecte handover --rehash <lots\.json>` after a review/m,
		)
		expect(result.text).not.toContain('✓ index')
		expect(headOf(root)).toBe(head)
	})

	it('a run stopped after staging its next lot → refused at the index guard with the command that unstages it', async () => {
		const { root, lotsPath, out } = prepare()
		expect(writeHandover({ lotsPath }).exitCode).toBe(0)
		git({ root, args: ['add', 'src/read.ts'] })

		const result = await runFolder({ out })

		expect(result.exitCode).toBe(1)
		expect(result.text).toMatch(/^✗ index +1 file\(s\) staged already/m)
		expect(result.lines).toContain(
			`    the next lot's files, staged by a run that stopped: unstage them with  cd '${root}' && git reset -q -- 'src/read.ts'`,
		)
	})

	it('git add failing on a lot (index locked) → the lot reported not committed, exit 1, no exception', async () => {
		const { root, lotsPath, out } = prepare()
		expect(writeHandover({ lotsPath }).exitCode).toBe(0)
		writeFileSync(join(root, '.git', 'index.lock'), '')

		const result = await runFolder({ out })

		expect(result.exitCode).toBe(1)
		expect(result.text).toMatch(
			new RegExp(`^✗ ${LOT} 1 not committed: git add failed: .*index\\.lock`, 'm'),
		)
	})

	it('core.hooksPath folder removed after the hand-over → refused at the hooks guard', async () => {
		const { root, lotsPath, out } = prepare()
		installHook({ root, script: 'exit 0' })
		writeFileSync(
			lotsPath,
			JSON.stringify({ ...JSON.parse(readFileSync(lotsPath, 'utf8')), head: headOf(root) }),
		)
		expect(writeHandover({ lotsPath }).exitCode).toBe(0)
		rmSync(join(root, '.husky/_'), { recursive: true })

		const result = await runFolder({ out })

		expect(result.exitCode).toBe(1)
		expect(result.text).toMatch(/^✗ hooks +core\.hooksPath is \.husky\/_ but .* does not exist/m)
	})

	it('a hook printing lines → each streamed behind the prefix during its lot', async () => {
		const { root, lotsPath, out } = prepare()
		installHook({ root, script: 'echo "checking the staged files"; echo "all good" >&2' })
		writeFileSync(
			lotsPath,
			JSON.stringify({ ...JSON.parse(readFileSync(lotsPath, 'utf8')), head: headOf(root) }),
		)
		expect(writeHandover({ lotsPath }).exitCode).toBe(0)

		const result = await runFolder({ out })

		expect(result.exitCode).toBe(0)
		const lotLine = result.lines.indexOf(`${LOT} 1/2  1 file(s)  feat(read): read answers one`)
		expect(result.lines.slice(lotLine + 1, lotLine + 3).sort()).toEqual([
			'  │ all good',
			'  │ checking the staged files',
		])
	})

	it('the hook fails at the second lot → the first committed, the second unstaged, exit 1; the rerun resumes at the second', async () => {
		const { root, lotsPath, out } = prepare()
		installHook({
			root,
			script:
				'if git diff --cached --name-only | grep -q CHANGELOG; then echo "changelog refused"; exit 1; fi',
		})
		writeFileSync(
			lotsPath,
			JSON.stringify({ ...JSON.parse(readFileSync(lotsPath, 'utf8')), head: headOf(root) }),
		)
		expect(writeHandover({ lotsPath }).exitCode).toBe(0)

		const failed = await runFolder({ out })

		expect(failed.exitCode).toBe(1)
		expect(failed.lines).toContain('  │ changelog refused')
		expect(failed.text).toMatch(new RegExp(`^✗ ${LOT} 2 not committed: git commit exited 1`, 'm'))
		expect(subjectsOf({ root: root, count: 1 })).toEqual(['feat(read): read answers one'])
		expect(git({ root, args: ['diff', '--cached', '--name-only'] })).toBe('')

		writeFileSync(join(root, '.husky/_/pre-commit'), '#!/bin/sh\nexit 0\n')
		const resumed = await runFolder({ out })

		expect(resumed.exitCode).toBe(0)
		expect(resumed.text).toMatch(
			new RegExp(
				`^✓ head +[0-9a-f]{12}, 1 of 2 lot\\(s\\) committed already: resuming at ${LOT} 2`,
				'm',
			),
		)
		expect(resumed.text).not.toContain(`${LOT} 1/2`)
		expect(subjectsOf({ root: root, count: 4 })).toEqual([
			'docs(changelog): read',
			'feat(read): read answers one',
			'chore: ignore the hooks folder',
			'chore: start',
		])
	})

	it('a commit of someone else on top of the recorded HEAD → refused with what it found', async () => {
		const { root, lotsPath, out } = prepare()
		expect(writeHandover({ lotsPath }).exitCode).toBe(0)
		git({ root, args: ['commit', '-q', '--allow-empty', '-m', 'chore: something else'] })

		const result = await runFolder({ out })

		expect(result.exitCode).toBe(1)
		expect(result.text).toMatch(/^✗ head +something else is on top of [0-9a-f]{12}/m)
		expect(result.text).toMatch(
			new RegExp(`[0-9a-f]{12} chore: something else is not ${LOT} 1: another message`),
		)
		expect(result.text).toMatch(
			new RegExp(`^ {4}look: git -C '${root}' log --oneline [0-9a-f]{12}\\.\\.HEAD$`, 'm'),
		)
	})

	it('a deleted file in a lot → committed as a deletion', async () => {
		const { root, lotsPath, out } = prepare({
			files: { 'CHANGELOG.md': '# Changelog\n' },
			lots: [
				{ paths: ['src/read.ts'], message: 'refactor(read): read goes' },
				{ paths: ['CHANGELOG.md'], message: 'docs(changelog): read' },
			],
		})
		rmSync(join(root, 'src/read.ts'))

		expect(writeHandover({ lotsPath }).exitCode).toBe(0)
		const ran = await runFolder({ out })
		expect(ran.exitCode).toBe(0)
		expect(git({ root, args: ['ls-files', 'src'] })).toBe('')
	})

	it('a file name with accents → covered by its lot, committed', async () => {
		const { root, lotsPath, out } = prepare({
			files: { 'src/été.ts': 'export function summer() {}\n', 'CHANGELOG.md': '# Changelog\n' },
		})

		expect(writeHandover({ lotsPath }).exitCode).toBe(0)
		const ran = await runFolder({ out })
		expect(ran.exitCode).toBe(0)
		expect(git({ root, args: ['-c', 'core.quotePath=false', 'ls-files', 'src'] })).toContain(
			'src/été.ts',
		)
	})

	it('--probe → answers that this cli runs hand-overs, touches nothing', async () => {
		const lines: string[] = []

		const exitCode = await runHandoverRun({
			argv: ['--probe'],
			write: (line) => lines.push(line),
			clock: createFakeClock(),
			colour: false,
			scratchRoot: temporaryFolder('dialecte-scratch-root-'),
		})

		expect({ exitCode, lines }).toEqual({ exitCode: 0, lines: ['handover run'] })
	})
})

describe('handover run --rehearse', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('lots committed in a scratch clone with the hook on, the repository untouched, the clone removed', async () => {
		const { root, lotsPath, out } = prepare()
		installHook({ root, script: 'echo "hook in $(pwd)"; test -f src/read.ts' })
		writeFiles({ root, files: { 'node_modules/demo/index.js': 'module.exports = 1\n' } })
		writeFileSync(
			lotsPath,
			JSON.stringify({ ...JSON.parse(readFileSync(lotsPath, 'utf8')), head: headOf(root) }),
		)
		expect(writeHandover({ lotsPath }).exitCode).toBe(0)
		const head = headOf(root)
		const scratchRoot = temporaryFolder('dialecte-scratch-root-')

		const result = await runFolder({ out, argv: ['--rehearse'], scratchRoot })

		expect(result.exitCode).toBe(0)
		expect(result.text).toMatch(/^ {2}│ hook in .*dialecte-rehearse-/m)
		expect(result.text).toContain('rehearsed: 2 commit(s) on main')
		expect(result.text).toContain('removed the rehearsal clone')
		expect(headOf(root)).toBe(head)
		expect(
			git({ root, args: ['status', '--porcelain'] })
				.split('\n')
				.filter(Boolean)
				.sort(),
		).toEqual([' M src/read.ts', '?? CHANGELOG.md'])
		expect(existsSync(join(root, '.git', 'dialecte-handover.lock'))).toBe(true)
		expect(readdirSync(scratchRoot)).toEqual([])
	})

	it('--keep → the clone stays, with its node_modules copied (not linked) and both commits', async () => {
		const { root, lotsPath, out } = prepare()
		writeFiles({
			root,
			files: {
				'.gitignore': 'node_modules\n',
				'node_modules/demo/index.js': 'module.exports = 1\n',
			},
		})
		git({ root, args: ['add', '.gitignore'] })
		git({ root, args: ['commit', '-q', '-m', 'chore: ignore'] })
		writeFileSync(
			lotsPath,
			JSON.stringify({ ...JSON.parse(readFileSync(lotsPath, 'utf8')), head: headOf(root) }),
		)
		expect(writeHandover({ lotsPath }).exitCode).toBe(0)
		const scratchRoot = temporaryFolder('dialecte-scratch-root-')

		const result = await runFolder({ out, argv: ['--rehearse', '--keep'], scratchRoot })

		expect(result.exitCode).toBe(0)
		const [clone] = readdirSync(scratchRoot).map((name) => join(scratchRoot, name))
		expect(result.text).toContain(`kept the rehearsal clone: ${clone}`)
		expect(lstatSync(join(clone, 'node_modules')).isSymbolicLink()).toBe(false)
		expect(readFileSync(join(clone, 'node_modules/demo/index.js'), 'utf8')).toBe(
			'module.exports = 1\n',
		)
		expect(
			JSON.parse(readFileSync(join(clone, '.git', 'dialecte-rehearsal.json'), 'utf8')),
		).toMatchObject({
			pid: process.pid,
		})
		expect(subjectsOf({ root: clone, count: 2 })).toEqual([
			'docs(changelog): read',
			'feat(read): read answers one',
		])
	})
})

describe('handover run --rehearse, interrupted', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it("SIGINT while the hook runs → the clone removed and the hook's child killed", async () => {
		const { root, lotsPath, out } = prepare()
		const signals = temporaryFolder('dialecte-signals-')
		const childPidFile = join(signals, 'child.pid')
		installHook({ root, script: `sleep 60 & echo $! > '${childPidFile}'; wait` })
		writeFileSync(
			lotsPath,
			JSON.stringify({ ...JSON.parse(readFileSync(lotsPath, 'utf8')), head: headOf(root) }),
		)
		expect(writeHandover({ lotsPath }).exitCode).toBe(0)
		const scratchRoot = temporaryFolder('dialecte-scratch-root-')

		const run = spawn(process.execPath, [CLI_SOURCE, 'handover', 'run', out, '--rehearse'], {
			env: { ...process.env, TMPDIR: scratchRoot },
			stdio: 'ignore',
		})
		const exited = new Promise<number | null>((resolveExit) => run.on('exit', resolveExit))
		await waitFor({ check: () => existsSync(childPidFile), bound: 30_000 })
		const childPid = Number(readFileSync(childPidFile, 'utf8').trim())
		run.kill('SIGINT')
		const exitCode = await exited

		expect(exitCode).not.toBe(0)
		expect(
			readdirSync(scratchRoot).filter((name) => name.startsWith('dialecte-rehearse-')),
		).toEqual([])
		await waitFor({ check: () => !isProcessAlive(childPid), bound: 10_000 })
	})
})

describe('handover list', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('four hand-overs → pending, partly committed, committed and stale, one line each', async () => {
		const root = temporaryFolder('dialecte-plans-')
		const states: Record<string, string> = {}
		for (const name of ['pending', 'partly', 'committed', 'stale']) {
			const { root: repository, lotsPath } = prepare()
			const folder = join(root, name)
			mkdirSync(folder)
			expect(writeHandover({ lotsPath, argv: ['--out', folder] }).exitCode).toBe(0)
			if (name === 'committed') {
				const ran = await runFolder({ out: folder })
				expect(ran.exitCode).toBe(0)
			}
			if (name === 'partly') {
				git({ root: repository, args: ['add', 'src/read.ts'] })
				git({
					root: repository,
					args: ['commit', '-q', '-m', 'feat(read): read answers one\n\nThe body.'],
				})
			}
			if (name === 'stale')
				git({ root: repository, args: ['commit', '-q', '--allow-empty', '-m', 'chore: other'] })
			states[folder] = repository
		}

		const result = runHandoverList({ argv: ['--root', root], cwd: root, now: Date.now() })

		expect(result.exitCode).toBe(0)
		const lines = result.output.split('\n')
		expect(lines[0]).toMatch(/^folder +repository +worktree +branch +lots +age +state$/)
		expect(lines.slice(1).map((line) => line.split(/ {2,}/).at(-1))).toEqual([
			'committed',
			'partly committed',
			'pending',
			'stale: HEAD moved by something else',
		])
		expect(lines[1]).toContain(states[join(root, 'committed')])
	})

	it('a folder with a hand-written commit script and no lots.json → listed as legacy, state unknown', () => {
		const root = temporaryFolder('dialecte-plans-')
		mkdirSync(join(root, 'old-topic'))
		writeFileSync(join(root, 'old-topic', 'commit-lot-05.sh'), '#!/bin/sh\ngit commit -m x\n')

		const result = runHandoverList({ argv: ['--root', root], cwd: root, now: Date.now() })

		expect(result.output.split('\n')[1]).toMatch(
			new RegExp(`^${join(root, 'old-topic')} .* legacy script, state unknown$`),
		)
	})
})
