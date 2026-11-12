import { spawn, spawnSync } from 'node:child_process'
import {
	chmodSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'

import { createFakeClock } from '../../test/fake-clock.ts'
import { createFakeTerminal } from '../../test/fake-terminal.ts'
import { DEFAULT_PROBE_TIMEOUT_MILLISECONDS } from '../../test/handover-card-probe.constants.ts'
import { removeHookLogs } from '../../test/hook-logs.ts'
import {
	PERSON_WHO_RUNS_THE_REPOSITORY,
	RUN_THE_HANDOVER,
	TOUCH_THE_GIT_FOLDER,
} from '../../test/refusal-wording.constants.ts'
import { noRepositoryCli, recordingProbe } from '../../test/repository-cli-probe.ts'
import {
	createScratchRepository,
	git,
	initializeRepository,
	writeFiles,
	temporaryFolder,
} from '../../test/scratch-repository.ts'
import { createVitestPackage } from '../../test/scratch-vitest-package.ts'
import {
	HANDOVER_CASE_TIMEOUT,
	HANGING_CLI_SLEEP_SECONDS,
	HANGING_PROBE_ELAPSED_BOUND_MS,
} from '../../test/test-timing.constants.ts'
import { createRecordingSpawner } from '../../test/worktree-pool.ts'
import { computeStateHash } from '../lib/gate-records/state-hash.ts'
import {
	HANDOVER_PROBE_TIMEOUT_MILLISECONDS,
	HANDOVER_RUN_MARKER_FILE,
} from '../lib/handover/handover.constants.ts'
import { probeRepositoryCli } from '../lib/handover/repository-cli-probe.ts'
import { isProcessAlive } from '../lib/process-alive.ts'
import { STANDARD_ENVIRONMENT_VARIABLE, STANDARD_FILE } from '../lib/standard/standard.constants.ts'
import { hashTestCode } from '../lib/tdd/tdd-files.ts'
import { runGate } from './gate.ts'
import { runHandover, runHandoverList, runHandoverRun } from './handover.ts'
import { runRules } from './rules.ts'
import { runTdd } from './tdd.ts'

import { describe, expect, it, onTestFinished } from 'vitest'

import type { GateStep } from '../lib/gate/gate-config.types.ts'
import type { HandoverProbe, LotsFile } from '../lib/handover/handover.types.ts'
import type { Clock } from '../lib/progress/clock.types.ts'
import type { LiveOutput } from '../lib/progress/step-progress.types.ts'

/**
 * Each case makes repositories and runs git (and npx, hooks, clones) dozens of times: on a loaded machine
 * that takes seconds, so the bound leaves room; it is never a measure of speed.
 */
const SCRATCH_REPOSITORY_TIMEOUT = HANDOVER_CASE_TIMEOUT

/** The cli's entry in the sources: Node runs it with its type stripping. */
const CLI_SOURCE = join(import.meta.dirname, '..', 'cli.ts')

/**
 * The cli run as a process whose output is a pipe, not a terminal; `$COLUMNS` set only when `columns` is
 * given (the caller's own is left out).
 */
function runCli(params: { argv: string[]; columns?: number }): {
	exitCode: number | null
	output: string
} {
	const { COLUMNS: _callerColumns, ...environment } = process.env
	const result = spawnSync(process.execPath, [CLI_SOURCE, ...params.argv], {
		encoding: 'utf8',
		env: {
			...environment,
			...(params.columns !== undefined && { COLUMNS: String(params.columns) }),
		},
	})
	return { exitCode: result.status, output: `${result.stdout}${result.stderr}` }
}

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

/** The time the written cards are dated from: their registered name is `2026-11-04-main`. */
const CARD_NOW = new Date(2026, 10, 4, 12, 0, 0)

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
	probe?: HandoverProbe
}) {
	return runHandover({
		probe: params.probe ?? noRepositoryCli,
		argv: [params.lotsPath, ...(params.argv ?? [])],
		cliPath: WRITER_CLI,
		now: CARD_NOW,
		columns: params.columns,
		probeTimeout: params.probeTimeout,
	})
}

/** `handover run` on the folder, every line it printed kept. */
async function runFolder(params: {
	out: string
	argv?: string[]
	scratchRoot?: string
	probe?: HandoverProbe
}): Promise<{ exitCode: number; lines: string[]; text: string }> {
	const lines: string[] = []
	removeHookLogs({ lines })
	const exitCode = await runHandoverRun({
		probe: params.probe ?? noRepositoryCli,
		argv: [params.out, ...(params.argv ?? [])],
		write: (line) => lines.push(line),
		clock: createFakeClock(),
		colour: false,
		scratchRoot: params.scratchRoot ?? temporaryFolder('dialecte-scratch-root-'),
		spawner: createRecordingSpawner().spawner,
	})
	return { exitCode, lines, text: lines.join('\n') }
}

function subjectsOf(params: { root: string; count: number }): string[] {
	return git({ root: params.root, args: ['log', '--format=%s', `-${params.count}`] })
		.trim()
		.split('\n')
}

/** The pid a run marker's text names; undefined when the text is no marker. */
function markerPid(text: string): number | undefined {
	try {
		const marker = JSON.parse(text) as { pid?: unknown }
		return typeof marker.pid === 'number' ? marker.pid : undefined
	} catch {
		return undefined
	}
}

/**
 * The rehearsal folder a path lies in: its nearest folder named `dialecte-rehearse-<random>`; undefined
 * for a path in none.
 */
function rehearsalFolderOf(path: string): string | undefined {
	for (let folder = path; folder !== dirname(folder); folder = dirname(folder))
		if (basename(folder).startsWith('dialecte-rehearse-')) return folder
	return undefined
}

/** The rehearsal folder a `rehearsal in <path>` line of the output names, removed when the test ends. */
function announcedRehearsalFolder(output: string): string | undefined {
	const folder = rehearsalFolderOf(/^rehearsal in (\S+)$/m.exec(output)?.[1] ?? '')
	onTestFinished(function removeRehearsalFolder() {
		if (folder) rmSync(folder, { recursive: true, force: true })
	})
	return folder
}

/**
 * A workspace of sibling folders: the repository `cli` holding a package.json whose dependencies are
 * `dependencies`, and beside it `core` and `scl`, each holding a marker file; two changed files in one
 * lot, the hook `hook`, the hand-over written.
 */
