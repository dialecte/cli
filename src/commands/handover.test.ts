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
import { createFakeTerminal } from '../../test/fake-terminal.ts'
import {
	createScratchRepository,
	git,
	writeFiles,
	temporaryFolder,
} from '../../test/scratch-repository.ts'
import { isProcessAlive } from '../lib/process-alive.ts'
import { runHandover, runHandoverList, runHandoverRun } from './handover.ts'

import { describe, expect, it, onTestFinished } from 'vitest'

import type { LotsFile } from '../lib/handover/handover.types.ts'
import type { Clock } from '../lib/progress/clock.types.ts'
import type { LiveOutput } from '../lib/progress/step-progress.types.ts'

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

function writeHandover(params: {
	lotsPath: string
	argv?: string[]
	columns?: number
	probeTimeout?: number
}) {
	return runHandover({
		argv: [params.lotsPath, ...(params.argv ?? [])],
		cliPath: WRITER_CLI,
		columns: params.columns,
		probeTimeout: params.probeTimeout,
	})
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

/** The lines of the card's tdd row, without the box and the label. */
function tddRowLines(output: string): string[] {
	const lines = output.split('\n')
	const first = lines.findIndex((line) => line.startsWith('│ tdd '))
	if (first < 0) return []
	const rest = lines.slice(first + 1)
	const end = rest.findIndex((line) => !/^│ {13}\S/.test(line))
	return [lines[first], ...rest.slice(0, end < 0 ? rest.length : end)].map((line) =>
		line.slice('│ tdd         '.length).replace(/ *│$/, ''),
	)
}

/** A ledger of receipts of `src/read.test.ts`, each with its kind, name and reason. */
function writeLedger(params: {
	root: string
	receipts: Array<{ kind: string; name: string; reason: string }>
}): void {
	writeFileSync(
		join(params.root, '.git', 'dialecte-tdd.json'),
		JSON.stringify({
			version: 3,
			entries: params.receipts.map((receipt) => ({
				...receipt,
				file: 'src/read.test.ts',
				project: '',
				testFileHash: 'h',
				caseHash: 'c',
				productionHash: 'p',
				at: '2026-10-29T12:00:00.000Z',
			})),
		}),
	)
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
		expect(lines.at(-1)).toBe(`node '${WRITER_CLI}' handover run '${out}'`)
	})

	it('the lot file .dialecte/lot.json in no lot → not refused; a lot declared exempt from the receipts → on the card', () => {
		const { root, lotsPath } = prepare()
		writeFiles({
			root,
			files: { '.dialecte/lot.json': JSON.stringify({ tdd: 'exempt: a rename only' }) },
		})

		const result = writeHandover({ lotsPath })

		expect(result.exitCode).toBe(0)
		expect(result.output.split('\n')).toEqual(
			expect.arrayContaining([
				expect.stringMatching(
					/^│ tdd {9}exempt: a rename only \(2 production file\(s\), 0 test file\(s\) changed\) +│$/,
				),
			]),
		)
	})

	/** A ledger of `count` red receipts of distinct cases, each carrying `flags`. */
	function flaggedLedger(params: { count: number; flags: string[] }): string {
		return JSON.stringify({
			version: 3,
			entries: Array.from({ length: params.count }, (_unused, index) => ({
				kind: 'red',
				file: 'src/read.test.ts',
				name: `read > answers ${index}`,
				project: '',
				testFileHash: 'h',
				caseHash: 'c',
				productionHash: 'p',
				flags: params.flags,
				at: '2026-10-29T12:00:00.000Z',
			})),
		})
	}

	it('57 cases flagged with one kind → the card says the count and where the list is, no line per case', () => {
		const { root, lotsPath } = prepare()
		writeFileSync(
			join(root, '.git', 'dialecte-tdd.json'),
			flaggedLedger({ count: 57, flags: ['test code changed around it'] }),
		)

		const lines = writeHandover({ lotsPath }).output.split('\n')

		expect(lines).toEqual(
			expect.arrayContaining([
				expect.stringMatching(
					/^│ tdd {9}57 flags: test code changed around it - dialecte tdd status --flags for the list +│$/,
				),
			]),
		)
		expect(lines.filter((line) => line.includes('flag: src/'))).toEqual([])
	})

	it('flags of two kinds → each kind with its count in the tdd row, still no line per case', () => {
		const { root, lotsPath } = prepare()
		writeFileSync(
			join(root, '.git', 'dialecte-tdd.json'),
			flaggedLedger({ count: 3, flags: ['rollback', 'red after green'] }),
		)

		const output = writeHandover({ lotsPath }).output

		expect(output).toMatch(/rollback[^\n]*3|3[^\n]*rollback/)
		expect(output).toMatch(/red after green[^\n]*3|3[^\n]*red after green/)
		expect(output).toContain('dialecte tdd status --flags')
		expect(output.split('\n').filter((line) => line.includes('flag: src/'))).toEqual([])
	})

	it('a case the lot accepts and a red run accepted → on the card with its reason', () => {
		const { root, lotsPath } = prepare()
		writeFiles({
			root,
			files: {
				'.dialecte/lot.json': JSON.stringify({
					accept: [
						{ case: 'src/read.test.ts::read > answers one', reason: 'pins existing behaviour' },
					],
				}),
			},
		})
		writeFileSync(
			join(root, '.git', 'dialecte-tdd.json'),
			JSON.stringify({
				version: 3,
				entries: [
					{
						kind: 'accepted',
						file: 'src/read.test.ts',
						name: 'read > answers one',
						project: '',
						testFileHash: 'h',
						caseHash: 'c',
						productionHash: 'p',
						reason: 'pins existing behaviour',
						at: '2026-10-29T12:00:00.000Z',
					},
				],
			}),
		)

		expect(writeHandover({ lotsPath }).output.split('\n')).toEqual(
			expect.arrayContaining([
				expect.stringMatching(
					/^│ tdd {9}accepted: src\/read\.test\.ts::read > answers one \(pins existing behaviour\) +│$/,
				),
			]),
		)
	})

	it('a case revised at review and a red run recorded it → on the card with its reason', () => {
		const { root, lotsPath } = prepare()
		writeFiles({
			root,
			files: {
				'.dialecte/lot.json': JSON.stringify({
					revised: [
						{ case: 'src/read.test.ts::read > answers one', reason: 'the review asked for it' },
					],
				}),
			},
		})
		writeFileSync(
			join(root, '.git', 'dialecte-tdd.json'),
			JSON.stringify({
				version: 3,
				entries: [
					{
						kind: 'revised',
						file: 'src/read.test.ts',
						name: 'read > answers one',
						project: '',
						testFileHash: 'h',
						caseHash: 'c',
						productionHash: 'p',
						reason: 'the review asked for it',
						at: '2026-10-30T12:00:00.000Z',
					},
				],
			}),
		)

		expect(writeHandover({ lotsPath }).output.split('\n')).toEqual(
			expect.arrayContaining([
				expect.stringMatching(
					/^│ tdd {9}revised: src\/read\.test\.ts::read > answers one \(the review asked for it\) +│$/,
				),
			]),
		)
	})

	it("receipts of earlier lots → folded into one count line per kind, a case counted once; a receipt the lot file names listed with the file's reason; an unused entry still listed", () => {
		const { root, lotsPath } = prepare()
		writeFiles({
			root,
			files: {
				'.dialecte/lot.json': JSON.stringify({
					accept: [
						{ case: 'src/read.test.ts::read > answers one', reason: 'pins existing behaviour' },
						{ case: 'src/read.test.ts::read > unused', reason: 'never run' },
					],
				}),
			},
		})
		writeLedger({
			root,
			receipts: [
				{ kind: 'accepted', name: 'read > answers one', reason: 'the reason the red run saw' },
				{ kind: 'accepted', name: 'read > earlier one', reason: 'an earlier lot' },
				{ kind: 'accepted', name: 'read > earlier one', reason: 'an earlier lot, run again' },
				{ kind: 'accepted', name: 'read > earlier two', reason: 'an earlier lot' },
				{ kind: 'revised', name: 'read > earlier three', reason: 'an earlier review' },
			],
		})

		expect(tddRowLines(writeHandover({ lotsPath }).output).sort()).toEqual(
			[
				'accepted: src/read.test.ts::read > answers one (pins existing behaviour)',
				'earlier lots: 2 accepted, 1 revised (not in the lot file)',
				'accept unused: src/read.test.ts::read > unused (never run): no receipt of that case',
			].sort(),
		)
	})

	it("a revised receipt whose file a glob entry of the lot file matches → listed with the entry's reason, the entry not unused, nothing folded", () => {
		const { root, lotsPath } = prepare()
		writeFiles({
			root,
			files: {
				'.dialecte/lot.json': JSON.stringify({
					revised: [{ case: 'src/**/*.test.ts', reason: 'the loops were merged' }],
				}),
			},
		})
		writeLedger({
			root,
			receipts: [
				{ kind: 'revised', name: 'read > answers one', reason: 'the reason the red run saw' },
			],
		})

		expect(tddRowLines(writeHandover({ lotsPath }).output)).toEqual([
			'revised: src/read.test.ts::read > answers one (the loops were merged)',
		])
	})

	it('a gone entry of the lot file → on the card as gone: <file> (<reason>)', () => {
		const { root, lotsPath } = prepare()
		writeFiles({
			root,
			files: {
				'.dialecte/lot.json': JSON.stringify({
					gone: [{ file: 'src/read.test.ts', reason: 'the table call was rewritten' }],
				}),
			},
		})

		expect(tddRowLines(writeHandover({ lotsPath }).output)).toEqual([
			'gone: src/read.test.ts (the table call was rewritten)',
		])
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
			command: `node '${WRITER_CLI}' handover run '${out}'`,
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
		expect(result.lines).toContain(`▶ ${LOT} 1/2  1 file(s)  feat(read): read answers one`)
		expect(result.lines).toContain(`▶ ${LOT} 2/2  1 file(s)  docs(changelog): read`)
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
		const lotLine = result.lines.indexOf(`▶ ${LOT} 1/2  1 file(s)  feat(read): read answers one`)
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

	it('a lot deleting every file of a folder → the folder is gone in the clone too, a hook asserting its absence commits', async () => {
		const { root, lotsPath, out } = prepare({
			committed: {
				'src/legacy/a.ts': 'export const A = 1\n',
				'src/legacy/deep/b.ts': 'export const B = 1\n',
			},
			files: { 'src/read.ts': 'export function read() {\n\treturn 1\n}\n' },
			lots: [{ paths: ['src/'], message: 'refactor(read): drop the legacy folder' }],
		})
		rmSync(join(root, 'src/legacy'), { recursive: true })
		installHook({ root, script: 'test ! -e src/legacy' })
		writeFileSync(
			lotsPath,
			JSON.stringify({ ...JSON.parse(readFileSync(lotsPath, 'utf8')), head: headOf(root) }),
		)
		expect(writeHandover({ lotsPath }).exitCode).toBe(0)

		const result = await runFolder({ out, argv: ['--rehearse'] })

		expect(result.exitCode).toBe(0)
		expect(result.text).toContain('rehearsed: 1 commit(s) on main')
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

describe(
	'handover run --rehearse, interrupted, a hook ignoring TERM',
	{
		timeout: SCRATCH_REPOSITORY_TIMEOUT,
	},
	() => {
		it('SIGINT while the hook runs → every hook process is dead afterwards and the clone is removed', async () => {
			const { root, lotsPath, out } = prepare()
			const signals = temporaryFolder('dialecte-signals-')
			const pidFile = join(signals, 'sleep.pid')
			installHook({
				root,
				script: `trap "" TERM; echo $$ > '${pidFile}.hook'; sleep 60 & echo $! > '${pidFile}'; wait`,
			})
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
			await waitFor({ check: () => existsSync(pidFile), bound: 30_000 })
			const pids = [pidFile, `${pidFile}.hook`].map((file) =>
				Number(readFileSync(file, 'utf8').trim()),
			)
			run.kill('SIGINT')
			await exited
			await new Promise((resolve) => setTimeout(resolve, 3_000))
			const alive = pids.filter(isProcessAlive)
			for (const pid of alive) process.kill(pid, 'SIGKILL')

			expect(alive).toEqual([])
			expect(
				readdirSync(scratchRoot).filter((name) => name.startsWith('dialecte-rehearse-')),
			).toEqual([])
		})
	},
)

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

/** A pre-commit hook script, a lot holding every changed file, the lots file rewritten at the hook commit. */
function prepareWithHook(script: string): { root: string; out: string } {
	const { root, lotsPath, out } = prepare({
		lots: [{ paths: ['src/', 'CHANGELOG.md'], message: 'feat(read): read answers one' }],
	})
	installHook({ root, script })
	writeFileSync(
		lotsPath,
		JSON.stringify({ ...JSON.parse(readFileSync(lotsPath, 'utf8')), head: headOf(root) }),
	)
	expect(writeHandover({ lotsPath }).exitCode).toBe(0)
	return { root, out }
}

const SPINNER_LINE = /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] /

describe(
	'handover run: a running step looks running',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('off a terminal → the lot start line is written before its hook runs, and comes before its commit line', async () => {
			const { root, out } = prepareWithHook('touch "$(git rev-parse --show-toplevel)/hook-ran"')
			const lines: { line: string; hookBegan: boolean }[] = []
			function record(line: string): void {
				lines.push({ line, hookBegan: existsSync(join(root, 'hook-ran')) })
			}

			const exitCode = await runHandoverRun({
				argv: [out],
				write: record,
				clock: createFakeClock(),
				colour: false,
				scratchRoot: temporaryFolder('dialecte-scratch-root-'),
				live: { tty: false, writeLine: record, rewriteLines: () => undefined },
			})

			const texts = lines.map((entry) => entry.line)
			const start = texts.indexOf(`▶ ${LOT} 1/1  2 file(s)  feat(read): read answers one`)
			expect(exitCode).toBe(0)
			expect(start).toBeGreaterThan(-1)
			expect(lines[start].hookBegan).toBe(false)
			expect(texts.findIndex((line) => /^✓ [0-9a-f]{12} feat\(read\)/.test(line))).toBeGreaterThan(
				start,
			)
		})

		it('on a terminal → a spinner line names the lot while its hook runs, the commit line replaces it, no start line, no spinner left', async () => {
			const { out } = prepareWithHook('true')
			const terminal = createFakeTerminal({ tty: true })

			const exitCode = await runHandoverRun({
				argv: [out],
				write: terminal.output.writeLine,
				clock: createFakeClock(),
				colour: false,
				scratchRoot: temporaryFolder('dialecte-scratch-root-'),
				live: terminal.output,
			})

			expect(exitCode).toBe(0)
			expect(terminal.rewrites.map((region) => region[0])).toEqual(
				expect.arrayContaining([
					expect.stringMatching(
						new RegExp(`^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] ${LOT} 1/1 .*feat\\(read\\): read answers one - .* 0\\.0 s$`),
					),
				]),
			)
			expect(terminal.screen().some((line) => line.startsWith('▶'))).toBe(false)
			expect(terminal.screen().some((line) => SPINNER_LINE.test(line))).toBe(false)
			expect(terminal.screen().some((line) => /^✓ [0-9a-f]{12} feat\(read\)/.test(line))).toBe(true)
		})

		it('a rehearsal → the clone step is announced before the clone is prepared', async () => {
			const { out } = prepareWithHook('true')

			const result = await runFolder({ out, argv: ['--rehearse'] })

			const start = result.lines.indexOf('▶ rehearsal clone')
			expect(start).toBeGreaterThan(-1)
			expect(start).toBeLessThan(
				result.lines.findIndex((line) => line.startsWith('  working tree:')),
			)
		})
	},
)

describe('handover run: the card after a run', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('the HEAD line shows the base and the new tip', async () => {
		const { root, out } = prepareWithHook('true')
		const base = headOf(root)

		const result = await runFolder({ out })

		const tip = headOf(root)
		expect(result.text).toMatch(new RegExp(`│ HEAD +${base.slice(0, 12)} → ${tip.slice(0, 12)} +│`))
	})

	it('a repository whose own cli lacks handover run → the run line is node <this cli> handover run <dir>; one with it keeps bash commit.sh', () => {
		const lacking = prepare()
		const having = prepare()
		const cli = join(having.root, 'node_modules/@dialecte/cli')
		writeFiles({
			root: having.root,
			files: {
				'.gitignore': 'node_modules\n',
				'node_modules/@dialecte/cli/package.json': JSON.stringify({
					name: '@dialecte/cli',
					bin: { dialecte: 'cli.js' },
				}),
				'node_modules/@dialecte/cli/cli.js': `#!/usr/bin/env node\nconsole.log('handover run')\n`,
			},
		})
		chmodSync(join(cli, 'cli.js'), 0o755)
		mkdirSync(join(having.root, 'node_modules/.bin'))
		spawnSync('ln', [
			'-s',
			'../@dialecte/cli/cli.js',
			join(having.root, 'node_modules/.bin/dialecte'),
		])
		git({ root: having.root, args: ['add', '.gitignore'] })
		git({ root: having.root, args: ['commit', '-q', '-m', 'chore: ignore'] })
		writeFileSync(
			having.lotsPath,
			JSON.stringify({
				...JSON.parse(readFileSync(having.lotsPath, 'utf8')),
				head: headOf(having.root),
			}),
		)

		const lackingCard = writeHandover({ lotsPath: lacking.lotsPath }).output.split('\n').at(-1)
		const havingCard = writeHandover({ lotsPath: having.lotsPath }).output.split('\n').at(-1)

		expect(lackingCard).toBe(`node '${WRITER_CLI}' handover run '${lacking.out}'`)
		expect(havingCard).toBe(`cd '${having.out}' && bash commit.sh`)
	})
})

const HOOK_LINES = Array.from({ length: 30 }, (_unused, index) => `line ${index + 1}`)
const PRINT_30_LINES = 'i=1; while [ $i -le 30 ]; do echo "line $i"; i=$((i+1)); done'
const SPINNER = /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] /

