/**
 * Scratch packages for the tests of the check reuse: a package whose gate steps count their runs in a file
 * outside the repository (so the tree does not change), and a package with a husky commit hook that counts
 * its runs the same way, with the hand-over written and run around it.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { runGate } from '../src/commands/gate.ts'
import { runHandover, runHandoverRun } from '../src/commands/handover.ts'
import { REHEARSAL_FOLDER_PREFIX } from '../src/lib/handover/handover.constants.ts'
import { readHandoverFolder } from '../src/lib/handover/read-handover-folder.ts'
import { shellQuote } from '../src/lib/shell-quote.ts'
import { createFakeClock } from './fake-clock.ts'
import { removeHookLogs } from './hook-logs.ts'
import { noRepositoryCli } from './repository-cli-probe.ts'
import {
	BRANCH_NAME,
	HOOK_STEP_LINES,
	PACKAGE_LOCK_AFTER,
	PACKAGE_LOCK_BEFORE,
	READ_LOT,
	SHORT_SHA_LENGTH,
	TEST_COUNT_LINE,
	WRITER_CLI,
} from './scratch-checks.constants.ts'
import {
	createScratchRepository,
	git,
	initializeRepository,
	temporaryFolder,
	writeFiles,
} from './scratch-repository.ts'
import { treeOfWorkingFiles } from './scratch-tree.ts'
import { createRecordingSpawner } from './worktree-pool.ts'

import { expect } from 'vitest'

import type { CommandResult } from '../src/lib/command-result.types.ts'
import type { GateStep } from '../src/lib/gate/gate-config.types.ts'
import type { HandoverFolder, LotsFile, MergeLotPlan } from '../src/lib/handover/handover.types.ts'
import type { RehearsedVariant } from './scratch-checks.types.ts'

/** A counter file in a folder of its own, outside every repository: a step or hook appends a line per run. */
export function createCounter(): string {
	return join(temporaryFolder('dialecte-counter-'), 'runs.txt')
}

/** How many times the step or hook appended to the counter. */
export function countRuns(counter: string): number {
	return existsSync(counter) ? readFileSync(counter, 'utf8').split('\n').filter(Boolean).length : 0
}

/**
 * A gate step that counts its run and prints a vitest test count; with `requires`, it fails (after counting)
 * while that file does not exist.
 */
export function countingStep(params: {
	counter: string
	name?: string
	requires?: string
	/** The step appends a character to this file of the package (relative to its root) while it runs. */
	edits?: string
	/** The step runs only the tests the change affects. */
	changedOnly?: boolean
}): GateStep {
	return {
		name: params.name ?? 'count',
		run: [
			`echo run >> ${shellQuote(params.counter)}`,
			`printf '%s\\n' ${shellQuote(TEST_COUNT_LINE)}`,
			...(params.requires ? [`test -f ${shellQuote(params.requires)}`] : []),
			...(params.edits ? [`printf x >> ${shellQuote(params.edits)}`] : []),
		].join(' && '),
		counts: 'tests',
		...(params.changedOnly && { changedOnly: true }),
	}
}

/** A repository on `main` with one commit, holding a package whose gate runs the given steps. */
export function createGatePackage(params: {
	fast?: GateStep[]
	full?: GateStep[]
	files?: Record<string, string>
}): string {
	return createScratchRepository({
		'package.json': `${JSON.stringify({
			name: 'demo',
			scripts: {},
			dialecte: { gate: { fast: params.fast, full: params.full } },
		})}\n`,
		'.gitignore': 'node_modules\n',
		...params.files,
	})
}

/** The gate in `cwd`. */
export function runGateIn(params: {
	cwd: string
	argv: string[]
	/** `gate --hook`: the index file git hands the hook. */
	indexFile?: string
}): Promise<CommandResult> {
	return runGate({
		cwd: params.cwd,
		argv: params.argv,
		...(params.indexFile && { indexFile: params.indexFile }),
	})
}

/** A green `gate --full` in `root`: the record the hand-over's rehearsal may reuse. */
export async function seedFullGate(root: string): Promise<void> {
	const result = await runGateIn({ cwd: root, argv: ['--full'] })
	expect(result.exitCode).toBe(0)
}

/** HEAD as a full sha. */
export function headOf(root: string): string {
	return git({ root, args: ['rev-parse', 'HEAD'] }).trim()
}