function prepareWithSiblings(params: { dependencies: Record<string, string>; hook: string }): {
	family: string
	root: string
	out: string
} {
	const family = temporaryFolder('dialecte-family-')
	const root = initializeRepository({
		root: join(family, 'cli'),
		files: {
			'package.json': JSON.stringify({ name: 'demo', dependencies: params.dependencies }),
			'src/read.ts': 'export function read() {}\n',
		},
	})
	writeFiles({
		root: family,
		files: { 'core/marker.txt': 'core\n', 'scl/marker.txt': 'scl\n' },
	})
	installHook({ root, script: params.hook })
	writeFiles({
		root,
		files: {
			'src/read.ts': 'export function read() {\n\treturn 1\n}\n',
			'CHANGELOG.md': '# Changelog\n\n- read answers 1\n',
		},
	})
	const out = temporaryFolder('dialecte-handover-')
	const lotsPath = join(out, 'lots.json')
	const lotsFile: LotsFile = {
		repository: root,
		branch: 'main',
		head: headOf(root),
		lots: [{ paths: ['src/', 'CHANGELOG.md'], message: 'feat(read): read answers one' }],
	}
	writeFileSync(lotsPath, JSON.stringify(lotsFile))
	expect(writeHandover({ lotsPath }).exitCode).toBe(0)
	return { family, root, out }
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

/** The lines of a card's box: the title, the rows, the section rules, the footer (hook lines start with spaces). */
function boxLines(output: string): string[] {
	return output.split('\n').filter((line) => /^[┌│├└]/.test(line))
}

/** A box row's text: the frame and the padding left out, the indent kept. */
function rowText(line: string): string {
	return line.slice('│ '.length).replace(/ *│$/, '')
}

/** The verdict rows of a card: its rows before the first section rule. */
function verdictLines(output: string): string[] {
	const box = boxLines(output)
	const end = box.findIndex((line) => line.startsWith('├'))
	return box.slice(1, end < 0 ? -1 : end).map(rowText)
}

/** The rows of the card's section `name` (opened by `├─ <name> ─…┤`), up to the next rule. */
function sectionLines(params: { output: string; name: string }): string[] {
	const box = boxLines(params.output)
	const first = box.findIndex((line) => line.startsWith(`├─ ${params.name} ─`))
	if (first < 0) return []
	const rest = box.slice(first + 1)
	const end = rest.findIndex((line) => !line.startsWith('│'))
	return rest.slice(0, end < 0 ? rest.length : end).map(rowText)
}

/** The lines of the card's tdd section, without the box. */
function tddRowLines(output: string): string[] {
	return sectionLines({ output, name: 'tdd' })
}

/** The mark the head line of the entries to read ends with, at the right edge of the box. */
const TO_READ = 'to read ↓'

/** The head line of the entries to read in a box of `columns` (the frame's 4 columns left out). */
function toReadLine(params: { head: string; columns: number }): string {
	return `${params.head.padEnd(params.columns - 4 - TO_READ.length)}${TO_READ}`
}

/**
 * A ledger of receipts of `src/read.test.ts`, oldest first, each with its kind, name, reason and flags; and
 * a gate record of the tree as it is whose tdd step judged every case of those receipts.
 */
function writeLedger(params: {
	root: string
	receipts: Array<{ kind: string; name: string; reason?: string; flags?: string[] }>
	/** The names of the lot's own cases: the gate judges only those (the other receipts are earlier lots'). */
	judgedNames?: readonly string[]
}): void {
	writeLedgerOnly(params)
	recordJudgedCasesWith({ root: params.root, statuses: {}, only: params.judgedNames })
}

/** The ledger of `writeLedger` alone: no gate judged its cases. */
function writeLedgerOnly(params: {
	root: string
	receipts: Array<{ kind: string; name: string; reason?: string; flags?: string[] }>
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

/**
 * A full gate record of the tree as it is, holding only its tdd step: the cases it judged are those of
 * every receipt of the ledger, as a gate run on that tree would have listed them, each with the status of
 * its last red, green, unchanged, accepted or revised receipt (a kept receipt changes none).
 */
function recordJudgedCases(root: string): void {
	recordJudgedCasesWith({ root, statuses: {} })
}

/** `recordJudgedCases`, a case named in `statuses` (by its name) judged with the status given there. */
function recordJudgedCasesWith(params: {
	root: string
	statuses: Record<string, string>
	/** Judge only the cases with these names (the lot's own); every case of the ledger when not given. */
	only?: readonly string[]
}): void {
	const { root } = params
	const ledger = JSON.parse(readFileSync(join(root, '.git', 'dialecte-tdd.json'), 'utf8')) as {
		entries: Array<{ kind: string; file: string; name: string; project: string }>
	}
	const statusByLabel = new Map<string, string>()
	for (const entry of ledger.entries) {
		if (entry.kind === 'freeze') continue
		if (params.only && !params.only.includes(entry.name)) continue
		const label = `${entry.file}::${entry.name}${entry.project ? ` [${entry.project}]` : ''}`
		const known = statusByLabel.get(label)
		statusByLabel.set(
			label,
			params.statuses[entry.name] ?? (entry.kind === 'kept' ? (known ?? 'green') : entry.kind),
		)
	}
	writeFileSync(
		join(root, '.git', 'dialecte-gate-full.json'),
		JSON.stringify({
			mode: 'full',
			at: new Date().toISOString(),
			head: headOf(root),
			stateHash: computeStateHash(root),
			steps: [
				{
					name: 'tdd',
					status: 'passed',
					counts: {},
					cases: [...statusByLabel].map(([label, status]) => ({ label, status })),
				},
			],
		}),
	)
}

/** A committed package.json whose gate runs `fast` and `full`. */
function gatedPackage(params: {
	fast?: GateStep[]
	full?: GateStep[]
	scripts?: Record<string, string>
}): Record<string, string> {
	return {
		'package.json': JSON.stringify({
			name: 'demo',
			scripts: params.scripts ?? {},
			dialecte: { gate: { fast: params.fast, full: params.full } },
		}),
	}
}

/** The gate in `root`. */
async function runGateIn(params: { root: string; argv: string[] }): Promise<number> {
	const result = await runGate({
		cwd: params.root,
		argv: params.argv,
	})
	return result.exitCode
}

/** The subject of the merge lot of `fullCardScenario`. */
const MERGE_SUBJECT = 'merge: bring feat/x in'

/** The second line of a commit.sh: it re-executes the script with bash, out of posix mode. */
const REEXEC_GUARD =
	'if [ -z "${BASH_VERSION:-}" ] || shopt -oq posix 2>/dev/null; then exec env -u POSIXLY_CORRECT bash "$0" "$@"; fi'

/** The lots file's gates text of `fullCardScenario`: the card's notes. */
const FULL_CARD_NOTES = 'Run it with the cli of this branch.'

/**
 * A hand-over holding every part of the card: a plain lot (`src/read.ts`), then a merge lot of `feat/x`
 * (one conflict in `conflict.txt`, resolved, `tree` recorded when given); a fast gate run (`check` passing,
 * `build` failing when `failingBuild`, the tdd step not run here), the rules run on the tree; a lot file
 * accepting a case and revising one (and one entry of each no receipt used), declaring a test file gone, with the
 * receipts of the two cases, of a case proven red then green, of an unchanged case and of an unchanged case kept
 * at a later red run with the flag `test code changed around it`; notes. The hand-over is not written yet.
 */
async function fullCardScenario(params: { failingBuild: boolean; tree?: string }): Promise<{
	root: string
	out: string
	lotsPath: string
	/** HEAD as a full sha. */
	head: string
	/** The merged tip of `feat/x`, a full sha. */
	tip: string
}> {
	const root = createScratchRepository({
		'src/read.ts': 'export function read() {}\n',
		'conflict.txt': 'base\n',
		...gatedPackage({
			fast: [
				{ name: 'check', run: `printf ' Tests  4 passed (4)\\n'` },
				{ name: 'build', run: params.failingBuild ? 'exit 1' : 'true' },
			],
		}),
	})
	git({ root, args: ['checkout', '-q', '-b', 'feat/x'] })
	writeFiles({ root, files: { 'conflict.txt': 'feature\n' } })
	git({ root, args: ['commit', '-q', '-am', 'feat: the branch work'] })
	const tip = headOf(root)
	git({ root, args: ['checkout', '-q', 'main'] })
	writeFiles({ root, files: { 'conflict.txt': 'main\n' } })
	git({ root, args: ['commit', '-q', '-am', 'feat: the main work'] })
	const head = headOf(root)
	writeFiles({
		root,
		files: {
			'src/read.ts': 'export function read() {\n\treturn 1\n}\n',
			'.dialecte/lot.json': JSON.stringify({
				accept: [
					{ case: 'src/read.test.ts::read > answers one', reason: 'pins existing behaviour' },
					{ case: 'src/x.test.ts::x', reason: 'never run' },
				],
				revised: [
					{ case: 'src/read.test.ts::read > answers two', reason: 'the review asked for it' },
					{ case: 'src/y.test.ts::y', reason: 'never run' },
				],
				gone: [{ file: 'src/old.test.ts', reason: 'the table call was rewritten' }],
			}),
		},
	})
	writeLedger({
		root,
		receipts: [
			{ kind: 'accepted', name: 'read > answers one', reason: 'pins existing behaviour' },
			{ kind: 'revised', name: 'read > answers two', reason: 'the review asked for it' },
			{ kind: 'red', name: 'read > answers three' },
			{ kind: 'green', name: 'read > answers three' },
			{ kind: 'unchanged', name: 'read > stays' },
			{ kind: 'unchanged', name: 'read > stays too' },
			{ kind: 'kept', name: 'read > stays too', flags: ['test code changed around it'] },
		],
	})
	const out = temporaryFolder('dialecte-handover-')
	writeFiles({ root: out, files: { 'resolved/conflict.txt': 'resolved\n' } })
	const lotsPath = join(out, 'lots.json')
	const lotsFile: LotsFile = {
		repository: root,
		branch: 'main',
		head,
		gates: FULL_CARD_NOTES,
		lots: [
			{ paths: ['src/'], message: 'feat(read): read answers one' },
			{
				kind: 'merge',
				branch: 'feat/x',
				tip,
				resolved: { 'conflict.txt': 'resolved/conflict.txt' },
				message: MERGE_SUBJECT,
				...(params.tree && { tree: params.tree }),
			},
		],
	}
	writeFileSync(lotsPath, JSON.stringify(lotsFile))
	await runGateIn({ root, argv: [] })
	runRules({ cwd: root, argv: [] })
	return { root, out, lotsPath, head, tip }
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
			committed: {
				'package.json': JSON.stringify({ name: 'demo', dialecte: { profile: 'contributor' } }),
			},
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

	it('a package allowing ticket numbers → a lot message and a file with a ticket reference are written', () => {
		const { lotsPath, out } = prepare({
			committed: {
				'package.json': JSON.stringify({
					name: 'app',
					dialecte: { allowReferences: ['ticket number'] },
				}),
			},
			files: { 'src/read.ts': `// see ${'#'}3102\nexport function read() {}\n` },
			lots: [{ paths: ['src/'], message: `feat(read): read answers one\n\nRefs ${'#'}3102` }],
		})

		expect(writeHandover({ lotsPath }).exitCode).toBe(0)
		expect(existsSync(join(out, 'commit.sh'))).toBe(true)
	})

	it('a symlink to a folder in a lot → written, then committed as a link', async () => {
		const { root, lotsPath, out } = prepare({
			files: { 'shared/skills/demo/SKILL.md': '# demo\n' },
			lots: [
				{ paths: ['shared/', 'agents/'], message: 'chore: shared skills and the link to them' },
			],
		})
		mkdirSync(join(root, 'agents'))
		symlinkSync('../shared/skills', join(root, 'agents', 'skills'), 'dir')

		let exitCode: number | undefined
		expect(() => {
			exitCode = writeHandover({ lotsPath }).exitCode
		}).not.toThrow()
		expect(exitCode).toBe(0)
		const run = await runFolder({ out })

		expect(run.exitCode).toBe(0)
		expect(git({ root, args: ['ls-tree', 'HEAD', 'agents/skills'] })).toMatch(/^120000 /)
	})

	it('a package allowing ticket numbers → the run commits the lot, the reference in its message kept', async () => {
		const { root, lotsPath, out } = prepare({
			committed: {
				'package.json': JSON.stringify({
					name: 'app',
					dialecte: { allowReferences: ['ticket number'] },
				}),
			},
			files: { 'src/read.ts': 'export function read() {\n\treturn 1\n}\n' },
			lots: [{ paths: ['src/'], message: `feat(read): read answers one (${'#'}3102)` }],
		})
		expect(writeHandover({ lotsPath }).exitCode).toBe(0)

		const run = await runFolder({ out })

		expect(run.exitCode).toBe(0)
		expect(subjectsOf({ root, count: 1 })).toEqual([`feat(read): read answers one (${'#'}3102)`])
	})

	it('a package allowing a citation of a standard → the write refused, naming it, nothing written', () => {
		const { lotsPath, out } = prepare({
			committed: {
				'package.json': JSON.stringify({
					name: 'app',
					dialecte: { allowReferences: ['clause citation'] },
				}),
			},
		})

		expect(() => writeHandover({ lotsPath })).toThrow(/clause citation/)
		expect(existsSync(join(out, 'commit.sh'))).toBe(false)
	})

	it('a lot holding a link to a folder, run again after it was committed → no hashing error, nothing committed twice', async () => {
		const { root, lotsPath, out } = prepare({
			files: { 'shared/skills/demo/SKILL.md': '# demo\n' },
			lots: [
				{ paths: ['shared/', 'agents/'], message: 'chore: shared skills and the link to them' },
			],
		})
		mkdirSync(join(root, 'agents'))
		symlinkSync('../shared/skills', join(root, 'agents', 'skills'), 'dir')
		expect(writeHandover({ lotsPath }).exitCode).toBe(0)
		const first = await runFolder({ out })
		expect(first.exitCode).toBe(0)
		const head = headOf(root)

		const again = runFolder({ out })

		await expect(again).resolves.toMatchObject({ exitCode: 0 })

		expect(headOf(root)).toBe(head)
	})

	it('a plan tag in an eval prompt under skills/ → refused when the folder is written', () => {
		const { lotsPath } = prepare({
			committed: {
				'package.json': JSON.stringify({ name: 'demo', dialecte: { profile: 'contributor' } }),
			},
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
		expect(commands).toContain(REEXEC_GUARD)
		expect(readFileSync(join(out, 'commit.sh'), 'utf8').split('\n')[1]).toBe(REEXEC_GUARD)
	})

	it('written → the card: titled with the repository folder and the branch, the notes, a commit line per lot with files, +/− and subject, HEAD; no path in the box; the command under it', () => {
		const { root, lotsPath, out } = prepare()

		const result = writeHandover({ lotsPath })

		expect(result.exitCode).toBe(0)
		const lines = result.output.split('\n')
		expect(lines[0]).toMatch(new RegExp(`^┌─ hand-over: ${basename(root)} main ─+┐$`))
		expect(sectionLines({ output: result.output, name: 'commit' })).toEqual([
			'pending  1 file  +3 −1  feat(read): read answers one',
			'pending  1 file  +3 −0  docs(changelog): read',
			`HEAD ${headOf(root).slice(0, 7)}`,
			`worktree ${basename(root)}`,
		])
		expect(sectionLines({ output: result.output, name: 'notes' })).toEqual(['npm run check'])
		const box = boxLines(result.output)
		expect(box.filter((line) => line.includes(root))).toEqual([])
		expect(box.map((line) => line.length)).toEqual(Array(box.length).fill(lines[0].length))
		expect(lines.at(-1)).toBe(`node '${WRITER_CLI}' handover run '${realpathSync(out)}'`)
	})

	it('written → above the command: the repository held until every lot is committed, the gate still running under this hand-over, a late edit re-gated then --rehash on the lots file written (its path quoted)', () => {
		const { lotsPath } = prepare()

		const lines = writeHandover({ lotsPath }).output.split('\n')

		expect(lines.at(-2)).toBe(
			`Review the card, then run it. The repository is held until every lot is committed; \`dialecte gate\` still runs under this hand-over (after a late edit: re-gate, then \`dialecte handover '${lotsPath}' --rehash\`):`,
		)
	})

	it('the lot file .dialecte/lot.json in no lot → not refused; a lot declared exempt from the receipts → its line first in the tdd section, before the counts', () => {
		const { root, lotsPath } = prepare()
		writeFiles({
			root,
			files: { '.dialecte/lot.json': JSON.stringify({ tdd: 'exempt: a rename only' }) },
		})
		writeLedger({ root, receipts: [{ kind: 'unchanged', name: 'read > stays' }] })

		const result = writeHandover({ lotsPath, columns: 80 })

		expect(result.exitCode).toBe(0)
		expect(tddRowLines(result.output)).toEqual([
			'exempt: a rename only (2 production file(s), 0 test file(s) changed)',
			'0 proven red → green · 1 unchanged',
		])
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

	it('57 cases flagged with one kind → one line with the count and the kind, no line per case', () => {
		const { root, lotsPath } = prepare()
		writeFileSync(
			join(root, '.git', 'dialecte-tdd.json'),
			flaggedLedger({ count: 57, flags: ['test code changed around it'] }),
		)
		recordJudgedCases(root)

		const lines = writeHandover({ lotsPath }).output.split('\n')

		expect(lines).toEqual(
			expect.arrayContaining([
				expect.stringMatching(/^│ 57 flags: test code changed around it +│$/),
			]),
		)
		expect(lines.filter((line) => line.includes('flag: src/'))).toEqual([])
	})

	it('flags of two kinds on cases still red → one line per kind with its count, nothing counted above them, no line per case', () => {
		const { root, lotsPath } = prepare()
		writeFileSync(
			join(root, '.git', 'dialecte-tdd.json'),
			flaggedLedger({ count: 3, flags: ['rollback', 'red after green'] }),
		)
		recordJudgedCases(root)

		expect(tddRowLines(writeHandover({ lotsPath, columns: 80 }).output)).toEqual([
			'3 flags: rollback',
			'3 flags: red after green',
		])
	})

	it('a case the lot accepts and a red run accepted → counted under its reason: 1 accepted, then a row 1 <reason>', () => {
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
		recordJudgedCases(root)

		expect(writeHandover({ lotsPath }).output.split('\n')).toEqual(
			expect.arrayContaining([
				expect.stringMatching(/^│ 1 accepted +│$/),
				expect.stringMatching(/^│ {3}1 {2}pins existing behaviour +│$/),
			]),
		)
	})

	it('a case revised at review and a red run recorded it → under the to-read line: revised <file> › <case title>, the reason on the next line', () => {
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
		recordJudgedCases(root)

		expect(tddRowLines(writeHandover({ lotsPath, columns: 80 }).output)).toEqual([
			toReadLine({ head: '1 revised', columns: 80 }),
			'  revised  src/read.test.ts › read > answers one',
			'           the review asked for it',
		])
	})

	it('a test helper frozen by a revised entry → under the to-read line: revised <helper>, the reason on the next line, counted, not unused', () => {
		const helper = 'test/expected.ts'
		const { root, lotsPath } = prepare({
			files: {
				'src/read.ts': 'export function read() {\n\treturn 1\n}\n',
				[helper]: 'export const EXPECTED = 3\n',
			},
			lots: [{ paths: ['src/', 'test/'], message: 'feat(read): read answers one' }],
		})
		writeFiles({
			root,
			files: {
				'.dialecte/lot.json': JSON.stringify({
					revised: [{ case: helper, reason: 'the helper gained a constant at review' }],
				}),
			},
		})
		writeFileSync(
			join(root, '.git', 'dialecte-tdd.json'),
			JSON.stringify({
				version: 3,
				entries: [
					{
						kind: 'freeze',
						files: { [helper]: hashTestCode({ root, file: helper }) },
						revised: [helper],
						at: '2026-10-30T12:00:00.000Z',
					},
				],
			}),
		)
		recordJudgedCases(root)

		expect(tddRowLines(writeHandover({ lotsPath, columns: 80 }).output)).toEqual([
			toReadLine({ head: '1 revised', columns: 80 }),
			'  revised  test/expected.ts',
			'           the helper gained a constant at review',
		])
	})

	it("a glob entry used by a helper that also names an earlier lot's revised receipt → the helper listed, the entry not unused (as at the gate)", () => {
		const helper = 'test/expected.ts'
		const { root, lotsPath } = prepare({
			files: {
				'src/read.ts': 'export function read() {\n\treturn 1\n}\n',
				[helper]: 'export const EXPECTED = 3\n',
			},
			lots: [{ paths: ['src/', 'test/'], message: 'feat(read): read answers one' }],
		})
		writeFiles({
			root,
			files: {
				'.dialecte/lot.json': JSON.stringify({
					revised: [{ case: 'test/*.ts', reason: 'the helper gained a constant at review' }],
				}),
			},
		})
		const ledgerPath = join(root, '.git', 'dialecte-tdd.json')
		const freeze = {
			kind: 'freeze',
			files: { [helper]: hashTestCode({ root, file: helper }) },
			revised: [helper],
			at: '2026-10-30T12:00:00.000Z',
		}
		writeFileSync(ledgerPath, JSON.stringify({ version: 3, entries: [freeze] }))
		recordJudgedCases(root)
		// an earlier lot's revised receipt the glob names, judged by no gate of this change
		writeFileSync(
			ledgerPath,
			JSON.stringify({
				version: 3,
				entries: [
					{
						kind: 'revised',
						file: 'test/old.test.ts',
						name: 'old > earlier',
						project: '',
						testFileHash: 'h',
						caseHash: 'c',
						productionHash: 'p',
						reason: 'an earlier review',
						at: '2026-10-29T12:00:00.000Z',
					},
					freeze,
				],
			}),
		)

		expect(tddRowLines(writeHandover({ lotsPath, columns: 80 }).output)).toEqual([
			toReadLine({ head: '1 revised', columns: 80 }),
			'  revised  test/expected.ts',
			'           the helper gained a constant at review',
		])
	})

	it("receipts of earlier lots → folded into one count line per kind under the accepted line, a case counted once; a receipt the lot file names counted under the file's reason; an unused entry to read, the only declaration (an earlier lot's revised receipt is none)", () => {
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
			judgedNames: ['read > answers one'],
			receipts: [
				{ kind: 'accepted', name: 'read > answers one', reason: 'the reason the red run saw' },
				{ kind: 'accepted', name: 'read > earlier one', reason: 'an earlier lot' },
				{ kind: 'accepted', name: 'read > earlier one', reason: 'an earlier lot, run again' },
				{ kind: 'accepted', name: 'read > earlier two', reason: 'an earlier lot' },
				{ kind: 'revised', name: 'read > earlier three', reason: 'an earlier review' },
			],
		})

		const output = writeHandover({ lotsPath, columns: 80 }).output

		expect(
			verdictLines(output)
				.slice(1)
				.map((line) => line.trim()),
		).toEqual(['1 declaration to read (below)'])
		expect(tddRowLines(output)).toEqual([
			'1 accepted',
			'  1  pins existing behaviour',
			'earlier lots: 2 accepted, 1 revised (not in the lot file)',
			toReadLine({ head: '1 unused', columns: 80 }),
			'  unused   accept src/read.test.ts::read > unused (never run): no receipt of',
			'           that case',
		])
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

		expect(tddRowLines(writeHandover({ lotsPath, columns: 80 }).output)).toEqual([
			toReadLine({ head: '1 revised', columns: 80 }),
			'  revised  src/read.test.ts › read > answers one',
			'           the loops were merged',
		])
	})

	it('a gone entry of the lot file → under the to-read line: gone <file> (<reason>)', () => {
		const { root, lotsPath } = prepare()
		writeFiles({
			root,
			files: {
				'.dialecte/lot.json': JSON.stringify({
					gone: [{ file: 'src/read.test.ts', reason: 'the table call was rewritten' }],
				}),
			},
		})

		expect(tddRowLines(writeHandover({ lotsPath, columns: 80 }).output)).toEqual([
			toReadLine({ head: '1 gone', columns: 80 }),
			'  gone     src/read.test.ts (the table call was rewritten)',
		])
	})

	it('--json → the same content as data', () => {
		const { root, lotsPath, out } = prepare()

		const result = writeHandover({ lotsPath, argv: ['--json'] })

		expect(JSON.parse(result.output)).toMatchObject({
			folder: realpathSync(out),
			repository: root,
			worktree: root,
			branch: 'main',
			notes: 'npm run check',
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
			command: `node '${WRITER_CLI}' handover run '${realpathSync(out)}'`,
		})
		expect(JSON.parse(result.output).gates).toEqual([
			{ name: 'gate', status: 'failed', detail: 'never run on this tree' },
			{ name: 'review', status: 'warning', detail: 'no findings ledger' },
			{
				name: 'standard',
				status: 'warning',
				detail: 'not consulted: none configured (DIALECTE_STANDARD)',
			},
		])
	})

	it('--json → the tdd lines without their layout (indent, label padding, to-read mark), the runs of spaces inside titles, reasons and paths kept', () => {
		const { root, lotsPath } = prepare()
		writeFiles({
			root,
			files: {
				'.dialecte/lot.json': JSON.stringify({
					accept: [
						{ case: 'src/read.test.ts::read > answers one', reason: 'pins  existing  behaviour' },
					],
					revised: [{ case: 'src/read.test.ts::read >  two  spaces', reason: 'asked  twice' }],
					gone: [{ file: 'src/a  b.test.ts', reason: 'the  table call' }],
				}),
			},
		})
		writeLedger({
			root,
			receipts: [
				{ kind: 'accepted', name: 'read > answers one', reason: 'pins  existing  behaviour' },
				{ kind: 'revised', name: 'read >  two  spaces', reason: 'asked  twice' },
			],
		})

		const result = writeHandover({ lotsPath, argv: ['--json'] })

		expect(JSON.parse(result.output).tdd).toEqual([
			'1 accepted',
			'1 pins  existing  behaviour',
			'1 revised · 1 gone',
			'revised src/read.test.ts › read >  two  spaces',
			'asked  twice',
			'gone src/a  b.test.ts (the  table call)',
		])
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

	it('--rehash after an edit → the rewritten commit.sh keeps the re-exec guard as its second line, the header after it', () => {
		const { root, lotsPath, out } = prepare()
		expect(writeHandover({ lotsPath }).exitCode).toBe(0)
		writeFiles({ root, files: { 'src/read.ts': 'export function read() {\n\treturn 2\n}\n' } })

		expect(writeHandover({ lotsPath, argv: ['--rehash'] }).exitCode).toBe(0)

		const lines = readFileSync(join(out, 'commit.sh'), 'utf8').split('\n')
		expect(lines[1]).toBe(REEXEC_GUARD)
		expect(lines[2]).toMatch(/^# \d+ commit\(s\) on main in /)
	})

	it('the repository held by another hand-over → refused', () => {
		const { root, lotsPath, out } = prepare()
		expect(writeHandover({ lotsPath }).exitCode).toBe(0)
		const otherOut = temporaryFolder('dialecte-handover-')

		const result = writeHandover({ lotsPath, argv: ['--out', otherOut] })

		expect(result.exitCode).toBe(1)
		expect(result.output).toContain(join(out, 'commit.sh'))
		expect(result.output).toContain(join(root, '.git', 'dialecte-handover.lock'))
		expect(result.output).toMatch(RUN_THE_HANDOVER)
		expect(result.output).toContain(PERSON_WHO_RUNS_THE_REPOSITORY)
		expect(result.output).not.toMatch(TOUCH_THE_GIT_FOLDER)
	})

	it('a multi-line gates text → comment lines of the script header, never run', () => {
		const { lotsPath, out } = prepare({
			overrides: { gates: 'npm run check (219 tests)\ntouch INJECTED\n# and more' },
		})

		expect(writeHandover({ lotsPath }).exitCode).toBe(0)
		const header = readFileSync(join(out, 'commit.sh'), 'utf8').split('\n').slice(2, 8)
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

	it("its header comment carries the lots file's text as its notes: # Notes: <text>; none when the lots file has none", () => {
		const noted = prepare()
		const plain = prepare({ overrides: { gates: undefined } })
		expect(writeHandover({ lotsPath: noted.lotsPath }).exitCode).toBe(0)
		expect(writeHandover({ lotsPath: plain.lotsPath }).exitCode).toBe(0)

		const notedHeader = readFileSync(join(noted.out, 'commit.sh'), 'utf8').split('\n')
		const plainHeader = readFileSync(join(plain.out, 'commit.sh'), 'utf8').split('\n')

		expect({
			noted: notedHeader.filter((line) => /^# (Notes|Gates)\b/.test(line)),
			plain: plainHeader.filter((line) => /^# (Notes|Gates)\b/.test(line)),
		}).toEqual({ noted: ['# Notes: npm run check.'], plain: [] })
	})

	it('no cli installed in the repository → one line naming the repository and the fix, exit 1', () => {
		const { root, lotsPath, out } = prepare()
		expect(writeHandover({ lotsPath }).exitCode).toBe(0)

		const result = spawnSync('sh', [join(out, 'commit.sh')], { cwd: out, encoding: 'utf8' })

		expect(result.status).toBe(1)
		expect(result.stderr.trim().split('\n')).toEqual([
			`>> no @dialecte/cli with \`handover run\` installed in ${root}: npm install --save-dev @dialecte/cli@latest there, or run: node '${WRITER_CLI}' handover run '${realpathSync(out)}'`,
		])
		expect(git({ root, args: ['log', '--format=%s', '-1'] }).trim()).toBe('chore: start')
	})
})

describe('handover run', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('every guard green → one line each with its result and duration, then lot n/N, its commit and stat, the card; the lock released', async () => {
		const { root, lotsPath, out } = prepare()
		expect(writeHandover({ lotsPath }).exitCode).toBe(0)
		const lockPath = join(root, '.git', 'dialecte-handover.lock')
		// the lock's first line names the script (a later line names the writer)
		expect(readFileSync(lockPath, 'utf8').split('\n')[0]).toBe(join(realpathSync(out), 'commit.sh'))

		const result = await runFolder({ out })

		expect(result.exitCode).toBe(0)
		expect(result.lines.slice(1, 12)).toEqual([
			`✓ repository  ${root}  0.0 s`,
			'✓ lots        2 lot(s) as reviewed  0.0 s',
			'✓ hooks       git hooks folder  0.0 s',
			'✓ branch      main  0.0 s',
			expect.stringMatching(/^✓ head        [0-9a-f]{12}  0\.0 s$/),
			'✓ processes   none running in the worktree  0.0 s',
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
		expect(result.text).toMatch(
			/^│ [0-9a-f]{7} {2}1 file {2}\+3 −1 {2}feat\(read\): read answers one +│$/m,
		)
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

	it("husky's hooks folder, a wrapper for every hook name: no hook script of the package → silent, no hook line; its pre-commit script → hook ✓ and the log path", async () => {
		/** Husky's layout: `.husky/_/h` runs `.husky/<name>` when it exists, each wrapper hands over to it. */
		function installHusky(params: { root: string; preCommit?: string }): void {
			const { root } = params
			writeFiles({ root, files: { '.gitignore': '.husky/_\nnode_modules\n' } })
			git({ root, args: ['add', '.gitignore'] })
			git({ root, args: ['commit', '-q', '-m', 'chore: ignore the hooks folder'] })
			const runner = [
				'#!/usr/bin/env sh',
				'n=$(basename "$0")',
				's=$(dirname "$(dirname "$0")")/$n',
				'[ ! -f "$s" ] && exit 0',
				'sh -e "$s" "$@"',
				'',
			].join('\n')
			writeFiles({ root, files: { '.husky/_/h': runner } })
			for (const name of ['pre-commit', 'prepare-commit-msg', 'commit-msg', 'post-commit']) {
				writeFiles({
					root,
					files: { [`.husky/_/${name}`]: '#!/usr/bin/env sh\n. "$(dirname "$0")/h"\n' },
				})
				chmodSync(join(root, '.husky/_', name), 0o755)
			}
			if (params.preCommit !== undefined) {
				writeFiles({ root, files: { '.husky/pre-commit': `${params.preCommit}\n` } })
				git({ root, args: ['add', '.husky/pre-commit'] })
				git({ root, args: ['commit', '-q', '-m', 'chore: the pre-commit script'] })
			}
			git({ root, args: ['config', 'core.hooksPath', '.husky/_'] })
		}
		/** The hook lines printed between the first lot's start line and its commit line. */
		async function hookLinesOfRun(preCommit: string | undefined): Promise<string[]> {
			const { root, lotsPath, out } = prepare()
			installHusky({ root, preCommit })
			writeFileSync(
				lotsPath,
				JSON.stringify({ ...JSON.parse(readFileSync(lotsPath, 'utf8')), head: headOf(root) }),
			)
			expect(writeHandover({ lotsPath }).exitCode).toBe(0)
			const result = await runFolder({ out })
			expect(result.exitCode).toBe(0)
			const lotLine = result.lines.indexOf(`▶ ${LOT} 1/2  1 file(s)  feat(read): read answers one`)
			const commitLine = result.lines.findIndex(
				(line, index) => index > lotLine && /^✓ [0-9a-f]{12} /.test(line),
			)
			return result.lines
				.slice(lotLine + 1, commitLine)
				.map((line) => line.replace(/\/\S+$/, '<log>'))
		}

		const without = await hookLinesOfRun(undefined)
		const withScript = await hookLinesOfRun('true')

		expect({ without, withScript }).toEqual({
			without: [],
			withScript: ['  │ hook ✓', '  │ full log: <log>'],
		})
	})

	it('a hook printing lines and no npm header → one step hook: ▶ hook behind the prefix while it runs, then hook ✓ and the log path; its lines only in the log', async () => {
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
		const logPath = /full log: (\/\S+)/.exec(result.lines[lotLine + 3] ?? '')?.[1] ?? ''
		expect(result.lines.slice(lotLine + 1, lotLine + 3)).toEqual(['  │ ▶ hook', '  │ hook ✓'])
		expect(result.lines[lotLine + 3]).toBe(`  │ full log: ${logPath}`)
		expect(result.lines.some((line) => /checking the staged files|all good/.test(line))).toBe(false)
		expect(readFileSync(logPath, 'utf8').split('\n').sort()).toEqual([
			'',
			'all good',
			'checking the staged files',
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

	it('a real run → while its hook runs, the folder holds the run marker naming this process; once every lot is committed the marker is gone', async () => {
		const { root, lotsPath, out } = prepare()
		const seen = join(temporaryFolder('dialecte-seen-'), 'marker.json')
		installHook({
			root,
			script: `cat '${join(out, HANDOVER_RUN_MARKER_FILE)}' > '${seen}' 2>/dev/null; true`,
		})
		writeFileSync(
			lotsPath,
			JSON.stringify({ ...JSON.parse(readFileSync(lotsPath, 'utf8')), head: headOf(root) }),
		)
		expect(writeHandover({ lotsPath }).exitCode).toBe(0)

		const result = await runFolder({ out })

		expect(result.exitCode).toBe(0)
		expect(markerPid(readFileSync(seen, 'utf8'))).toBe(process.pid)
		expect(existsSync(join(out, HANDOVER_RUN_MARKER_FILE))).toBe(false)
	})

	it('a real run whose hook fails → the marker named this process while the hook ran, and is gone after the failure', async () => {
		const { root, lotsPath, out } = prepare()
		const seen = join(temporaryFolder('dialecte-seen-'), 'marker.json')
		installHook({
			root,
			script: `cat '${join(out, HANDOVER_RUN_MARKER_FILE)}' > '${seen}' 2>/dev/null; exit 1`,
		})
		writeFileSync(
			lotsPath,
			JSON.stringify({ ...JSON.parse(readFileSync(lotsPath, 'utf8')), head: headOf(root) }),
		)
		expect(writeHandover({ lotsPath }).exitCode).toBe(0)

		const result = await runFolder({ out })

		expect(result.exitCode).toBe(1)
		expect(markerPid(readFileSync(seen, 'utf8'))).toBe(process.pid)
		expect(existsSync(join(out, HANDOVER_RUN_MARKER_FILE))).toBe(false)
	})

	it('--probe → answers that this cli runs hand-overs, touches nothing', async () => {
		const lines: string[] = []

		const exitCode = await runHandoverRun({
			probe: noRepositoryCli,
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
		const logPath = /full log: (\/\S+)/.exec(result.text)?.[1] ?? ''
		expect(result.text).not.toMatch(/^ {2}│ hook in /m)
		expect(readFileSync(logPath, 'utf8')).toMatch(/^hook in .*dialecte-rehearse-/m)
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

	it('a lot holding a relative link to a folder → rehearsed with the link as it is, a hook reading it through the link commits', async () => {
		const { root, lotsPath, out } = prepare({
			files: { 'shared/skills/demo/SKILL.md': '# demo\n' },
			lots: [
				{ paths: ['shared/', 'agents/'], message: 'chore: shared skills and the link to them' },
			],
		})
		mkdirSync(join(root, 'agents'))
		symlinkSync('../shared/skills', join(root, 'agents', 'skills'), 'dir')
		installHook({
			root,
			script:
				'test "$(readlink agents/skills)" = ../shared/skills && test -f agents/skills/demo/SKILL.md',
		})
		writeFileSync(
			lotsPath,
			JSON.stringify({ ...JSON.parse(readFileSync(lotsPath, 'utf8')), head: headOf(root) }),
		)
		expect(writeHandover({ lotsPath }).exitCode).toBe(0)

		const result = await runFolder({ out, argv: ['--rehearse'] })

		expect(result.text).toContain('rehearsed: 1 commit(s) on main')
		expect(result.exitCode).toBe(0)
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
		const [folder] = readdirSync(scratchRoot).map((name) => join(scratchRoot, name))
		const clone = join(folder, basename(root))
		expect(result.text).toContain(`kept the rehearsal folder: ${folder}`)
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

describe(
	'handover run --rehearse: the rehearsal folder',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('the clone at <scratch root>/dialecte-rehearse-<random>/<repository folder name>; the hook runs with TMPDIR a short folder of the rehearsal folder beside the clone; everything removed after', async () => {
			const { root, lotsPath, out } = prepare()
			const seen = temporaryFolder('dialecte-seen-')
			installHook({
				root,
				script: `pwd -P > '${join(seen, 'pwd.txt')}'; printf '%s' "$TMPDIR" > '${join(seen, 'tmpdir.txt')}'; test -d "$TMPDIR"`,
			})
			writeFileSync(
				lotsPath,
				JSON.stringify({ ...JSON.parse(readFileSync(lotsPath, 'utf8')), head: headOf(root) }),
			)
			expect(writeHandover({ lotsPath }).exitCode).toBe(0)
			const scratchRoot = temporaryFolder('dialecte-scratch-root-')
			const realScratchRoot = realpathSync(scratchRoot)

			const result = await runFolder({ out, argv: ['--rehearse'], scratchRoot })

			const clone = relative(realScratchRoot, readFileSync(join(seen, 'pwd.txt'), 'utf8').trim())
			const hookTemporary = readFileSync(join(seen, 'tmpdir.txt'), 'utf8')
			const inRehearsal = relative(
				hookTemporary.startsWith(realScratchRoot) ? realScratchRoot : scratchRoot,
				hookTemporary,
			)
			const [rehearsal] = clone.split(sep)
			expect(result.exitCode).toBe(0)
			expect(clone.split(sep)).toEqual([
				expect.stringMatching(/^dialecte-rehearse-/),
				basename(root),
			])
			expect(inRehearsal.split(sep)).toEqual([rehearsal, expect.not.stringMatching(basename(root))])
			expect(inRehearsal.length).toBeLessThanOrEqual(40)
			expect(readdirSync(scratchRoot)).toEqual([])
		})

		it('a relative file: dependency leaving the repository (file:../core) → resolves from the clone as from the checkout: a hook reading ../core commits; the folder and its links removed after, their target untouched', async () => {
			const { family, out } = prepareWithSiblings({
				dependencies: { '@dialecte/core': 'file:../core' },
				hook: 'test "$(cat ../core/marker.txt)" = core',
			})
			const scratchRoot = temporaryFolder('dialecte-scratch-root-')

			const result = await runFolder({ out, argv: ['--rehearse'], scratchRoot })

			expect(result.exitCode).toBe(0)
			expect(result.text).toContain('rehearsed: 1 commit(s) on main')
			expect(readdirSync(scratchRoot)).toEqual([])
			expect(readFileSync(join(family, 'core', 'marker.txt'), 'utf8')).toBe('core\n')
		})

		it('--keep, file: and link: dependencies on siblings → the rehearsal folder kept, a link per sibling beside the clone reaching the folder the same path reaches from the repository', async () => {
			const { family, root, out } = prepareWithSiblings({
				dependencies: { '@dialecte/core': 'file:../core', '@dialecte/scl': 'link:../scl' },
				hook: 'true',
			})
			const scratchRoot = temporaryFolder('dialecte-scratch-root-')

			const result = await runFolder({ out, argv: ['--rehearse', '--keep'], scratchRoot })

			expect(result.exitCode).toBe(0)
			const [folder] = readdirSync(scratchRoot).map((name) => join(scratchRoot, name))
			expect(
				readdirSync(folder)
					.filter((name) => name !== basename(root))
					.sort(),
			).toEqual(expect.arrayContaining(['core', 'scl']))
			expect(
				['core', 'scl'].map((name) => ({
					name,
					link: lstatSync(join(folder, name)).isSymbolicLink(),
					reaches: realpathSync(join(folder, name)),
				})),
			).toEqual([
				{ name: 'core', link: true, reaches: realpathSync(join(family, 'core')) },
				{ name: 'scl', link: true, reaches: realpathSync(join(family, 'scl')) },
			])
		})

		it('a file: dependency whose path leaves the rehearsal folder (file:../../far) → no link made, a line naming it; the rehearsal goes on', async () => {
			const { out } = prepareWithSiblings({
				dependencies: { far: 'file:../../far' },
				hook: 'true',
			})
			const scratchRoot = temporaryFolder('dialecte-scratch-root-')

			const result = await runFolder({ out, argv: ['--rehearse'], scratchRoot })

			expect(result.exitCode).toBe(0)
			expect(result.lines.filter((line) => line.includes('../../far'))).toHaveLength(1)
			expect(readdirSync(scratchRoot)).toEqual([])
		})
	},
)

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
			stdio: ['ignore', 'pipe', 'ignore'],
		})
		let output = ''
		run.stdout.on('data', function keep(chunk: Buffer) {
			output += chunk.toString()
		})
		const exited = new Promise<number | null>((resolveExit) => run.on('exit', resolveExit))
		await waitFor({ check: () => existsSync(childPidFile), bound: 30_000 })
		const childPid = Number(readFileSync(childPidFile, 'utf8').trim())
		run.kill('SIGINT')
		const exitCode = await exited
		const folder = announcedRehearsalFolder(output)

		expect(exitCode).not.toBe(0)
		expect(['/tmp', realpathSync('/tmp')]).toContain(folder && dirname(folder))
		expect(folder && existsSync(folder)).toBe(false)
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
				stdio: ['ignore', 'pipe', 'ignore'],
			})
			let output = ''
			run.stdout.on('data', function keep(chunk: Buffer) {
				output += chunk.toString()
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
			const folder = announcedRehearsalFolder(output)

			expect(alive).toEqual([])
			expect(folder).toBeDefined()
			expect(folder && existsSync(folder)).toBe(false)
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
			const written: string[] = []
			removeHookLogs({ lines: written })
			function record(line: string): void {
				lines.push({ line, hookBegan: existsSync(join(root, 'hook-ran')) })
				written.push(line)
			}

			const exitCode = await runHandoverRun({
				probe: noRepositoryCli,
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
			removeHookLogs({ lines: terminal.written })

			const exitCode = await runHandoverRun({
				probe: noRepositoryCli,
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
	it('the HEAD line shows the base and the new tip, and that nothing is pushed', async () => {
		const { root, out } = prepareWithHook('true')
		const base = headOf(root)

		const result = await runFolder({ out })

		const tip = headOf(root)
		expect(sectionLines({ output: result.text, name: 'commit' }).slice(-2)).toEqual([
			`HEAD ${base.slice(0, 7)} → ${tip.slice(0, 7)} · nothing pushed`,
			`worktree ${basename(root)}`,
		])
	})

	it('the notes are for the person about to run: the rehearsal card keeps them; the card a real run prints after committing every lot has no notes section', async () => {
		const { out } = prepareWithHook('true')

		const rehearsed = await runFolder({ out, argv: ['--rehearse'] })
		const run = await runFolder({ out })

		expect(rehearsed.exitCode).toBe(0)
		expect(sectionLines({ output: rehearsed.text, name: 'notes' })).toEqual(['npm run check'])
		expect(run.exitCode).toBe(0)
		expect(boxLines(run.text).filter((line) => line.startsWith('├─ notes '))).toEqual([])
		expect(boxLines(run.text).some((line) => line.startsWith('├─ gates '))).toBe(true)
	})

	it('a real run whose second commit fails (one lot of two committed) → the card after it has no notes section', async () => {
		const { root, lotsPath, out } = prepare()
		installHook({
			root,
			script: 'git diff --cached --name-only | grep -q CHANGELOG.md && exit 1; exit 0',
		})
		writeFileSync(
			lotsPath,
			JSON.stringify({ ...JSON.parse(readFileSync(lotsPath, 'utf8')), head: headOf(root) }),
		)
		expect(writeHandover({ lotsPath }).exitCode).toBe(0)

		const result = await runFolder({ out })

		expect(result.exitCode).toBe(1)
		expect(subjectsOf({ root, count: 1 })).toEqual(['feat(read): read answers one'])
		expect(boxLines(result.text).filter((line) => line.startsWith('├─ notes '))).toEqual([])
		expect(boxLines(result.text).some((line) => line.startsWith('├─ gates '))).toBe(true)
	})

	it('a real run whose only commit fails (no lot committed) → the card after it has no notes section', async () => {
		const { out } = prepareWithHook('exit 1')

		const result = await runFolder({ out })

		expect(result.exitCode).toBe(1)
		expect(boxLines(result.text).filter((line) => line.startsWith('├─ notes '))).toEqual([])
		expect(boxLines(result.text).some((line) => line.startsWith('├─ gates '))).toBe(true)
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

		const lackingCard = writeHandover({ lotsPath: lacking.lotsPath, probe: probeRepositoryCli })
			.output.split('\n')
			.at(-1)
		const havingCard = writeHandover({ lotsPath: having.lotsPath, probe: probeRepositoryCli })
			.output.split('\n')
			.at(-1)
		// the card's own wait for the repository's cli: a loaded machine must not read as "no repository cli"
		expect(HANDOVER_PROBE_TIMEOUT_MILLISECONDS).toBe(DEFAULT_PROBE_TIMEOUT_MILLISECONDS)

		expect(lackingCard).toBe(`node '${WRITER_CLI}' handover run '${realpathSync(lacking.out)}'`)
		expect(havingCard).toBe(`cd '${realpathSync(having.out)}' && bash commit.sh`)
	})

	it('the probe given to runHandover is the one the card uses → a probe answering true: the run line is bash commit.sh, asked once, for the repository', () => {
		const { root, lotsPath, out } = prepare()
		const asked = recordingProbe({ answer: true })

		const result = writeHandover({ lotsPath, probe: asked.probe })

		expect(result.output.split('\n').at(-1)).toBe(`cd '${realpathSync(out)}' && bash commit.sh`)
		expect(asked.calls).toEqual([{ root, timeout: DEFAULT_PROBE_TIMEOUT_MILLISECONDS }])
	})

	it('the probe given to runHandover is the one the card uses → a probe answering false: the run line is the writer cli, asked once', () => {
		const { root, lotsPath, out } = prepare()
		const asked = recordingProbe({ answer: false })

		const result = writeHandover({ lotsPath, probe: asked.probe })

		expect(result.output.split('\n').at(-1)).toBe(
			`node '${WRITER_CLI}' handover run '${realpathSync(out)}'`,
		)
		expect(asked.calls).toEqual([{ root, timeout: DEFAULT_PROBE_TIMEOUT_MILLISECONDS }])
	})

	it('--rehash passes its probe to the card too → the rewritten card follows the probe, asked once', () => {
		const { lotsPath, out } = prepare()
		expect(writeHandover({ lotsPath }).exitCode).toBe(0)
		const asked = recordingProbe({ answer: true })

		const result = writeHandover({ lotsPath, argv: ['--rehash'], probe: asked.probe })

		expect(result.output.split('\n').at(-1)).toBe(`cd '${realpathSync(out)}' && bash commit.sh`)
		expect(asked.calls).toHaveLength(1)
	})

	it('handover run --rehearse given a probe → the card of the rehearsal follows its answer, asked once', async () => {
		const { root, lotsPath, out } = prepare()
		expect(writeHandover({ lotsPath }).exitCode).toBe(0)
		const yes = recordingProbe({ answer: true })
		const no = recordingProbe({ answer: false })

		const answeredYes = await runFolder({ out, argv: ['--rehearse'], probe: yes.probe })
		const answeredNo = await runFolder({ out, argv: ['--rehearse'], probe: no.probe })

		expect(answeredYes.lines).toContain(`cd '${out}' && bash commit.sh`)
		expect(yes.calls).toEqual([{ root, timeout: DEFAULT_PROBE_TIMEOUT_MILLISECONDS }])
		expect(answeredNo.lines.some((line) => /^node '.+' handover run /.test(line))).toBe(true)
		expect(answeredNo.lines).not.toContain(`cd '${out}' && bash commit.sh`)
		expect(no.calls).toEqual([{ root, timeout: DEFAULT_PROBE_TIMEOUT_MILLISECONDS }])
	})

	it('a real handover run that stops on a failing hook, given a probe → its card follows the probe answer, asked once', async () => {
		const { root, out } = prepareWithHook('exit 1')
		const asked = recordingProbe({ answer: true })

		const result = await runFolder({ out, probe: asked.probe })

		expect(result.exitCode).toBe(1)
		expect(result.lines).toContain(`cd '${out}' && bash commit.sh`)
		expect(asked.calls).toEqual([{ root, timeout: DEFAULT_PROBE_TIMEOUT_MILLISECONDS }])
	})
})

const HOOK_LINES = Array.from({ length: 30 }, (_unused, index) => `line ${index + 1}`)
const PRINT_30_LINES = 'i=1; while [ $i -le 30 ]; do echo "line $i"; i=$((i+1)); done'
/** A lint warning as oxlint prints it into a pipe. */
const HOOK_WARNING =
	'src/read.ts:1:7: warning eslint(no-unused-vars): Variable unused is declared but never used.'
/** 30 ordinary lines, the lint warning after the fifteenth. */
const PRINT_30_LINES_WITH_WARNING = `i=1; while [ $i -le 30 ]; do echo "line $i"; [ $i -eq 15 ] && echo "${HOOK_WARNING}"; i=$((i+1)); done`
const SPINNER = /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] /

/** `handover run` of the folder through the given live output (every line goes to its writeLine too). */
function runLive(params: {
	out: string
	live: LiveOutput
	write?: (line: string) => void
	clock?: Clock
}): Promise<number> {
	const lines: string[] = []
	removeHookLogs({ lines })
	/** `write`, every line kept for the hook logs it names. */
	function recording(write: (line: string) => void): (line: string) => void {
		return function recordLine(line) {
			lines.push(line)
			write(line)
		}
	}
	const live = { ...params.live, writeLine: recording(params.live.writeLine) }
	return runHandoverRun({
		probe: noRepositoryCli,
		argv: [params.out],
		write: params.write ? recording(params.write) : live.writeLine,
		clock: params.clock ?? createFakeClock(),
		colour: false,
		scratchRoot: temporaryFolder('dialecte-scratch-root-'),
		live,
		spawner: createRecordingSpawner().spawner,
	})
}

describe(
	'handover run: hook output is never buffered',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('off a terminal, a hook succeeding → its step line streams as it comes (the hook waits for it to be seen), then its warning line only; then the summary, the warning and the full log path; the log holds every line', async () => {
			const flag = join(temporaryFolder('dialecte-flag-'), 'seen')
			const { out } = prepareWithHook(
				`echo ""; echo "> demo@1.0.0 lint:check"; echo "> oxlint"; i=0; while [ ! -f '${flag}' ] && [ $i -lt 100 ]; do sleep 0.1; i=$((i+1)); done; [ -f '${flag}' ] || exit 1; ${PRINT_30_LINES_WITH_WARNING}`,
			)
			const written: string[] = []
			function record(line: string): void {
				written.push(line)
				if (line === '  │ ▶ lint:check') writeFileSync(flag, '1')
			}

			const exitCode = await runLive({
				out,
				write: record,
				live: { tty: false, writeLine: record, rewriteLines: () => undefined },
			})

			const logLine = written.findIndex((line) => /full log: \//.test(line))
			const logPath = /full log: (\/\S+)/.exec(written[logLine] ?? '')?.[1] ?? ''
			expect(exitCode).toBe(0)
			expect(written.filter((line) => line.startsWith('  │ '))).toEqual([
				'  │ ▶ lint:check',
				`  │ [lint:check] ${HOOK_WARNING}`,
				'  │ lint:check ✓ · 1 lint warning in lint:check',
				`  │ [lint:check] ${HOOK_WARNING}`,
				`  │ full log: ${logPath}`,
			])
			expect(readFileSync(logPath, 'utf8').split('\n')).toEqual(
				expect.arrayContaining([...HOOK_LINES, HOOK_WARNING]),
			)
		})

		it('on a terminal, a hook succeeding → under the spinner only its step and its warning line, never an ordinary line; afterwards the summary, the warning and the log path sit before the commit line, no other hook line', async () => {
			const flag = join(temporaryFolder('dialecte-flag-'), 'seen')
			const { out } = prepareWithHook(
				`echo ""; echo "> demo@1.0.0 lint:check"; echo "> oxlint"; i=0; while [ ! -f '${flag}' ] && [ $i -lt 100 ]; do sleep 0.1; i=$((i+1)); done; [ -f '${flag}' ] || exit 1; ${PRINT_30_LINES_WITH_WARNING}`,
			)
			const terminal = createFakeTerminal({ tty: true })
			const draw = terminal.output.rewriteLines
			const live: LiveOutput = {
				...terminal.output,
				rewriteLines(lines) {
					draw(lines)
					if (lines.includes('  │ ▶ lint:check 0.0 s')) writeFileSync(flag, '1')
				},
			}

			const exitCode = await runLive({ out, live, write: terminal.output.writeLine })

			const screen = terminal.screen()
			const summary = screen.indexOf('  │ lint:check ✓ · 1 lint warning in lint:check')
			const logPath = /full log: (\/\S+)/.exec(screen[summary + 2] ?? '')?.[1] ?? ''
			expect(exitCode).toBe(0)
			expect(
				terminal.rewrites.some((region) => region.includes(`  │ [lint:check] ${HOOK_WARNING}`)),
			).toBe(true)
			expect(
				terminal.rewrites.some((region) => region.some((line) => /^ {2}│ line \d+$/.test(line))),
			).toBe(false)
			expect(terminal.rewrites.every((region) => SPINNER.test(region[0]))).toBe(true)
			expect(terminal.written.filter((line) => line.startsWith('  │ '))).toEqual([
				'  │ lint:check ✓ · 1 lint warning in lint:check',
				`  │ [lint:check] ${HOOK_WARNING}`,
				`  │ full log: ${logPath}`,
			])
			expect(screen[summary + 3]).toMatch(/^✓ [0-9a-f]{12} feat\(read\)/)
			expect(readFileSync(logPath, 'utf8').split('\n')).toEqual(
				expect.arrayContaining([...HOOK_LINES, HOOK_WARNING]),
			)
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

	it('an injected width of 40 → no card line is wider; the cli off a terminal without $COLUMNS → 80 columns, the long notes wrapped, no word lost', () => {
		const wrapped = prepare({ overrides: { gates: LONG_GATES } })
		const plain = prepare({ overrides: { gates: LONG_GATES } })

		const narrow = writeHandover({ lotsPath: wrapped.lotsPath, columns: 40 })
		const offTerminal = runCli({ argv: ['handover', plain.lotsPath] })

		expect(cardLines(narrow.output).filter((line) => line.length > 40)).toEqual([])
		expect(offTerminal.exitCode).toBe(0)
		expect(cardLines(offTerminal.output).filter((line) => line.length > 80)).toEqual([])
		expect(
			sectionLines({ output: offTerminal.output, name: 'notes' })
				.map((text) => text.trim())
				.join(' '),
		).toBe(LONG_GATES)
	})

	it("a width of 40 → the footer's text, too long for its rule, printed in the box above a plain bottom rule: the legend pointer kept", () => {
		const { lotsPath } = prepare()

		const box = writeHandover({ lotsPath, columns: 40 })
			.output.split('\n')
			.filter((line) => /^[┌├│└]/.test(line))

		const bottom = box.length - 1
		const plainRule = box.lastIndexOf(`├${'─'.repeat(38)}┤`)
		expect({
			bottom: box[bottom],
			footer: box
				.slice(plainRule + 1, bottom)
				.map((line) => line.slice(2, -2).trim())
				.join(' '),
		}).toEqual({
			bottom: `└${'─'.repeat(38)}┘`,
			footer:
				'dialecte handover show 2026-11-04-main · run 2026-11-04-main · --legend · details: dialecte tdd status',
		})
	})

	for (const columns of [40, 100])
		it(`a width of ${columns} → the run command stays whole on one line (copyable), outside the wrapped box`, () => {
			const { lotsPath, out } = prepare({ overrides: { gates: LONG_GATES } })
			// Its name alone is as wide as the card: the command is wider, however short the tmp path.
			const folder = join(out, 'hand-over-'.padEnd(columns, 'x'))
			mkdirSync(folder)

			const result = writeHandover({ lotsPath, argv: ['--out', folder], columns })

			const command = `node '${WRITER_CLI}' handover run '${realpathSync(folder)}'`
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
			`echo ""; echo "> demo@1.0.0 ${marker}"; echo "> true"; i=0; while [ ! -f '${flag}' ] && [ $i -lt 100 ]; do sleep 0.1; i=$((i+1)); done; [ -f '${flag}' ] || exit 1`,
		)
		process.env.TMPDIR = hookTemporary
		let logsMidRun: string[] = []
		function record(line: string): void {
			if (line === `  │ ▶ ${marker}`) {
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
		const { out } = prepareWithHook(
			String.raw`printf 'src/a.ts:1:1: warning eslint(no-console): \342\202'; sleep 0.3; printf '\254\n'`,
		)
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
		expect(
			written.filter((line) => line === '  │ [hook] src/a.ts:1:1: warning eslint(no-console): €'),
		).toHaveLength(2)
		expect(written).toContain('  │ hook ✓ · 1 lint warning in hook')
		expect(written.some((line) => line.includes('�'))).toBe(false)
		expect(readFileSync(logPath, 'utf8')).toBe('src/a.ts:1:1: warning eslint(no-console): €\n')
	})
})

describe('handover: the card run command', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('the command is once in full on its own line, under the box; the box holds no run row', () => {
		const { lotsPath, out } = prepare()

		const result = writeHandover({ lotsPath })

		const lines = result.output.split('\n')
		const command = `node '${WRITER_CLI}' handover run '${realpathSync(out)}'`
		const box = lines.filter((line) => /^[┌│└]/.test(line))
		expect(lines.filter((line) => line === command)).toHaveLength(1)
		expect(box.filter((line) => /^│ (run|see below)\b/.test(line))).toEqual([])
		expect(lines.indexOf(command)).toBeGreaterThan(lines.indexOf(box.at(-1) ?? ''))
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
				'node_modules/@dialecte/cli/cli.js': `#!/bin/sh\nexec sleep ${HANGING_CLI_SLEEP_SECONDS}\n`,
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
		const result = writeHandover({ lotsPath, probeTimeout: 300, probe: probeRepositoryCli })
		const elapsed = Date.now() - startedAt

		expect(elapsed).toBeLessThan(HANGING_PROBE_ELAPSED_BOUND_MS)
		expect(result.output.split('\n')).toContain(
			`node '${WRITER_CLI}' handover run '${realpathSync(out)}'`,
		)
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
		it('the verdict says DONE with the gates tail (no gate record: 1 gate failed) and the command is not repeated; a hand-over not run yet still shows the command', async () => {
			const { lotsPath, out } = prepare()

			const pending = writeHandover({ lotsPath })
			const ran = await runFolder({ out })

			expect(pending.output).toMatch(/handover run '|bash commit\.sh/)
			expect(ran.exitCode).toBe(0)
			expect(verdictLines(ran.text)).toEqual([
				'DONE  2 lots · 2 files · +6 −1 · 1 gate failed: gate',
			])
			expect(ran.lines.some((line) => /handover run '|bash commit\.sh/.test(line))).toBe(false)
		})

		it('a hook refusing the second of two lots → the hand-over is partly committed: the first lot committed, the second pending, HEAD base → tip; the card still shows the run command', async () => {
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
			const base = headOf(root)

			const ran = await runFolder({ out })

			expect(ran.exitCode).toBe(1)
			const tip = headOf(root)
			expect(sectionLines({ output: ran.text, name: 'commit' })).toEqual([
				`${tip.slice(0, 7)}  1 file  +3 −1  feat(read): read answers one`,
				'pending  1 file  +3 −0  docs(changelog): read',
				`HEAD ${base.slice(0, 7)} → ${tip.slice(0, 7)} · nothing pushed`,
				`worktree ${basename(root)}`,
			])
			expect(ran.lines.some((line) => /handover run '|bash commit\.sh/.test(line))).toBe(true)
		})

		it('run again when every lot is committed already → the verdict still says DONE', async () => {
			const { lotsPath, out } = prepare()
			expect(writeHandover({ lotsPath }).exitCode).toBe(0)
			await runFolder({ out })

			const again = await runFolder({ out })

			expect(again.exitCode).toBe(0)
			expect(verdictLines(again.text)[0]).toMatch(/^DONE {2}2 lots · /)
		})

		it('every lot committed on HEAD as reviewed, the working tree edited since (a later edit, a new file) → run says the hand-over is already committed, exit 0, no guard failed, no commit added', async () => {
			const { root, lotsPath, out } = prepare()
			expect(writeHandover({ lotsPath }).exitCode).toBe(0)
			await runFolder({ out })
			const committed = headOf(root)
			writeFiles({
				root,
				files: {
					'src/read.ts': 'export function read() {\n\treturn 2\n}\n',
					'src/later.ts': 'export {}\n',
				},
			})

			const again = await runFolder({ out })

			expect(again.exitCode).toBe(0)
			expect(again.text).toMatch(/already committed/)
			expect(again.text).not.toMatch(/^✗/m)
			expect(again.text).not.toMatch(/^[✓!✗] (snapshot|deleted|outside) /m)
			expect(headOf(root)).toBe(committed)
		})

		it('a lot committed by hand with other bytes than the reviewed ones, the working tree edited to match them → the head guard refuses it: other content than the reviewed files', async () => {
			const { root, lotsPath, out } = prepare()
			expect(writeHandover({ lotsPath }).exitCode).toBe(0)
			writeFiles({ root, files: { 'src/read.ts': 'export function read() {\n\treturn 2\n}\n' } })
			git({ root, args: ['add', '--', 'src/'] })
			git({ root, args: ['commit', '-q', '-m', 'feat(read): read answers one\n\nThe body.'] })

			const result = await runFolder({ out })

			expect(result.exitCode).toBe(1)
			expect(result.text).toMatch(/^✗ head +something else is on top of [0-9a-f]{12}/m)
			expect(result.text).toContain(`is not ${LOT} 1: other content than the reviewed files`)
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
		expect(tddRowLines(result.text)).toEqual(['1 accepted', '  1  pins existing behaviour'])
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

describe('handover: the gates from records', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	/**
	 * The card's gate lines, wherever its layout puts them: `<mark> <name> <detail>`, the box, a row label
	 * and the padding left out, runs of spaces as one.
	 */
	function gateLinesOf(output: string): string[] {
		return output.split('\n').flatMap(function gateLine(line) {
			const match = /^│\s+(?:gates\s+)?([✓!✗] \S.*?)\s*│$/.exec(line)
			return match ? [match[1].replace(/ {2,}/g, ' ')] : []
		})
	}

	const NO_VITEST = '! tdd not run here (the package does not test with vitest)'

	it('a fast gate run on this tree → one line per recorded step with its counts, no rules line, no findings ledger, the standard line', async () => {
		const { root, lotsPath } = prepare({
			committed: gatedPackage({
				scripts: { 'skills:check': 'true' },
				fast: [
					{ name: 'check', run: `printf ' Tests  1056 passed | 4 skipped (1060)\\n'` },
					{ name: 'tests', run: `printf ' Tests  397 passed (397)\\n'`, counts: 'tests' },
					{ name: 'build', run: 'true' },
					{ name: 'skills', run: 'npm run skills:check' },
				],
			}),
		})
		await runGateIn({ root, argv: [] })
		runRules({ cwd: root, argv: [] })

		const result = writeHandover({ lotsPath })

		expect(gateLinesOf(result.output).sort()).toEqual(
			[
				NO_VITEST,
				'✓ check 1056 passed · 4 skipped',
				'✓ tests 397/397',
				'✓ build',
				'✓ skills',
				'! review no findings ledger',
				'! standard not consulted: none configured (DIALECTE_STANDARD)',
			].sort(),
		)
	})

	it('no gate record → ✗ gate never run on this tree, no rules line', () => {
		const { lotsPath } = prepare({ committed: gatedPackage({ fast: [] }) })

		const result = writeHandover({ lotsPath })

		expect(gateLinesOf(result.output).sort()).toEqual(
			[
				'✗ gate never run on this tree',
				'! review no findings ledger',
				'! standard not consulted: none configured (DIALECTE_STANDARD)',
			].sort(),
		)
	})

	it('a step failing → ✗ on its line; the steps after it ! not run (an earlier step failed)', async () => {
		const { root, lotsPath } = prepare({
			committed: gatedPackage({
				fast: [
					{ name: 'check', run: 'exit 3' },
					{ name: 'build', run: 'true' },
				],
			}),
		})
		await runGateIn({ root, argv: [] })

		const lines = gateLinesOf(writeHandover({ lotsPath }).output)

		expect(lines.filter((line) => /^[✓!✗] (check|build)\b/.test(line))).toEqual([
			expect.stringMatching(/^✗ check\b/),
			'! build not run (an earlier step failed)',
		])
	})

	for (const row of [
		{ edited: 'src/read.ts', changedSince: true },
		{ edited: '.dialecte/lot.json', changedSince: false },
	])
		it(`${row.edited} written after the gate → ${row.changedSince ? 'each line ! with (the tree changed since)' : 'the lines as recorded (.dialecte/ is no part of the tree)'}`, async () => {
			const { root, lotsPath } = prepare({
				committed: gatedPackage({
					fast: [{ name: 'check', run: `printf ' Tests  4 passed (4)\\n'` }],
				}),
			})
			await runGateIn({ root, argv: [] })
			runRules({ cwd: root, argv: [] })
			writeFiles({
				root,
				files: {
					[row.edited]: row.changedSince ? 'export function read() {\n\treturn 2\n}\n' : '{}\n',
				},
			})

			const lines = gateLinesOf(writeHandover({ lotsPath }).output)

			expect(lines.filter((line) => /^[✓!✗] (check|rules|tdd)\b/.test(line)).sort()).toEqual(
				(row.changedSince
					? ['! check 4/4 (the tree changed since)', `${NO_VITEST} (the tree changed since)`]
					: ['✓ check 4/4', NO_VITEST]
				).sort(),
			)
		})

	it('every gate line ✓ or a ! of this tree (a step not run here, no findings ledger) → READY with the size and all gates green; no declarations, no second line', async () => {
		const { root, lotsPath } = prepare({
			committed: gatedPackage({
				fast: [{ name: 'check', run: `printf ' Tests  4 passed (4)\\n'` }],
			}),
		})
		await runGateIn({ root, argv: [] })
		runRules({ cwd: root, argv: [] })

		const output = writeHandover({ lotsPath }).output

		expect(gateLinesOf(output)).toEqual(
			expect.arrayContaining([NO_VITEST, '! review no findings ledger']),
		)
		expect(verdictLines(output)).toEqual(['READY  2 lots · 2 files · +6 −1 · all gates green'])
	})

	it('no gate record → BLOCKED, the failed count and the name in place of all gates green', () => {
		const { lotsPath } = prepare({ committed: gatedPackage({ fast: [] }) })

		const output = writeHandover({ lotsPath }).output

		expect(verdictLines(output)).toEqual([
			'BLOCKED  2 lots · 2 files · +6 −1 · 1 gate failed: gate',
		])
	})

	it('passing steps recorded on another tree → BLOCKED: gates ran on another tree, naming each in card order', async () => {
		const { root, lotsPath } = prepare({
			committed: gatedPackage({
				fast: [{ name: 'check', run: `printf ' Tests  4 passed (4)\\n'` }],
			}),
		})
		await runGateIn({ root, argv: [] })
		runRules({ cwd: root, argv: [] })
		writeFiles({ root, files: { 'src/read.ts': 'export function read() {\n\treturn 2\n}\n' } })

		const output = writeHandover({ lotsPath }).output

		expect(verdictLines(output)).toEqual([
			'BLOCKED  2 lots · 2 files · +6 −1 · gates ran on another tree: tdd, check',
		])
	})

	it('a failed step recorded on another tree → stays ✗ with (the tree changed since); the verdict names it failed, then the other-tree step', async () => {
		const { root, lotsPath } = prepare({
			committed: gatedPackage({ fast: [{ name: 'check', run: 'exit 3' }] }),
		})
		await runGateIn({ root, argv: [] })
		writeFiles({ root, files: { 'src/read.ts': 'export function read() {\n\treturn 2\n}\n' } })

		const output = writeHandover({ lotsPath }).output

		expect(gateLinesOf(output).filter((line) => /^[✓!✗] check\b/.test(line))).toEqual([
			'✗ check exit 3 (the tree changed since)',
		])
		expect(verdictLines(output)).toEqual([
			'BLOCKED  2 lots · 2 files · +6 −1 · 1 gate failed: check · gates ran on another tree: tdd',
		])
	})

	for (const row of [
		{ order: ['--fast', '--full'], check: '✓ check 5/5' },
		{ order: ['--full', '--fast'], check: '✓ check 4/4' },
	])
		it(`gate ${row.order.join(' then gate ')}: a step both modes run → from the later record (${row.check}); a step only one mode runs → from that mode's record`, async () => {
			const { root, lotsPath } = prepare({
				committed: gatedPackage({
					scripts: { 'skills:check': 'true' },
					fast: [
						{ name: 'check', run: `printf ' Tests  4 passed (4)\\n'` },
						{ name: 'skills', run: 'npm run skills:check' },
					],
					full: [
						{ name: 'check', run: `printf ' Tests  5 passed (5)\\n'` },
						{ name: 'build', run: 'true' },
					],
				}),
			})
			for (const mode of row.order) await runGateIn({ root, argv: [mode] })

			const lines = gateLinesOf(writeHandover({ lotsPath }).output)

			expect(lines.filter((line) => /^[✓!✗] (check|build|skills)\b/.test(line)).sort()).toEqual(
				[row.check, '✓ build', '✓ skills'].sort(),
			)
		})

	it('the rules run on this tree with errors → the card of a consumer holds no rules line', () => {
		const { root, lotsPath } = prepare({
			files: {
				'src/read.ts':
					'export function read() {\n\tconst write = () => 2\n\tconst make = () => 3\n}\n',
				'CHANGELOG.md': '# Changelog\n\n- read\n',
			},
		})
		runRules({ cwd: root, argv: [] })

		const lines = gateLinesOf(writeHandover({ lotsPath }).output)

		expect(lines.filter((line) => /^[✓!✗] rules\b/.test(line))).toEqual([])
	})

	for (const row of [
		{
			name: 'every row closed (fixed, accepted, logged), rows up to round 2, a round-3 snapshot',
			rows: [
				'| R1-1 | 1 | blocking | src/read.ts:1 | reads nothing | fixed 2 |',
				'| R1-2 | 1 | nit | src/read.ts:2 | a long name | accepted (the name is the domain word) |',
				'| R2-1 | 2 | should fix | src/read.ts:3 | no test of the empty case | logged (the next lot) |',
			],
			snapshots: [3],
			line: '✓ review 3 rounds · approved · findings ledger',
		},
		{
			name: 'every row closed, rows up to round 3, a round-2 snapshot',
			rows: [
				'| R1-1 | 1 | blocking | src/read.ts:1 | reads nothing | fixed 2 |',
				'| R3-1 | 3 | nit | src/read.ts:2 | a long name | fixed 3 |',
			],
			snapshots: [2],
			line: '✓ review 3 rounds · approved · findings ledger',
		},
		{
			name: 'only a nit open',
			rows: [
				'| R1-1 | 1 | blocking | src/read.ts:1 | reads nothing | fixed 2 |',
				'| R2-1 | 2 | nit | src/read.ts:2 | a long name | open |',
			],
			snapshots: [],
			line: '! review 2 rounds · 1 nit open',
		},
		{
			name: 'a blocking row open, a should-fix row to verify, a nit open',
			rows: [
				'| R1-1 | 1 | blocking | src/read.ts:1 | reads nothing | open |',
				'| R1-2 | 1 | should fix | src/read.ts:2 | no test of the empty case | fix to verify |',
				'| R1-3 | 1 | nit | src/read.ts:3 | a long name | open |',
			],
			snapshots: [2],
			line: '✗ review 2 rounds · 2 open: blocking or should fix',
		},
		{
			name: 'no row yet (the reviewer has not answered), a round-1 snapshot',
			rows: [],
			snapshots: [1],
			line: '! review 1 round · no findings recorded',
		},
		{
			name: 'no row and no snapshot',
			rows: [],
			snapshots: [],
			line: '! review 0 rounds · no findings recorded',
		},
	])
		it(`a findings ledger with ${row.name} → ${row.line}`, () => {
			const { lotsPath, out } = prepare({ committed: gatedPackage({ fast: [] }) })
			writeFileSync(
				join(out, 'findings-ledger.md'),
				[
					'# Findings ledger - demo',
					'',
					'| id | round | severity | file:line | finding | state |',
					'|---|---|---|---|---|---|',
					...row.rows,
					'',
				].join('\n'),
			)
			for (const round of row.snapshots)
				mkdirSync(join(out, `round-${round}`, 'src'), { recursive: true })

			const lines = gateLinesOf(writeHandover({ lotsPath }).output)

			expect(lines.filter((line) => /^[✓!✗] review\b/.test(line))).toEqual([row.line])
		})

	it('a lots file without gates text → no notes in the card nor in its data', () => {
		const { lotsPath } = prepare({ overrides: { gates: undefined } })

		const text = writeHandover({ lotsPath })
		const data = JSON.parse(writeHandover({ lotsPath, argv: ['--json', '--rehash'] }).output)

		expect(text.output).not.toMatch(/\bnotes\b/)
		expect(data).not.toHaveProperty('notes')
		expect(data.gates).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'gate' })]))
	})
})

describe('handover: the card layout', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	/**
	 * The card's lines with what changes from one run to the next replaced by fixed text of the same
	 * length: the repository folder's name (`dialecte-scratch-` and 6 random characters), HEAD (`aaaaaaa`)
	 * and the merged tip (`bbbbbbb`), each as the card writes a sha (7 characters).
	 */
	function maskVolatile(params: {
		lines: string[]
		root: string
		head: string
		tip: string
	}): string[] {
		return params.lines.map((line) =>
			line
				.replaceAll(basename(params.root), 'dialecte-scratch-XXXXXX')
				.replaceAll(params.head.slice(0, 7), 'aaaaaaa')
				.replaceAll(params.tip.slice(0, 7), 'bbbbbbb'),
		)
	}

	/** The escape byte that opens an ANSI sequence. */
	const ESCAPE = String.fromCharCode(27)

	/** `text` between the ANSI code `open` and its reset (`close`, or the full reset 0), then `after`. */
	function styledText(params: {
		output: string
		open: number
		text: string
		close: number
		after: string
	}): boolean {
		return [params.close, 0].some((close) =>
			params.output.includes(
				`${ESCAPE}[${params.open}m${params.text}${ESCAPE}[${close}m${params.after}`,
			),
		)
	}

	/** The output with every `ESC [ <n> m` sequence left out. */
	function withoutEscapes(output: string): string {
		return output
			.split(ESCAPE)
			.map((part, index) => (index === 0 ? part : part.replace(/^\[\d+m/, '')))
			.join('')
	}

	it('a full card at 80 columns → the verdict and the declarations to read, then the commit, gates, tdd and notes sections, the named footer (in the box, too long for its rule); every line 80 wide', async () => {
		const { root, lotsPath, head, tip } = await fullCardScenario({ failingBuild: true })

		const result = writeHandover({ lotsPath, columns: 80 })

		expect(result.exitCode).toBe(0)
		expect(maskVolatile({ lines: boxLines(result.output), root, head, tip })).toEqual([
			'┌─ hand-over: dialecte-scratch-XXXXXX main ────────────────────────────────────┐',
			'│ BLOCKED  2 lots · 1 file · +3 −1 · 1 merge not sized · 1 gate failed: build  │',
			'│          · gates ran on another tree: check                                  │',
			'│          4 declarations to read (below)                                      │',
			'├─ commit ─────────────────────────────────────────────────────────────────────┤',
			'│ pending  1 file  +3 −1  feat(read): read answers one                         │',
			'│ pending  size after rehearse  merge: bring feat/x in                         │',
			'│                               merge feat/x at bbbbbbb · 1 conflict · tree    │',
			'│                               not recorded: rehearse first                   │',
			'│ HEAD aaaaaaa                                                                 │',
			'│ worktree dialecte-scratch-XXXXXX                                             │',
			'├─ gates ──────────────────────────────────────────────────────────────────────┤',
			'│ ! tdd       not run here (the package does not test with vitest)             │',
			'│ ! check     4/4 (the tree changed since)                                     │',
			'│ ✗ build     exit 1 (the tree changed since)                                  │',
			'│ ! review    no findings ledger                                               │',
			'│ ! standard  not consulted: none configured (DIALECTE_STANDARD)               │',
			'├─ tdd ────────────────────────────────────────────────────────────────────────┤',
			'│ 1 proven red → green · 2 unchanged                                           │',
			'│ 1 accepted                                                                   │',
			'│   1  pins existing behaviour                                                 │',
			'│ 1 revised · 1 gone · 2 unused                                      to read ↓ │',
			'│   revised  src/read.test.ts › read > answers two                             │',
			'│            the review asked for it                                           │',
			'│   gone     src/old.test.ts (the table call was rewritten)                    │',
			'│   unused   accept src/x.test.ts::x (never run): no receipt of that case      │',
			'│   unused   revised src/y.test.ts::y (never run): no receipt of that case     │',
			'│ 1 flag: helper code changed near unchanged cases (noise)                     │',
			'├─ notes ──────────────────────────────────────────────────────────────────────┤',
			'│ Run it with the cli of this branch.                                          │',
			'├──────────────────────────────────────────────────────────────────────────────┤',
			'│ dialecte handover show 2026-11-04-main · run 2026-11-04-main · --legend ·    │',
			'│ details: dialecte tdd status                                                 │',
			'└──────────────────────────────────────────────────────────────────────────────┘',
		])
	})

	it('a merge lot whose tree a rehearsal recorded → its row and the totals carry the stat between the tree it merges on and its tree', async () => {
		const unrecorded = await fullCardScenario({ failingBuild: false })
		expect(writeHandover({ lotsPath: unrecorded.lotsPath }).exitCode).toBe(0)
		const rehearsal = await runFolder({ out: unrecorded.out, argv: ['--rehearse'] })
		const tree = /tree ([0-9a-f]{40})/.exec(rehearsal.text)?.[1] ?? ''
		expect(tree).toMatch(/^[0-9a-f]{40}$/)
		const { root, lotsPath, head, tip } = await fullCardScenario({ failingBuild: false, tree })

		const output = writeHandover({ lotsPath }).output

		expect(verdictLines(output)).toEqual([
			'BLOCKED  2 lots · 2 files · +4 −2 · gates ran on another tree: check, build',
			'         4 declarations to read (below)',
		])
		expect(sectionLines({ output, name: 'commit' })).toEqual([
			'pending  1 file  +3 −1  feat(read): read answers one',
			'pending  1 file  +1 −1  merge: bring feat/x in',
			`                        merge feat/x at ${tip.slice(0, 7)} · 1 conflict · tree ${tree.slice(0, 7)}`,
			`HEAD ${head.slice(0, 7)}`,
			`worktree ${basename(root)}`,
		])
	})

	it('gate and rules recorded on the worktree, then a real run of every lot → DONE with all gates green; no line says the tree changed since', async () => {
		const { root, lotsPath, out } = prepare({
			committed: gatedPackage({
				fast: [{ name: 'check', run: `printf ' Tests  4 passed (4)\\n'` }],
			}),
		})
		await runGateIn({ root, argv: [] })
		runRules({ cwd: root, argv: [] })
		expect(writeHandover({ lotsPath }).exitCode).toBe(0)

		const ran = await runFolder({ out })

		expect(ran.exitCode).toBe(0)
		expect(verdictLines(ran.text)).toEqual(['DONE  2 lots · 2 files · +6 −1 · all gates green'])
		expect(boxLines(ran.text).filter((line) => line.includes('(the tree changed since)'))).toEqual(
			[],
		)
	})

	it('a run that commits a merge lot with its rehearsed tree → its commit row shows the commit and the real +/−, the merge line still under it', async () => {
		const unrecorded = await fullCardScenario({ failingBuild: false })
		expect(writeHandover({ lotsPath: unrecorded.lotsPath }).exitCode).toBe(0)
		const rehearsal = await runFolder({ out: unrecorded.out, argv: ['--rehearse'] })
		const tree = /tree ([0-9a-f]{40})/.exec(rehearsal.text)?.[1] ?? ''
		expect(tree).toMatch(/^[0-9a-f]{40}$/)
		const { root, lotsPath, out, head, tip } = await fullCardScenario({
			failingBuild: false,
			tree,
		})
		expect(writeHandover({ lotsPath }).exitCode).toBe(0)

		const ran = await runFolder({ out })

		expect(ran.exitCode).toBe(0)
		const [mergeCommit, plainCommit] = git({ root, args: ['log', '--format=%H', '-2'] })
			.trim()
			.split('\n')
		expect(sectionLines({ output: ran.text, name: 'commit' })).toEqual([
			`${plainCommit.slice(0, 7)}  1 file  +3 −1  feat(read): read answers one`,
			`${mergeCommit.slice(0, 7)}  1 file  +1 −1  merge: bring feat/x in`,
			`                        merge feat/x at ${tip.slice(0, 7)} · 1 conflict · tree ${tree.slice(0, 7)}`,
			`HEAD ${head.slice(0, 7)} → ${mergeCommit.slice(0, 7)} · nothing pushed`,
			`worktree ${basename(root)}`,
		])
	})

	it('one lot, one gate failed, one declaration → 1 lot, 1 gate failed: check, 1 declaration to read', async () => {
		const { root, lotsPath } = prepare({
			committed: gatedPackage({ fast: [{ name: 'check', run: 'exit 3' }] }),
			files: {
				'src/read.ts':
					'export function read() {\n\tconst write = () => 2\n\tconst make = () => 3\n}\n',
				'CHANGELOG.md': '# Changelog\n\n- read\n',
			},
			lots: [{ paths: ['src/', 'CHANGELOG.md'], message: 'feat(read): read answers one' }],
		})
		writeFiles({
			root,
			files: {
				'.dialecte/lot.json': JSON.stringify({
					gone: [{ file: 'src/old.test.ts', reason: 'the table call was rewritten' }],
				}),
			},
		})
		await runGateIn({ root, argv: [] })
		runRules({ cwd: root, argv: [] })

		const output = writeHandover({ lotsPath }).output

		expect(verdictLines(output)).toEqual([
			'BLOCKED  1 lot · 2 files · +7 −1 · 1 gate failed: check',
			'         1 declaration to read (below)',
		])
	})

	it('a commit subject longer than the row → wraps under the subject column, every word kept, no …', () => {
		const subject =
			'feat(read): read answers one, and the reader keeps every answer it gave in the order it gave them'
		const { lotsPath } = prepare({
			lots: [
				{ paths: ['src/'], message: subject },
				{ paths: ['CHANGELOG.md'], message: 'docs(changelog): read' },
			],
		})

		const output = writeHandover({ lotsPath, columns: 80 }).output

		const rows = sectionLines({ output, name: 'commit' })
		const continued: string[] = []
		for (const text of rows.slice(1)) {
			if (!/^ {24}\S/.test(text)) break
			continued.push(text.trim())
		}
		expect(rows[0] ?? '').toMatch(/^pending {2}1 file {2}\+3 −1 {2}feat\(read\)/)
		expect(continued.length).toBeGreaterThan(0)
		expect([(rows[0] ?? '').slice(24), ...continued].join(' ')).toBe(subject)
		expect(output).not.toContain('…')
		expect(boxLines(output).filter((line) => line.length > 80)).toEqual([])
	})

	it('a 60-character token in the notes at 40 columns → cut at the width, no line wider, every character kept', () => {
		const token = 'abcdefghij'.repeat(6)
		const { lotsPath } = prepare({ overrides: { gates: token } })

		const output = writeHandover({ lotsPath, columns: 40 }).output

		expect(boxLines(output).filter((line) => line.length > 40)).toEqual([])
		expect(
			sectionLines({ output, name: 'notes' })
				.map((text) => text.trim())
				.join(''),
		).toBe(token)
	})

	it('--json of the full card → the verdict, the failed and other-tree gate names, the declarations count, each lot pending, HEAD and no tip before a run', async () => {
		const { lotsPath, head } = await fullCardScenario({ failingBuild: true })

		const data = JSON.parse(writeHandover({ lotsPath, argv: ['--json'] }).output)

		expect(data).toMatchObject({
			verdict: 'BLOCKED',
			failedGates: ['build'],
			otherTreeGates: ['check'],
			declarations: 4,
			head,
			lots: [{ pending: true }, { pending: true }],
		})
		expect(data).not.toHaveProperty('tip')
	})

	it('--json of the full card → tdd as the plain text lines a person reads (no layout field, no padding), gates as the card lines', async () => {
		const { lotsPath } = await fullCardScenario({ failingBuild: true })

		const data = JSON.parse(writeHandover({ lotsPath, argv: ['--json'] }).output)

		expect(data.tdd).toEqual([
			'1 proven red → green · 2 unchanged',
			'1 accepted',
			'1 pins existing behaviour',
			'1 revised · 1 gone · 2 unused',
			'revised src/read.test.ts › read > answers two',
			'the review asked for it',
			'gone src/old.test.ts (the table call was rewritten)',
			'unused accept src/x.test.ts::x (never run): no receipt of that case',
			'unused revised src/y.test.ts::y (never run): no receipt of that case',
			'1 flag: helper code changed near unchanged cases (noise)',
		])
		expect(data.gates).toEqual(
			expect.arrayContaining([
				{ name: 'build', status: 'failed', detail: 'exit 1 (the tree changed since)', stale: true },
			]),
		)
	})

	it('a terminal of 60 columns → no line wider; a gate detail wraps under its detail column, the merge line (tree not recorded) under the subject column', async () => {
		const { lotsPath, tip } = await fullCardScenario({ failingBuild: false })

		const output = writeHandover({ lotsPath, columns: 60 }).output

		const box = boxLines(output)
		expect(box.filter((line) => line.length > 60)).toEqual([])
		const tddGate = box.findIndex((line) => line.startsWith('│ ! tdd       not run here'))
		const merge = box.findIndex((line) => /^│ {31}merge feat\/x at /.test(line))
		expect({ tddGate: tddGate > 0, merge: merge > 0 }).toEqual({ tddGate: true, merge: true })
		expect(box[tddGate + 1]).toMatch(/^│ {13}\S/)
		const mergeRows = [box[merge]]
		for (const line of box.slice(merge + 1)) {
			if (!/^│ {31}\S/.test(line)) break
			mergeRows.push(line)
		}
		expect(mergeRows.length).toBeGreaterThan(1)
		expect(mergeRows.map((line) => rowText(line).trim()).join(' ')).toBe(
			`merge feat/x at ${tip.slice(0, 7)} · 1 conflict · tree not recorded: rehearse first`,
		)
	})

	it('the cli off a terminal with $COLUMNS of 50 → the card wraps at 50, no escape byte', () => {
		const { lotsPath } = prepare({
			overrides: {
				gates:
					'npm run type-check && npm run lint:check && npm run format:check && npm run test:run',
			},
		})

		const result = runCli({ argv: ['handover', lotsPath], columns: 50 })

		expect(result.exitCode).toBe(0)
		const box = boxLines(result.output)
		expect(box.length).toBeGreaterThan(0)
		expect(box.filter((line) => line.length > 50)).toEqual([])
		expect(result.output).not.toContain(ESCAPE)
	})

	it('handover run by the cli off a terminal with $COLUMNS of 50 → the card after the run wraps at 50, no escape byte', () => {
		const { lotsPath, out } = prepare()
		expect(writeHandover({ lotsPath }).exitCode).toBe(0)

		const result = runCli({ argv: ['handover', 'run', out], columns: 50 })

		expect(result.exitCode).toBe(0)
		const box = boxLines(result.output)
		expect(box.some((line) => line.startsWith('└'))).toBe(true)
		expect(box.filter((line) => line.length > 50)).toEqual([])
		expect(result.output).not.toContain(ESCAPE)
	})

	it('on a terminal (colour) → ✓ green, ! yellow, ✗ red, the verdict word bold; every box line as wide as the width once the escapes are left out', async () => {
		const { lotsPath, out } = await fullCardScenario({ failingBuild: true })
		process.env[STANDARD_ENVIRONMENT_VARIABLE] = temporaryFolder('dialecte-standard-')
		onTestFinished(function removeStandard() {
			delete process.env[STANDARD_ENVIRONMENT_VARIABLE]
		})
		writeFileSync(
			join(out, STANDARD_FILE),
			JSON.stringify({ state: 'consulted', note: 'read it', at: '2026-11-04T10:00:00.000Z' }),
		)

		const output = runHandover({
			probe: noRepositoryCli,
			argv: [lotsPath],
			cliPath: WRITER_CLI,
			colour: true,
			columns: 100,
		}).output

		expect(styledText({ output, open: 32, text: '✓', close: 39, after: ' standard' })).toBe(true)
		expect(styledText({ output, open: 33, text: '!', close: 39, after: ' tdd' })).toBe(true)
		expect(styledText({ output, open: 31, text: '✗', close: 39, after: ' build' })).toBe(true)
		expect(styledText({ output, open: 1, text: 'BLOCKED', close: 22, after: '  2 lots' })).toBe(
			true,
		)
		const box = boxLines(withoutEscapes(output))
		expect(box.map((line) => line.length)).toEqual(Array(box.length).fill(100))
	})
})

describe('handover: the tdd section', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	/** A repository ready for a hand-over whose lot file holds `declaration`. */
	function preparedWithDeclaration(declaration: object): { root: string; lotsPath: string } {
		const { root, lotsPath } = prepare()
		writeFiles({ root, files: { '.dialecte/lot.json': JSON.stringify(declaration) } })
		return { root, lotsPath }
	}

	it('each case counted once by its last proof → <n> proven red → green · <m> unchanged · <k> kept first; kept after a green counts kept, kept after only unchanged counts unchanged; a case still red counted in none', () => {
		const { root, lotsPath } = prepare()
		writeLedger({
			root,
			receipts: [
				{ kind: 'red', name: 'read > proven once' },
				{ kind: 'green', name: 'read > proven once' },
				{ kind: 'unchanged', name: 'read > stays' },
				{ kind: 'unchanged', name: 'read > stays as well' },
				{ kind: 'red', name: 'read > proven twice' },
				{ kind: 'green', name: 'read > proven twice' },
				{ kind: 'red', name: 'read > proven twice' },
				{ kind: 'green', name: 'read > proven twice' },
				{ kind: 'red', name: 'read > still red' },
				{ kind: 'unchanged', name: 'read > unchanged then kept' },
				{
					kind: 'kept',
					name: 'read > unchanged then kept',
					flags: ['test code changed around it'],
				},
				{ kind: 'red', name: 'read > proven then kept' },
				{ kind: 'green', name: 'read > proven then kept' },
				{ kind: 'kept', name: 'read > proven then kept', flags: ['test code changed around it'] },
			],
		})

		expect(tddRowLines(writeHandover({ lotsPath, columns: 80 }).output)[0]).toBe(
			'2 proven red → green · 3 unchanged · 1 kept',
		)
	})

	it('a case red then green, then an accepted receipt whose entry the lot file no longer holds, judged green by the gate → counted proven red → green, named as a case with a skipped receipt, not counted among the earlier lots accepted', () => {
		const { root, lotsPath } = prepare()
		writeLedgerOnly({
			root,
			receipts: [
				{ kind: 'red', name: 'read > proven' },
				{ kind: 'green', name: 'read > proven' },
				{ kind: 'accepted', name: 'read > proven', reason: 'an acceptance since removed' },
			],
		})
		recordJudgedCasesWith({ root, statuses: { 'read > proven': 'green' } })

		const rows = tddRowLines(writeHandover({ lotsPath, columns: 200 }).output)

		expect(rows[0]).toBe('1 proven red → green · 0 unchanged')
		expect(rows.filter((row) => row.startsWith('earlier lots'))).toEqual([])
		const head = rows.findIndex((row) => row.endsWith('to read ↓'))
		const naming = rows.findIndex((row) => row.includes('read > proven') && /accepted/.test(row))
		expect(head).toBeGreaterThanOrEqual(0)
		expect(naming).toBeGreaterThan(head)
		expect(rows[naming]).toMatch(/no longer declared/)
		expect(rows.filter((row) => /^\d+ accepted/.test(row))).toEqual([])
	})

	it('a gate record of another tree → the counts replaced by one line: counts from the last gate: run the gate on this tree', () => {
		const { root, lotsPath } = prepare()
		writeLedger({
			root,
			receipts: [
				{ kind: 'red', name: 'read > proven' },
				{ kind: 'green', name: 'read > proven' },
			],
		})
		writeFiles({ root, files: { 'src/read.ts': 'export function read() {\n\treturn 3\n}\n' } })

		expect(tddRowLines(writeHandover({ lotsPath, columns: 80 }).output)).toEqual([
			'counts from the last gate: run the gate on this tree',
		])
	})

	it('no gate record → the counts replaced by one line: counts from the last gate: run the gate on this tree', () => {
		const { root, lotsPath } = prepare()
		writeLedgerOnly({
			root,
			receipts: [
				{ kind: 'red', name: 'read > proven' },
				{ kind: 'green', name: 'read > proven' },
				{ kind: 'unchanged', name: 'read > stays', flags: ['rollback'] },
			],
		})

		expect(tddRowLines(writeHandover({ lotsPath, columns: 80 }).output)).toEqual([
			'counts from the last gate: run the gate on this tree',
		])
	})

	it("a case revised at review then green again → counted revised only, not proven: the counts are the gate's statuses", () => {
		const { root, lotsPath } = preparedWithDeclaration({
			revised: [
				{ case: 'src/read.test.ts::read > edited at review', reason: 'the review asked for it' },
			],
		})
		writeLedgerOnly({
			root,
			receipts: [
				{ kind: 'red', name: 'read > proven' },
				{ kind: 'green', name: 'read > proven' },
				{ kind: 'red', name: 'read > edited at review' },
				{ kind: 'green', name: 'read > edited at review' },
				{ kind: 'revised', name: 'read > edited at review', reason: 'the review asked for it' },
				{ kind: 'green', name: 'read > edited at review' },
			],
		})
		recordJudgedCasesWith({ root, statuses: { 'read > edited at review': 'revised' } })

		expect(tddRowLines(writeHandover({ lotsPath, columns: 80 }).output)).toEqual([
			'1 proven red → green · 0 unchanged',
			toReadLine({ head: '1 revised', columns: 80 }),
			'  revised  src/read.test.ts › read > edited at review',
			'           the review asked for it',
		])
	})

	it('no case kept → the counts line has no kept part', () => {
		const { root, lotsPath } = prepare()
		writeLedger({
			root,
			receipts: [
				{ kind: 'red', name: 'read > proven' },
				{ kind: 'green', name: 'read > proven' },
			],
		})

		expect(tddRowLines(writeHandover({ lotsPath, columns: 80 }).output)).toEqual([
			'1 proven red → green · 0 unchanged',
		])
	})

	it("accepted cases → a head line with their count, then one row per reason group (the lot file's exact reason), the largest group first, a tie in the lot file's order (not the ledger's, not alphabetical)", () => {
		const reasons: Record<string, string> = {
			'read > split one': 'split from a proven case',
			'read > pinned one': 'pins of new code',
			'read > split two': 'split from a proven case',
			'read > pinned two': 'pins of new code',
			'read > one': 'one behaviour per case',
			'read > two': 'one behaviour per case',
			'read > three': 'one behaviour per case',
		}
		const { root, lotsPath } = preparedWithDeclaration({
			accept: Object.entries(reasons).map(([name, reason]) => ({
				case: `src/read.test.ts::${name}`,
				reason,
			})),
		})
		writeLedger({
			root,
			receipts: [
				'read > pinned one',
				'read > one',
				'read > pinned two',
				'read > split one',
				'read > two',
				'read > split two',
				'read > three',
			].map((name) => ({ kind: 'accepted', name, reason: 'the reason the red run saw' })),
		})

		const rows = tddRowLines(writeHandover({ lotsPath, columns: 80 }).output)

		expect(rows).toEqual([
			'7 accepted',
			'  3  one behaviour per case',
			'  2  split from a proven case',
			'  2  pins of new code',
		])
	})

	it('accepted reasons longer than the row at 40 columns → each reason wrapped under itself, no line wider, every word kept', () => {
		const first = 'the case pins behaviour the base already had before this lot'
		const second = 'a proven case split in two at review'
		const { root, lotsPath } = preparedWithDeclaration({
			accept: [
				{ case: 'src/read.test.ts::read > one', reason: first },
				{ case: 'src/read.test.ts::read > two', reason: second },
			],
		})
		writeLedger({
			root,
			receipts: [
				{ kind: 'accepted', name: 'read > one', reason: first },
				{ kind: 'accepted', name: 'read > two', reason: second },
			],
		})

		const output = writeHandover({ lotsPath, columns: 40 }).output

		const rows = tddRowLines(output)
		expect(boxLines(output).filter((line) => line.length > 40)).toEqual([])
		const reasonRows = rows.slice(1)
		expect(rows[0]).toBe('2 accepted')
		expect(reasonRows.filter((row) => /^ {2}1 {2}\S/.test(row))).toHaveLength(2)
		expect(
			reasonRows.filter((row) => !/^ {2}1 {2}\S/.test(row)).every((row) => /^ {5}\S/.test(row)),
		).toBe(true)
		expect(reasonRows.length).toBeGreaterThan(2)
		expect(
			reasonRows
				.map((row) => row.trim())
				.join(' ')
				.replace(/ {2,}/g, ' '),
		).toBe(`1 ${first} 1 ${second}`)
	})

	it('a case only ever unchanged with a receipt flagged rollback → its flags counted each, never as noise', () => {
		const { root, lotsPath } = prepare()
		writeLedger({
			root,
			receipts: [
				{ kind: 'unchanged', name: 'read > rolled back', flags: ['rollback'] },
				{ kind: 'kept', name: 'read > rolled back', flags: ['test code changed around it'] },
			],
		})

		const rows = tddRowLines(writeHandover({ lotsPath, columns: 80 }).output)

		expect(rows.filter((row) => /^\d+ flags?: /.test(row))).toEqual([
			'1 flag: rollback',
			'1 flag: test code changed around it',
		])
	})

	it('a revised case title longer than the row → cut after its last whole word with …, the long reason wrapped under the file column', () => {
		const name = 'read > a case whose title runs on and on, far past the right edge of the card'
		const reason =
			'the review found the case asserted the whole card where only the tdd lines matter, so it was cut down'
		const { root, lotsPath } = preparedWithDeclaration({
			revised: [{ case: `src/read.test.ts::${name}`, reason }],
		})
		writeLedger({ root, receipts: [{ kind: 'revised', name, reason }] })

		const rows = tddRowLines(writeHandover({ lotsPath, columns: 80 }).output)

		expect(rows[1]).toBe(
			'  revised  src/read.test.ts › read > a case whose title runs on and on, …',
		)
		expect(rows.length).toBeGreaterThan(3)
		expect(rows.slice(2).every((row) => /^ {11}\S/.test(row))).toBe(true)
		expect(
			rows
				.slice(2)
				.map((row) => row.trim())
				.join(' '),
		).toBe(reason)
	})

	it('flags → one line per kind with its count of cases (rollback, red after green, test code changed around it); a case only ever unchanged flagged test code changed around it → counted as noise; rollback and red after green never noise', () => {
		const flag = 'test code changed around it'
		const { root, lotsPath } = prepare()
		writeLedger({
			root,
			receipts: [
				{ kind: 'unchanged', name: 'read > noise one' },
				{ kind: 'kept', name: 'read > noise one', flags: [flag] },
				{ kind: 'unchanged', name: 'read > noise two' },
				{ kind: 'kept', name: 'read > noise two', flags: [flag] },
				{ kind: 'kept', name: 'read > noise two', flags: [flag] },
				{ kind: 'red', name: 'read > proven' },
				{ kind: 'green', name: 'read > proven' },
				{ kind: 'kept', name: 'read > proven', flags: [flag] },
				{ kind: 'unchanged', name: 'read > rolled back' },
				{ kind: 'red', name: 'read > rolled back', flags: ['rollback'] },
				{ kind: 'unchanged', name: 'read > made red' },
				{ kind: 'red', name: 'read > made red', flags: ['red after green'] },
			],
		})

		const rows = tddRowLines(writeHandover({ lotsPath, columns: 80 }).output)

		expect(rows.filter((row) => /^\d+ flags?: /.test(row))).toEqual([
			'1 flag: rollback',
			'1 flag: red after green',
			'1 flag: test code changed around it',
			'2 flags: helper code changed near unchanged cases (noise)',
		])
		expect(rows.filter((row) => row.includes('read >'))).toEqual([])
	})
})

describe('handover: the tdd section agrees with the gate', { timeout: 240_000 }, () => {
	const STUB =
		"export function add(left: number, right: number): number {\n\tthrow new Error('not implemented: add')\n}\n"
	const IMPLEMENTED =
		'export function add(left: number, right: number): number {\n\treturn left + right\n}\n'
	const ADD_TEST = [
		"import { add } from './add.ts'",
		"import { expect, it } from 'vitest'",
		"it('one plus two → three', () => { expect(add(1, 2)).toBe(3) })",
		'',
	].join('\n')

	function tdd(params: { root: string; argv: string[] }) {
		return runTdd({
			cwd: params.root,
			argv: params.argv,
			now: () => new Date('2026-10-29T12:00:00.000Z'),
		})
	}

	it("receipts of a case the change no longer has (retitled away) → not counted: the card's counts are the gate tdd step's on the same tree", async () => {
		const root = createVitestPackage({
			dialecte: { gate: { fast: [{ name: 'check', run: 'true' }] } },
		})
		writeFiles({ root, files: { 'src/add.ts': STUB, 'src/add.test.ts': ADD_TEST } })
		await tdd({ root, argv: ['red'] })
		writeFileSync(join(root, 'src/add.ts'), IMPLEMENTED)
		await tdd({ root, argv: ['green'] })
		// the receipts the case held under a title it no longer has
		const ledgerPath = join(root, '.git', 'dialecte-tdd.json')
		const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8')) as {
			entries: Array<{ kind: string; name: string }>
		}
		const retitled = ledger.entries
			.filter((entry) => entry.kind === 'red' || entry.kind === 'green')
			.map((entry) => ({ ...entry, name: 'one plus two gives three' }))
		writeFileSync(
			ledgerPath,
			JSON.stringify({ ...ledger, entries: [...retitled, ...ledger.entries] }),
		)
		const gate = await runGate({
			cwd: root,
			argv: ['--declare', 'src/'],
		})
		const out = temporaryFolder('dialecte-handover-')
		const lotsPath = join(out, 'lots.json')
		const lotsFile: LotsFile = {
			repository: root,
			branch: 'main',
			head: headOf(root),
			lots: [{ paths: ['src/'], message: 'feat(add): add answers the sum' }],
		}
		writeFileSync(lotsPath, JSON.stringify(lotsFile))

		const rows = tddRowLines(writeHandover({ lotsPath, columns: 80 }).output)

		expect({
			gate: gate.output.split('\n').filter((line) => /\btdd\b/.test(line)),
			card: rows,
		}).toEqual({
			gate: ['ok    tdd  1 case(s) of the change: 1 red then green'],
			card: ['1 proven red → green · 0 unchanged'],
		})
	})
})

/**
 * Every term the card can print, as `dialecte handover --legend` prints it: grouped (the verdict, the marks,
 * the commit section, the gate lines, the tdd terms, the card's own terms), each term in two lines - what it
 * means, then whether to look.
 */
const LEGEND: Array<Array<{ term: string; meaning: string; look: string }>> = [
	[
		{
			term: 'READY',
			meaning:
				'no gate failed and none ran on another state of the tree: the lots can be committed',
			look: 'look: the size, then the declarations to read',
		},
		{
			term: 'BLOCKED',
			meaning:
				'a gate failed, never ran, or ran on another state of the tree; the line names each one',
			look: 'look: the gates it names; fix them, then run them again',
		},
		{
			term: 'DONE',
			meaning: 'every lot of the hand-over is committed',
			look: 'look only if a commit in the commit section is not the one you expected',
		},
		{
			term: 'ABANDONED',
			meaning:
				'dialecte handover abandon marked the hand-over: it will not run; the lots it committed stay',
			look: 'look only if you meant to run it: write a new hand-over',
		},
	],
	[
		{
			term: '✓',
			meaning: 'the step passed on this tree',
			look: 'look only if its counts surprise you',
		},
		{
			term: '!',
			meaning: 'not run here, or only nits open: it does not block; ran on another tree: it blocks',
			look: 'look: the reason after it; on another tree, run the gate again (a gate run replaces commit hook lines too)',
		},
		{
			term: '✗',
			meaning: 'the step failed, or never ran on this tree: the hand-over is blocked',
			look: 'look: always',
		},
	],
	[
		{
			term: 'pending',
			meaning: 'the lot is not committed yet; its commit sha once it is',
			look: 'look only if a lot you expected is missing',
		},
		{
			term: 'merge',
			meaning:
				'a merge lot: the branch and tip it merges, its conflicts, the tree a rehearsal recorded',
			look: 'look only if it says tree not recorded: rehearse first',
		},
		{
			term: 'HEAD',
			meaning: 'the commit the hand-over starts from; after a run, base → tip and nothing pushed',
			look: 'look only if the base is not the commit you expected',
		},
	],
	[
		{
			term: 'gate',
			meaning: 'no gate record on this tree: dialecte gate never ran here',
			look: 'look: always; run dialecte gate',
		},
		{
			term: 'commit hook',
			meaning:
				'the line comes from the commit hook a hand-over run saw, its own scripts by name (test:run, lint:check, hook); a gate run after it replaces those lines',
			look: 'look only if it is not ✓',
		},
		{
			term: 'from <sha>',
			meaning:
				"the line comes from a record made at a commit outside this branch's history, such as the branch commit a merge brings in",
			look: 'look only if it is not ✓',
		},
		{
			term: 'rehearsal',
			meaning:
				'the line comes from the commit hook of a rehearsal in a scratch clone, which ran on the tree the lots leave',
			look: 'look only if it is not ✓',
		},
		{
			term: 'check',
			meaning: "the package's check script: types, lint, format and the tests it runs",
			look: 'look only if it is not ✓',
		},
		{
			term: 'tests',
			meaning:
				'the tests as passed/run: with --fast those of the changed files, with --full the whole suite',
			look: 'look only if it is not ✓',
		},
		{ term: 'build', meaning: 'the package builds', look: 'look only if it is not ✓' },
		{
			term: 'contrib',
			meaning:
				"the contributor checks (dialecte contrib): rules, the package's steps (docs and type-bench by default), release, and mutation when a scope is declared; one line when every row is green",
			look: 'look only if it is not ✓: a row failed, dialecte contrib never ran on this tree, or it ran on another tree',
		},
		{
			term: 'docs',
			meaning: 'a contrib row: the documentation builds',
			look: 'look only if it is not ✓',
		},
		{
			term: 'type-bench',
			meaning: 'a contrib row: the cost of the types stays within its baseline',
			look: 'look only if it is not ✓: a type grew in cost',
		},
		{
			term: 'rules',
			meaning:
				'a contrib row: dialecte rules on the changed files, the errors and warnings of the house rules',
			look: 'look only if it counts an error or a warning',
		},
		{
			term: 'review',
			meaning: 'the independent review: its rounds and open findings, from the findings ledger',
			look: 'look only if it is not ✓: a finding is open, or no findings ledger means no review recorded',
		},
		{
			term: 'standard',
			meaning: 'whether the standard named by DIALECTE_STANDARD was consulted',
			look: 'look only if it is not ✓: ! means no standard is configured, ✗ means one is and no consultation was recorded',
		},
		{
			term: 'skills',
			meaning: 'the agent skills of the package are generated and in sync with the code',
			look: 'look only if it is not ✓: the generated skills are out of sync with the code (a changed JSDoc counts)',
		},
		{
			term: 'tdd',
			meaning:
				'every new or changed test case has its receipts: red before the code and green after, or unchanged, accepted or revised',
			look: 'look only if it is not ✓; the tdd section says which cases',
		},
	],
	[
		{
			term: 'exempt',
			meaning:
				'the lot changes no behaviour, so no case needs a red; the reason and the files touched follow',
			look: 'look: the reason; a lot that changes behaviour is never exempt',
		},
		{
			term: 'proven red → green',
			meaning:
				'cases that failed before the code and pass with it: the test was seen to test something',
			look: 'look only if the count seems low for what the lot changes',
		},
		{
			term: 'unchanged',
			meaning: 'cases passing with their test code the same as at the base: nothing to prove',
			look: 'look only if the lot was meant to change their behaviour',
		},
		{
			term: 'kept',
			meaning:
				'proven cases that passed again at a later red run, after test code around them changed',
			look: 'look: the "test code changed around it" flag line below',
		},
		{
			term: 'accepted',
			meaning: 'cases passing without a red, accepted by the lot with a reason',
			look: 'look: the reasons; each should make sense to you',
		},
		{
			term: 'earlier lots',
			meaning:
				'receipts of cases outside the change (earlier lots) the lot file no longer names, counted per kind',
			look: "look only if you expected this lot's file to name them",
		},
		{
			term: 'revised',
			meaning:
				'cases edited at review (proven before, accepted, unchanged or of the base); the lot gives a reason instead of a new red',
			look: 'look: each one; the edit must not weaken the test',
		},
		{
			term: 'gone',
			meaning: "test cases of the base deleted, with the lot's reason",
			look: 'look: each one; what they tested should still be tested',
		},
		{
			term: 'unused',
			meaning: 'an accept or revised entry of the lot file that no red run used',
			look: 'look: each one; fix or remove it in the lot file',
		},
		{
			term: 'skipped',
			meaning:
				'a case of the change with a receipt the read rule no longer counts: its acceptance or revision is no longer declared, or an acceptance came after a red → green proof',
			look: 'look: the to-read entry; nothing to remove: the ledger keeps the receipt, the card names it',
		},
		{
			term: 'rollback',
			meaning:
				'a red, or a green run proving a case for the first time, taken while the lot moved production code back (a refactor green of cases already green is not flagged)',
			look: 'look: always; ask why the code went back',
		},
		{
			term: 'red after green',
			meaning:
				'a green case made red again with production unchanged: its test was changed to fail',
			look: 'look: always; the test may have been bent to fail',
		},
		{
			term: 'test code changed around it',
			meaning:
				'a case proven green whose test code (its own test file or a helper) changed around it after its green',
			look: 'look: each one; the change may weaken what the case proved',
		},
		{
			term: 'helper code changed near unchanged cases (noise)',
			meaning:
				'unchanged cases flagged because test code around them changed; nothing proven is weakened',
			look: 'look only if the count is far above what the change touches',
		},
	],
	[
		{
			term: 'declarations to read',
			meaning:
				'the tdd lines a person must read before committing: revised, gone and unused entries',
			look: 'look: each one, under to read ↓',
		},
		{
			term: 'notes',
			meaning:
				"the agent's caveats for the person about to run the hand-over; the card after a run has none",
			look: 'look: always',
		},
	],
]

/** The legend's lines unwrapped: per group, `<term>  <meaning>` then `  <look>` per term; a blank line between groups. */
function legendLines(): string[] {
	return LEGEND.flatMap((group, index) => [
		...(index === 0 ? [] : ['']),
		...group.flatMap((entry) => [`${entry.term}  ${entry.meaning}`, `  ${entry.look}`]),
	])
}

describe('handover --legend', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('handover --legend → every term the card can print in two lines - what it means, then look: or look only if -; exit 0', () => {
		const result = runHandover({
			argv: ['--legend'],
			cliPath: WRITER_CLI,
			columns: 300,
			probe: noRepositoryCli,
		})

		expect({ exitCode: result.exitCode, lines: result.output.split('\n') }).toEqual({
			exitCode: 0,
			lines: legendLines(),
		})
	})

	it('handover --legend by the cli with $COLUMNS of 40 → no line wider, every word kept; without $COLUMNS → wrapped at 80', () => {
		const words = legendLines().join(' ').split(/\s+/).filter(Boolean)
		expect(legendLines().some((line) => line.length > 80)).toBe(true)

		const narrow = runCli({ argv: ['handover', '--legend'], columns: 40 })
		const standard = runCli({ argv: ['handover', '--legend'] })

		expect({
			exitCodes: [narrow.exitCode, standard.exitCode],
			narrowTooWide: narrow.output.split('\n').filter((line) => line.length > 40),
			standardTooWide: standard.output.split('\n').filter((line) => line.length > 80),
			narrowWords: narrow.output.split(/\s+/).filter(Boolean),
			standardWords: standard.output.split(/\s+/).filter(Boolean),
		}).toEqual({
			exitCodes: [0, 0],
			narrowTooWide: [],
			standardTooWide: [],
			narrowWords: words,
			standardWords: words,
		})
	})
})