/** `handover run` of the folder through the given live output (every line goes to its writeLine too). */
function runLive(params: {
	out: string
	live: LiveOutput
	write?: (line: string) => void
	clock?: Clock
}): Promise<number> {
	return runHandoverRun({
		argv: [params.out],
		write: params.write ?? params.live.writeLine,
		clock: params.clock ?? createFakeClock(),
		colour: false,
		scratchRoot: temporaryFolder('dialecte-scratch-root-'),
		live: params.live,
	})
}

describe(
	'handover run: hook output is never buffered',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('off a terminal, a hook succeeding → each line streams as it comes (the hook waits for the first one to be seen), then the full log path; the log holds every line', async () => {
			const flag = join(temporaryFolder('dialecte-flag-'), 'seen')
			const { out } = prepareWithHook(
				`echo "line 1"; i=0; while [ ! -f '${flag}' ] && [ $i -lt 100 ]; do sleep 0.1; i=$((i+1)); done; [ -f '${flag}' ] || exit 1; i=2; while [ $i -le 30 ]; do echo "line $i"; i=$((i+1)); done`,
			)
			const written: string[] = []
			function record(line: string): void {
				written.push(line)
				if (line === '  │ line 1') writeFileSync(flag, '1')
			}

			const exitCode = await runLive({
				out,
				write: record,
				live: { tty: false, writeLine: record, rewriteLines: () => undefined },
			})

			const hookLines = written.filter((line) => /^ {2}│ line \d+$/.test(line))
			const logLine = written.findIndex((line) => /full log: \//.test(line))
			const logPath = /full log: (\/\S+)/.exec(written[logLine] ?? '')?.[1] ?? ''
			expect(exitCode).toBe(0)
			expect(hookLines).toEqual(HOOK_LINES.map((line) => `  │ ${line}`))
			expect(logLine).toBeGreaterThan(written.indexOf('  │ line 30'))
			expect(readFileSync(logPath, 'utf8').split('\n')).toEqual(expect.arrayContaining(HOOK_LINES))
		})

		it('on a terminal, a hook succeeding → its last 20 lines show live under the spinner; afterwards no hook line is kept, one collapsed line with the log path sits before the commit line', async () => {
			const flag = join(temporaryFolder('dialecte-flag-'), 'seen')
			const { out } = prepareWithHook(
				`echo "line 1"; i=0; while [ ! -f '${flag}' ] && [ $i -lt 100 ]; do sleep 0.1; i=$((i+1)); done; [ -f '${flag}' ] || exit 1; i=2; while [ $i -le 30 ]; do echo "line $i"; i=$((i+1)); done`,
			)
			const terminal = createFakeTerminal({ tty: true })
			const draw = terminal.output.rewriteLines
			const live: LiveOutput = {
				...terminal.output,
				rewriteLines(lines) {
					draw(lines)
					if (lines.includes('  │ line 1')) writeFileSync(flag, '1')
				},
			}

			const exitCode = await runLive({ out, live, write: terminal.output.writeLine })

			const screen = terminal.screen()
			const collapsed = screen.findIndex((line) =>
				/30 line\(s\) of hook output; full log: \//.test(line),
			)
			const logPath = /full log: (\/\S+)/.exec(screen[collapsed] ?? '')?.[1] ?? ''
			expect(exitCode).toBe(0)
			expect(terminal.rewrites.some((region) => region.includes('  │ line 30'))).toBe(true)
			expect(
				terminal.rewrites.every((region) => region.length <= 21 && SPINNER.test(region[0])),
			).toBe(true)
			expect(terminal.written.filter((line) => /^ {2}│ line \d+$/.test(line))).toEqual([])
			expect(screen[collapsed + 1]).toMatch(/^✓ [0-9a-f]{12} feat\(read\)/)
			expect(readFileSync(logPath, 'utf8').split('\n')).toEqual(expect.arrayContaining(HOOK_LINES))
		})

		it('on a terminal, a hook failing → every line ends in the written lines, with the full log path', async () => {
			const { out } = prepareWithHook(`${PRINT_30_LINES}; exit 1`)
			const terminal = createFakeTerminal({ tty: true })

			const exitCode = await runLive({ out, live: terminal.output })

			expect(exitCode).toBe(1)
			expect(terminal.written.filter((line) => /^ {2}│ line \d+$/.test(line))).toEqual(
				HOOK_LINES.map((line) => `  │ ${line}`),
			)
			expect(terminal.written.some((line) => /full log: \//.test(line))).toBe(true)
			expect(terminal.screen().some((line) => SPINNER.test(line))).toBe(false)
		})

		it('off a terminal, a hook failing → every line is shown, and the full log path too', async () => {
			const { out } = prepareWithHook(`${PRINT_30_LINES}; exit 1`)
			const written: string[] = []
			function record(line: string): void {
				written.push(line)
			}

			const exitCode = await runLive({
				out,
				write: record,
				live: { tty: false, writeLine: record, rewriteLines: () => undefined },
			})

			expect(exitCode).toBe(1)
			expect(written.filter((line) => /^ {2}│ line \d+$/.test(line))).toEqual(
				HOOK_LINES.map((line) => `  │ ${line}`),
			)
			expect(written.some((line) => /full log: \//.test(line))).toBe(true)
		})
	},
)

describe('handover: the card width', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	const LONG_GATES =
		'npm run type-check && npm run lint:check && npm run format:check && npm run test:run'

	function cardLines(output: string): string[] {
		return output.split('\n').filter((line) => /^[┌│└]/.test(line))
	}

	it('an injected width of 40 → no card line is wider; no width (not a terminal) → the card is not wrapped', () => {
		const wrapped = prepare({ overrides: { gates: LONG_GATES } })
		const plain = prepare({ overrides: { gates: LONG_GATES } })

		const narrow = writeHandover({ lotsPath: wrapped.lotsPath, columns: 40 })
		const unbounded = writeHandover({ lotsPath: plain.lotsPath })

		expect(cardLines(narrow.output).filter((line) => line.length > 40)).toEqual([])
		expect(cardLines(unbounded.output).some((line) => line.includes(LONG_GATES))).toBe(true)
	})

	for (const columns of [40, 100])
		it(`a width of ${columns} → the run command stays whole on one line (copyable), outside the wrapped box`, () => {
			const { lotsPath, out } = prepare({ overrides: { gates: LONG_GATES } })

			const result = writeHandover({ lotsPath, columns })

			const command = `node '${WRITER_CLI}' handover run '${out}'`
			expect(command.length).toBeGreaterThan(columns)
			expect(result.output.split('\n')).toContain(command)
			expect(cardLines(result.output).filter((line) => line.length > columns)).toEqual([])
		})
})

describe(
	'handover run --rehearse: untracked files a hook could read',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('an untracked .dialecte/lot.json outside the exclude list → a warning naming it; excluded → none', async () => {
			const ignored = { '.gitignore': 'node_modules\n' }
			const open = prepare({ committed: ignored })
			writeFiles({
				root: open.root,
				files: { '.dialecte/lot.json': '{}\n', 'node_modules/x': 'x\n' },
			})
			const excluded = prepare({ committed: ignored })
			writeFiles({
				root: excluded.root,
				files: { '.dialecte/lot.json': '{}\n', 'node_modules/x': 'x\n' },
			})
			writeFileSync(join(excluded.root, '.git', 'info', 'exclude'), '.dialecte/\n')
			expect(writeHandover({ lotsPath: open.lotsPath }).exitCode).toBe(0)
			expect(writeHandover({ lotsPath: excluded.lotsPath }).exitCode).toBe(0)

			const warned = await runFolder({ out: open.out, argv: ['--rehearse'] })
			const quiet = await runFolder({ out: excluded.out, argv: ['--rehearse'] })

			const warning = warned.lines.find((line) => line.startsWith('warning:')) ?? ''
			expect(warning).toMatch(/^warning: .*\.dialecte\/lot\.json/)
			expect(warning).not.toMatch(/CHANGELOG\.md|src\/read\.ts|node_modules/)
			expect(quiet.lines.some((line) => line.startsWith('warning:'))).toBe(false)
		})
	},
)

describe(
	'handover run: the card after a run on a narrow terminal',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('a width of 40 → the box wraps, and the run command stays whole on one line outside it', async () => {
			const { root, lotsPath, out } = prepare()
			installHook({
				root,
				script: 'git diff --cached --name-only | grep -q CHANGELOG.md && exit 1\nexit 0',
			})
			writeFileSync(
				lotsPath,
				JSON.stringify({ ...JSON.parse(readFileSync(lotsPath, 'utf8')), head: headOf(root) }),
			)
			expect(writeHandover({ lotsPath }).exitCode).toBe(0)
			const terminal = createFakeTerminal({ tty: true, columns: 40 })

			const exitCode = await runLive({ out, live: terminal.output })

			const lines = terminal.screen().flatMap((line) => line.split('\n'))
			const box = lines.filter((line) => /^[┌│└]/.test(line))
			expect(exitCode).toBe(1)
			expect(box.filter((line) => line.length > 40)).toEqual([])
			expect(lines.some((line) => line.includes("handover run '") && line.length > 40)).toBe(true)
		})
	},
)

describe(
	'handover run: a silent hook off a terminal',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('after 90 s of silence on the clock → the running line carries the hint, once', async () => {
			const flag = join(temporaryFolder('dialecte-flag-'), 'go')
			const { out } = prepareWithHook(
				`i=0; while [ ! -f '${flag}' ] && [ $i -lt 100 ]; do sleep 0.1; i=$((i+1)); done; [ -f '${flag}' ] || exit 1`,
			)
			const clock = createFakeClock()
			const written: string[] = []
			function record(line: string): void {
				written.push(line)
			}

			const running = runLive({
				out,
				write: record,
				clock,
				live: { tty: false, writeLine: record, rewriteLines: () => undefined },
			})
			await clock.whenPending(1)
			clock.advance(95_000)
			clock.advance(120_000)
			writeFileSync(flag, '1')
			const exitCode = await running

			expect(exitCode).toBe(0)
			expect(
				written.filter((line) => line.includes('silent for 1 m 30 s: is it waiting for input')),
			).toHaveLength(1)
		})
	},
)