/**
 * A package with a husky commit hook (`.husky/_/h` and its `pre-commit` wrapper as husky installs them, the
 * hook's own script committed in `.husky/pre-commit`) that counts its runs in `hookCounter` and prints a
 * vitest summary; its gate (`fast` and `full`) holds one step counting in `gateCounter`. `hookExtra` is added
 * to the hook's script; `packageLock` is committed as `package-lock.json`.
 */
export function createHookedPackage(params: {
	hookCounter: string
	gateCounter: string
	hookExtra?: string
	packageLock?: string
	/** The app is made in `<container>/app` with `file:../dep` in its devDependencies, the dependency in `<container>/dep`. */
	linkedDependency?: boolean
	/** The gate's counting step appends a character to this file of the package while it runs. */
	gateEdits?: string
}): string {
	const steps = [countingStep({ counter: params.gateCounter, edits: params.gateEdits })]
	const hookScript = [
		`echo run >> ${shellQuote(params.hookCounter)}`,
		`printf '%s\\n' ${HOOK_STEP_LINES.map((line) => shellQuote(line)).join(' ')}`,
		...(params.hookExtra ? [params.hookExtra] : []),
	].join('\n')
	const files = {
		'package.json': `${JSON.stringify({
			name: 'demo',
			scripts: {},
			...(params.linkedDependency && { devDependencies: { dep: 'file:../dep' } }),
			dialecte: { gate: { fast: steps, full: steps } },
		})}\n`,
		'.gitignore': '.husky/_\nnode_modules\n',
		'.husky/pre-commit': `${hookScript}\n`,
		'src/read.ts': 'export function read() {}\n',
		'CHANGELOG.md': '# Changelog\n',
		...(params.packageLock && { 'package-lock.json': params.packageLock }),
	}
	let root: string
	if (params.linkedDependency) {
		const container = temporaryFolder('dialecte-linked-')
		writeFiles({ root: join(container, 'dep'), files: { 'lib/a.js': 'one\n' } })
		root = initializeRepository({ root: join(container, 'app'), files })
	} else root = createScratchRepository(files)
	mkdirSync(join(root, '.husky/_'), { recursive: true })
	writeFileSync(
		join(root, '.husky/_/h'),
		'#!/usr/bin/env sh\nn=$(basename "$0")\ns=$(dirname "$(dirname "$0")")/$n\n[ ! -f "$s" ] && exit 0\nsh -e "$s" "$@"\n',
	)
	writeFileSync(join(root, '.husky/_/pre-commit'), '#!/usr/bin/env sh\n. "$(dirname "$0")/h"\n')
	chmodSync(join(root, '.husky/_/h'), 0o755)
	chmodSync(join(root, '.husky/_/pre-commit'), 0o755)
	git({ root, args: ['config', 'core.hooksPath', '.husky/_'] })
	return root
}

/** The working changes of the scratch package's lot: two files, as `READ_LOT` names them. */
export function editReadLot(root: string): void {
	writeFiles({
		root,
		files: {
			'src/read.ts': 'export function read() {\n\treturn 1\n}\n',
			'CHANGELOG.md': '# Changelog\n\n- read answers 1\n',
		},
	})
}

/** The hand-over folder written for `lots` (the lots file, snapshot and card): its folder and the card printed. */
export function writeHandoverFolder(params: {
	root: string
	lots: LotsFile['lots']
	branch?: string
}): { out: string; output: string } {
	const out = temporaryFolder('dialecte-handover-')
	const lotsPath = join(out, 'lots.json')
	const lotsFile: LotsFile = {
		repository: params.root,
		branch: params.branch ?? 'main',
		head: headOf(params.root),
		gates: 'npm run check',
		lots: params.lots,
	}
	writeFileSync(lotsPath, JSON.stringify(lotsFile))
	const written = runHandover({ argv: [lotsPath], cliPath: WRITER_CLI, probe: noRepositoryCli })
	expect(written.exitCode).toBe(0)
	return { out, output: written.output }
}

/** The hand-over of the scratch package's one lot. */
export function writeReadLotHandover(root: string): { out: string; output: string } {
	return writeHandoverFolder({ root, lots: [READ_LOT] })
}

/**
 * `handover run` on the folder, every line it printed kept, and every rehearsal folder (`dialecte-rehearse-`)
 * seen under the scratch root at any line of the run or after it.
 */
export async function runFolder(params: { out: string; argv?: string[] }): Promise<{
	exitCode: number
	text: string
	rehearsalFolders: string[]
	/** The folder rehearsals are made in (a kept clone is `<scratchRoot>/<rehearsal folder>/<repository name>`). */
	scratchRoot: string
}> {
	const lines: string[] = []
	removeHookLogs({ lines })
	const scratchRoot = temporaryFolder('dialecte-scratch-root-')
	const seen = new Set<string>()
	function noteRehearsalFolders(): void {
		for (const name of readdirSync(scratchRoot))
			if (name.startsWith(REHEARSAL_FOLDER_PREFIX)) seen.add(name)
	}
	const exitCode = await runHandoverRun({
		probe: noRepositoryCli,
		argv: [params.out, ...(params.argv ?? [])],
		write: function keepLine(line) {
			lines.push(line)
			noteRehearsalFolders()
		},
		clock: createFakeClock(),
		colour: false,
		scratchRoot,
		// no run of these cases may start a real background delete
		spawner: createRecordingSpawner().spawner,
	})
	noteRehearsalFolders()
	return { exitCode, text: lines.join('\n'), rehearsalFolders: [...seen], scratchRoot }
}

/**
 * The card's gate lines, wherever its layout puts them: `<mark> <name> <detail>`, the box, a row label
 * and the padding left out, runs of spaces as one.
 */
export function gateLinesOf(output: string): string[] {
	return output.split('\n').flatMap(function gateLine(line) {
		const match = /^│\s+(?:gates\s+)?([✓!✗] \S.*?)\s*│$/.exec(line)
		return match ? [match[1].replace(/ {2,}/g, ' ')] : []
	})
}

/**
 * A branch `feat/x` cut from main with one commit on it, then back on main: the commit is made by a real
 * `handover run` of the scratch package's lot (its hook ran and left its record) when `recorded`, else by a
 * plain `git commit --no-verify` (no record anywhere). `mainMoved` adds a commit on main after the cut, in
 * a file the branch does not touch. Returns the repository and the branch tip.
 */
export async function createBranchScenario(params: {
	recorded: boolean
	mainMoved: boolean
	hookCounter: string
	gateCounter: string
	/** The branch commit also changes `package-lock.json`. */
	lockChange?: boolean
	/** A green `gate --full` is run on the branch tip's tree (the branch checked out, clean). */
	gateOnTip?: boolean
	/** Added to the hook's script. */
	hookExtra?: string
}): Promise<{ root: string; tip: string }> {
	const root = createHookedPackage({
		hookCounter: params.hookCounter,
		gateCounter: params.gateCounter,
		...(params.hookExtra && { hookExtra: params.hookExtra }),
		...(params.lockChange && { packageLock: PACKAGE_LOCK_BEFORE }),
	})
	const lot = {
		...READ_LOT,
		paths: [...READ_LOT.paths, ...(params.lockChange ? ['package-lock.json'] : [])],
	}
	git({ root, args: ['checkout', '-q', '-b', BRANCH_NAME] })
	editReadLot(root)
	if (params.lockChange) writeFiles({ root, files: { 'package-lock.json': PACKAGE_LOCK_AFTER } })
	if (params.recorded) {
		const { out } = writeHandoverFolder({ root, lots: [lot], branch: BRANCH_NAME })
		const ran = await runFolder({ out })
		expect(ran.exitCode).toBe(0)
	} else {
		git({ root, args: ['add', '--', ...lot.paths] })
		git({ root, args: ['commit', '-q', '--no-verify', '-m', 'feat(read): read answers one'] })
	}
	const tip = headOf(root)
	if (params.gateOnTip) await seedFullGate(root)
	git({ root, args: ['checkout', '-q', 'main'] })
	if (params.mainMoved) {
		writeFiles({ root, files: { 'docs/notes.md': 'notes\n' } })
		git({ root, args: ['add', '--', 'docs/notes.md'] })
		git({ root, args: ['commit', '-q', '--no-verify', '-m', 'docs(notes): notes'] })
	}
	return { root, tip }
}

/** The hand-over of one merge lot bringing `feat/x` in, no conflict to resolve. */
export function writeMergeHandover(params: { root: string; tip: string }): {
	out: string
	output: string
} {
	const mergeLot: MergeLotPlan = {
		kind: 'merge',
		branch: BRANCH_NAME,
		tip: params.tip,
		resolved: {},
		message: 'merge: bring feat/x in',
	}
	return writeHandoverFolder({ root: params.root, lots: [mergeLot] })
}