describe(
	'handover run: a silent hook on a terminal',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('before the silence threshold the spinner has no hint; after it, the spinner carries the waiting-for-input / watch-mode hint', async () => {
			const flag = join(temporaryFolder('dialecte-flag-'), 'go')
			const { out } = prepareWithHook(
				`i=0; while [ ! -f '${flag}' ] && [ $i -lt 100 ]; do sleep 0.1; i=$((i+1)); done; [ -f '${flag}' ] || exit 1`,
			)
			const clock = createFakeClock()
			const terminal = createFakeTerminal({ tty: true })
			const hint = /waiting for input|watch mode/

			const running = runLive({ out, live: terminal.output, clock })
			await clock.whenPending(1)
			clock.advance(60_000)
			const early = terminal.screen().find((line) => SPINNER.test(line))
			clock.advance(35_000)
			const late = terminal.screen().find((line) => SPINNER.test(line))
			writeFileSync(flag, '1')
			const exitCode = await running

			expect(exitCode).toBe(0)
			expect(early ?? '').not.toMatch(hint)
			expect(late ?? '').toMatch(hint)
		})
	},
)

describe('handover run: the hook log', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	/** The logs of hooks under `folder` (the temporary folder of this test) that hold `marker`. */
	function logsHolding(params: { folder: string; marker: string }): string[] {
		return readdirSync(params.folder)
			.filter((name) => name.startsWith('dialecte-hook-'))
			.map((name) => join(params.folder, name, `${LOT}-1.log`))
			.filter((path) => existsSync(path) && readFileSync(path, 'utf8').includes(params.marker))
	}

	it('the log grows while the hook runs: readable when its first line has been shown, so a killed run still leaves it', async () => {
		const hookTemporary = temporaryFolder('dialecte-hook-tmp-')
		const previousTemporary = process.env.TMPDIR
		onTestFinished(function restoreTemporary() {
			if (previousTemporary === undefined) delete process.env.TMPDIR
			else process.env.TMPDIR = previousTemporary
		})
		const flag = join(temporaryFolder('dialecte-flag-'), 'seen')
		const marker = `marker-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
		const { out } = prepareWithHook(
			`echo "${marker}"; i=0; while [ ! -f '${flag}' ] && [ $i -lt 100 ]; do sleep 0.1; i=$((i+1)); done; [ -f '${flag}' ] || exit 1`,
		)
		process.env.TMPDIR = hookTemporary
		let logsMidRun: string[] = []
		function record(line: string): void {
			if (line === `  │ ${marker}`) {
				logsMidRun = logsHolding({ folder: hookTemporary, marker })
				writeFileSync(flag, '1')
			}
		}

		const exitCode = await runLive({
			out,
			write: record,
			live: { tty: false, writeLine: record, rewriteLines: () => undefined },
		})

		expect(exitCode).toBe(0)
		expect(logsMidRun).toHaveLength(1)
	})

	it('a multibyte character split across two chunks → intact on screen and in the log, no replacement character', async () => {
		const { out } = prepareWithHook(String.raw`printf '\342\202'; sleep 0.3; printf '\254\n'`)
		const written: string[] = []
		function record(line: string): void {
			written.push(line)
		}

		const exitCode = await runLive({
			out,
			write: record,
			live: { tty: false, writeLine: record, rewriteLines: () => undefined },
		})

		const logPath =
			/full log: (\/\S+)/.exec(written.find((line) => line.includes('full log:')) ?? '')?.[1] ?? ''
		expect(exitCode).toBe(0)
		expect(written).toContain('  │ €')
		expect(written.some((line) => line.includes('�'))).toBe(false)
		expect(readFileSync(logPath, 'utf8')).toBe('€\n')
	})
})

describe('handover: the card run command', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('the command is once in full on its own line; inside the box the run row says see below', () => {
		const { lotsPath, out } = prepare()

		const result = writeHandover({ lotsPath })

		const lines = result.output.split('\n')
		const command = `node '${WRITER_CLI}' handover run '${out}'`
		const box = lines.filter((line) => /^[┌│└]/.test(line))
		expect(lines.filter((line) => line === command)).toHaveLength(1)
		expect(box.find((line) => line.startsWith('│ run '))).toMatch(/^│ run {9}see below +│$/)
		expect(box.some((line) => line.includes('handover run'))).toBe(false)
	})

	it('a repository cli that hangs on the probe → treated as no cli within the bound: the node command is printed', () => {
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
				'node_modules/@dialecte/cli/cli.js': '#!/bin/sh\nsleep 8\n',
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

		const startedAt = Date.now()
		const result = writeHandover({ lotsPath, probeTimeout: 300 })
		const elapsed = Date.now() - startedAt

		expect(elapsed).toBeLessThan(5_000)
		expect(result.output.split('\n')).toContain(`node '${WRITER_CLI}' handover run '${out}'`)
	})
})

describe(
	'handover run --rehearse: the untracked warning stays short',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		/** Untracked files appear after the hand-over was written: the warning comes before the guards refuse them. */
		async function warningFor(files: Record<string, string>): Promise<string[]> {
			const { root, lotsPath, out } = prepare()
			expect(writeHandover({ lotsPath }).exitCode).toBe(0)
			writeFiles({ root, files })

			const result = await runFolder({ out, argv: ['--rehearse'] })

			return result.lines.filter((line) => line.startsWith('warning:'))
		}

		it('an untracked folder of 50 files → one warning line naming the folder, not its files', async () => {
			const warnings = await warningFor(
				Object.fromEntries(
					Array.from({ length: 50 }, (_unused, index) => [`scratch/file-${index}.txt`, 'x\n']),
				),
			)

			expect(warnings).toHaveLength(1)
			expect(warnings[0]).toContain('scratch/')
			expect(warnings[0]).not.toContain('file-7.txt')
		})

		it('30 loose untracked files → the list is capped: "and N more"', async () => {
			const warnings = await warningFor(
				Object.fromEntries(
					Array.from({ length: 30 }, (_unused, index) => [`loose-${index}.txt`, 'x\n']),
				),
			)

			expect(warnings).toHaveLength(1)
			expect(warnings[0]).toMatch(/and \d+ more/)
			expect(warnings[0].length).toBeLessThan(600)
		})
	},
)

describe(
	'handover run: the card after every lot is committed',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('the run row says done and the command is not repeated; a hand-over not run yet still shows the command', async () => {
			const { lotsPath, out } = prepare()

			const pending = writeHandover({ lotsPath })
			const ran = await runFolder({ out })

			expect(pending.output).toMatch(/handover run '|bash commit\.sh/)
			expect(ran.exitCode).toBe(0)
			expect(ran.lines.find((line) => line.startsWith('│ run ')) ?? '').toMatch(
				/^│ run {9}done +│$/,
			)
			expect(ran.lines.some((line) => /handover run '|bash commit\.sh/.test(line))).toBe(false)
		})

		it('a hook refusing the second of two lots → the hand-over is partly committed: the card still shows the run command, not done', async () => {
			const { root, lotsPath, out } = prepare()
			installHook({
				root,
				script: 'git diff --cached --name-only | grep -q CHANGELOG.md && exit 1\nexit 0',
			})
			writeFileSync(
				lotsPath,
				JSON.stringify({ ...JSON.parse(readFileSync(lotsPath, 'utf8')), head: headOf(root) }),
			)
			expect(writeHandover({ lotsPath }).exitCode).toBe(0)

			const ran = await runFolder({ out })

			expect(ran.exitCode).toBe(1)
			expect(ran.lines.find((line) => line.startsWith('│ run ')) ?? '').not.toMatch(/done/)
			expect(ran.lines.some((line) => /handover run '|bash commit\.sh/.test(line))).toBe(true)
		})

		it('run again when every lot is committed already → the card still says done', async () => {
			const { lotsPath, out } = prepare()
			expect(writeHandover({ lotsPath }).exitCode).toBe(0)
			await runFolder({ out })

			const again = await runFolder({ out })

			expect(again.exitCode).toBe(0)
			expect(again.lines.find((line) => line.startsWith('│ run ')) ?? '').toMatch(
				/^│ run {9}done +│$/,
			)
		})
	},
)

/** The text of a file, or undefined when there is none. */
function readIfExists(path: string): string | undefined {
	return existsSync(path) ? readFileSync(path, 'utf8') : undefined
}

describe('handover run: the lot file archived', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	const DECLARATION = `${JSON.stringify(
		{
			accept: [{ case: 'src/read.test.ts::read > answers one', reason: 'pins existing behaviour' }],
		},
		null,
		'\t',
	)}\n`

	function archivedLines(lines: readonly string[]): string[] {
		return lines.filter((line) => line.startsWith('lot file archived'))
	}

	it('every lot committed by a real run → the lot file moved into the folder as lot.json, an empty declaration left, one line says so; the card shows the entries it held', async () => {
		const { root, lotsPath, out } = prepare()
		writeFiles({ root, files: { '.dialecte/lot.json': DECLARATION } })
		writeLedger({
			root,
			receipts: [
				{ kind: 'accepted', name: 'read > answers one', reason: 'pins existing behaviour' },
			],
		})
		expect(writeHandover({ lotsPath }).exitCode).toBe(0)

		const result = await runFolder({ out })

		expect(result.exitCode).toBe(0)
		expect(readIfExists(join(out, 'lot.json'))).toBe(DECLARATION)
		expect(readIfExists(join(root, '.dialecte/lot.json'))).toBe('{}\n')
		expect(archivedLines(result.lines)).toEqual([`lot file archived: ${join(out, 'lot.json')}`])
		expect(tddRowLines(result.text)).toEqual([
			'accepted: src/read.test.ts::read > answers one (pins existing behaviour)',
		])
	})

	/** A repository whose pre-commit hook refuses the CHANGELOG lot while `marker` exists; its hand-over written. */
	function preparedWithRefusingHook(): { root: string; out: string; marker: string } {
		const { root, lotsPath, out } = prepare()
		const marker = join(temporaryFolder('dialecte-hook-marker-'), 'refuse')
		installHook({
			root,
			script: `if [ -f '${marker}' ] && git diff --cached --name-only | grep -q CHANGELOG; then exit 1; fi\nexit 0`,
		})
		writeFileSync(
			lotsPath,
			JSON.stringify({ ...JSON.parse(readFileSync(lotsPath, 'utf8')), head: headOf(root) }),
		)
		writeFiles({ root, files: { '.dialecte/lot.json': DECLARATION } })
		expect(writeHandover({ lotsPath }).exitCode).toBe(0)
		return { root, out, marker }
	}

	it('a rehearsal → the lot file left as it is, nothing archived, no line', async () => {
		const { root, out } = preparedWithRefusingHook()

		const rehearsed = await runFolder({ out, argv: ['--rehearse'] })

		expect(rehearsed.exitCode).toBe(0)
		expect(archivedLines(rehearsed.lines)).toEqual([])
		expect(readIfExists(join(root, '.dialecte/lot.json'))).toBe(DECLARATION)
		expect(existsSync(join(out, 'lot.json'))).toBe(false)
	})

	it('a run stopped by a hook → the lot file left as it is, nothing archived; the run that commits the last lot archives it', async () => {
		const { root, out, marker } = preparedWithRefusingHook()
		writeFileSync(marker, '')
		const stopped = await runFolder({ out })
		const afterStop = readIfExists(join(root, '.dialecte/lot.json'))
		const archivedAfterStop = existsSync(join(out, 'lot.json'))
		rmSync(marker)

		const resumed = await runFolder({ out })

		expect(stopped.exitCode).toBe(1)
		expect(archivedLines(stopped.lines)).toEqual([])
		expect(afterStop).toBe(DECLARATION)
		expect(archivedAfterStop).toBe(false)
		expect(resumed.exitCode).toBe(0)
		expect(archivedLines(resumed.lines)).toEqual([`lot file archived: ${join(out, 'lot.json')}`])
		expect(readIfExists(join(out, 'lot.json'))).toBe(DECLARATION)
		expect(readIfExists(join(root, '.dialecte/lot.json'))).toBe('{}\n')
	})

	const LOT_FILE_ROWS: Array<{
		name: string
		/** The worktree's lot file before the run; none when undefined. */
		content: string | undefined
		archived: boolean
	}> = [
		{ name: 'no lot file', content: undefined, archived: false },
		{ name: 'an empty lot file {} with a newline', content: '{}\n', archived: false },
		{ name: 'an empty lot file {} without a newline', content: '{}', archived: false },
		{
			name: 'an empty lot file { } with spaces and blank lines',
			content: ' { }\n\n',
			archived: false,
		},
		{ name: 'a lot file with entries', content: DECLARATION, archived: true },
		{ name: 'a lot file that is not JSON', content: '{ not json', archived: true },
		{ name: 'a lot file holding []', content: '[]\n', archived: true },
	]

	for (const row of LOT_FILE_ROWS)
		it(`${row.name} → ${row.archived ? 'archived into the folder, {} left, one line' : 'nothing archived, no line, the file left as it is'}`, async () => {
			const { root, lotsPath, out } = prepare()
			if (row.content !== undefined)
				writeFiles({ root, files: { '.dialecte/lot.json': row.content } })
			expect(writeHandover({ lotsPath }).exitCode).toBe(0)

			const result = await runFolder({ out })

			expect(result.exitCode).toBe(0)
			expect({
				lines: archivedLines(result.lines),
				archive: readIfExists(join(out, 'lot.json')),
				worktree: readIfExists(join(root, '.dialecte/lot.json')),
			}).toEqual(
				row.archived
					? {
							lines: [`lot file archived: ${join(out, 'lot.json')}`],
							archive: row.content,
							worktree: '{}\n',
						}
					: { lines: [], archive: undefined, worktree: row.content },
			)
		})

	it("a second run on a folder whose lot.json exists → the archived lot.json is not overwritten, the next lot's file is left as it is, no line", async () => {
		const { root, lotsPath, out } = prepare()
		writeFiles({ root, files: { '.dialecte/lot.json': DECLARATION } })
		expect(writeHandover({ lotsPath }).exitCode).toBe(0)
		const first = await runFolder({ out })
		const archived = readIfExists(join(out, 'lot.json'))
		const next = `${JSON.stringify({ tdd: 'exempt: the next lot' }, null, '\t')}\n`
		writeFiles({ root, files: { '.dialecte/lot.json': next } })

		const second = await runFolder({ out })

		expect(first.exitCode).toBe(0)
		expect(archived).toBe(DECLARATION)
		expect(second.exitCode).toBe(0)
		expect(readIfExists(join(out, 'lot.json'))).toBe(DECLARATION)
		expect(readIfExists(join(root, '.dialecte/lot.json'))).toBe(next)
		expect(archivedLines(second.lines)).toEqual([])
	})
})