/** The hand-over folder read back (what the rehearsal's plan reads). */
export function readFolder(out: string): HandoverFolder {
	const handover = readHandoverFolder(out)
	if (typeof handover === 'string')
		throw new Error(`the hand-over folder cannot be read: ${handover}`)
	return handover
}

/**
 * A hooked package with one lot, its hand-over written, a `gate --full` seeded as the variant says; `reason`
 * is what the decision for the lot says (a string), or undefined when any reason is fine; `full` whether the
 * rehearsal is asked to rehearse every lot.
 */
export async function createRehearsedScenario(variant: RehearsedVariant): Promise<{
	root: string
	hookCounter: string
	out: string
	reason: string | undefined
	full: boolean
}> {
	const hookCounter = createCounter()
	const lock = variant === 'the lot changes package-lock.json'
	const root = createHookedPackage({
		hookCounter,
		gateCounter: createCounter(),
		...(variant === 'the hook stages files' && { hookExtra: 'git add src/read.ts' }),
		...(lock && { packageLock: PACKAGE_LOCK_BEFORE }),
		...(variant === 'a linked dependency changed since the gate' && { linkedDependency: true }),
	})
	let reason: string | undefined
	if (variant === 'a gate of an earlier tree') {
		writeFiles({ root, files: { 'src/read.ts': 'export function read() {\n\treturn 1\n}\n' } })
		await seedFullGate(root)
		editReadLot(root)
		reason = `no green gate --full on tree ${treeOfWorkingFiles(root).slice(0, SHORT_SHA_LENGTH)}`
	} else {
		editReadLot(root)
		if (lock) writeFiles({ root, files: { 'package-lock.json': PACKAGE_LOCK_AFTER } })
		if (variant !== 'no gate record') await seedFullGate(root)
		if (variant === 'no gate record')
			reason = `no green gate --full on tree ${treeOfWorkingFiles(root).slice(0, SHORT_SHA_LENGTH)}`
		if (lock) reason = 'the lot changes package-lock.json'
		if (variant === 'the hook stages files') reason = 'the hook stages files (git add)'
		if (variant === '--full') reason = '--full'
		if (variant === 'node_modules/.package-lock.json changed since the gate') {
			writeFiles({ root, files: { 'node_modules/.package-lock.json': '{"packages":{}}\n' } })
			reason = 'node_modules changed since the record'
		}
		if (variant === 'a linked dependency changed since the gate') {
			writeFiles({ root: join(root, '..', 'dep'), files: { 'lib/a.js': 'one, and more\n' } })
			reason = 'a linked dependency changed since the record'
		}
	}
	const { out } = writeHandoverFolder({
		root,
		lots: [{ ...READ_LOT, paths: [...READ_LOT.paths, ...(lock ? ['package-lock.json'] : [])] }],
	})
	return { root, hookCounter, out, reason, full: variant === '--full' }
}

/** A hooked package with the lot edited, a green `gate --full` of its tree, and the hand-over written. */
export async function createReusableScenario(params: { gateArgv?: string[] } = {}): Promise<{
	root: string
	hookCounter: string
	out: string
	output: string
}> {
	const hookCounter = createCounter()
	const root = createHookedPackage({ hookCounter, gateCounter: createCounter() })
	editReadLot(root)
	const gate = await runGateIn({ cwd: root, argv: params.gateArgv ?? ['--full'] })
	expect(gate.exitCode).toBe(0)
	return { root, hookCounter, ...writeReadLotHandover(root) }
}

/** The line a rehearsal prints for a lot: `lot <index>/<count>  <decision>  <reason>`. */
export function lotLine(params: {
	index: number
	count: number
	decision: 'reused' | 'rehearse'
	reason: string
}): string {
	return `lot ${params.index}/${params.count}  ${params.decision}  ${params.reason}`
}

/** The rehearsal's line for a lot as a pattern over a whole line: the reason is text, or a pattern. */
export function lotLinePattern(params: {
	index: number
	count: number
	decision: 'reused' | 'rehearse'
	reason: string | RegExp
}): RegExp {
	const reason =
		typeof params.reason === 'string'
			? params.reason.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
			: params.reason.source
	return new RegExp(`^lot ${params.index}/${params.count} {2}${params.decision} {2}${reason}$`, 'm')
}

/** The card's gate lines of the gate steps: the rules, review and standard lines left out. */
export function gateStepLinesOf(output: string): string[] {
	return gateLinesOf(output).filter((line) => !/^[✓!✗] (rules|review|standard)\b/.test(line))
}
