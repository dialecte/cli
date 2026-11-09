/**
 * The moves of a change's cases, read from the run's cases: exactly by their test call (`findMovedCases`,
 * static), then by name for the cases a runner registers with no exact move (`findMovedByName`), whose base
 * names exist only at run time: one collect-only run over the base text of the candidate source files, paid
 * only when a split is detected statically (a source deleted, or one whose base ran a registering statement
 * it no longer runs) and such a case is new or changed. That run happens in a scratch copy of the base tree outside the
 * worktree (its `node_modules` linked), removed when it ends: nothing of it stays behind.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { findMovedByName, findMovedCases, movedCaseLabels } from './moved-cases.ts'
import { runTestCases } from './run-test-cases.ts'
import { caseLabel, readRunCases } from './select-cases.ts'
import { listDeletedTestFiles, readAtBase } from './tdd-files.ts'
import { BASE_COLLECT_TIMEOUT_MS } from './tdd.constants.ts'
import { testCodeTokens } from './test-code-tokens.ts'
import { indexTestCalls, listSurroundings, testCallAt } from './test-source.ts'

import type { PackageJson } from '../package-json.types.ts'
import type {
	BaseCollect,
	ChangedTestFile,
	DeletedTestFile,
	NamedRegistration,
	RunCase,
	TddMoves,
	TestCallIndex,
} from './tdd.types.ts'
import type { ChildProcess } from 'node:child_process'

/** The moves of the cases of `files` (the new and changed test files of the run) from the base. */
export async function readMoves(params: {
	root: string
	base: string
	packageJson: PackageJson
	files: readonly ChangedTestFile[]
	cases: readonly RunCase[]
}): Promise<TddMoves> {
	const { root, base } = params
	const deleted = listDeletedTestFiles({ root, base }).flatMap((file): DeletedTestFile[] => {
		const baseText = readAtBase({ root, base, file })
		return baseText === undefined ? [] : [{ file, baseText }]
	})
	const exact = findMovedCases({
		files: params.files,
		deleted,
		cases: params.cases.map((testCase) => ({
			file: testCase.file,
			name: testCase.name,
			project: testCase.project,
			location: testCase.location,
		})),
	})
	const movedExactly = movedCaseLabels({ exact, byName: { groups: [], ambiguous: [] } })
	const registrations = runnerRegistrations({
		files: params.files,
		cases: params.cases.filter((testCase) => !movedExactly.has(caseLabel(testCase))),
	})
	const owing = registrations.some(({ testCase }) => testCase.ofChange)
	// a split is detected statically: a source deleted, or one whose base ran a registering statement it no
	// longer runs (a row added to a table keeps its loop: no split, no base collect)
	const sources = [
		...deleted,
		...params.files.flatMap((file): DeletedTestFile[] =>
			file.baseText !== undefined &&
			lostRegistering({ file: file.file, baseText: file.baseText, text: file.text })
				? [{ file: file.file, baseText: file.baseText }]
				: [],
		),
	]
	const none = { groups: [], ambiguous: [] }
	if (!owing || sources.length === 0) return { exact, byName: none }
	const collected = await collectAtBase({ root, base, packageJson: params.packageJson, sources })
	if ('failure' in collected.result)
		return {
			exact,
			byName: none,
			baseCollect: { ...collected.baseCollect, failure: collected.result.failure },
		}
	// a source counts when the change deletes it, or it registers fewer cases now than at the base
	const deletedFiles = new Set(deleted.map((file) => file.file))
	const countNow = countByFile(params.cases)
	const countAtBase = countByFile(collected.result)
	const baseCases = collected.result.filter(
		(registration) =>
			deletedFiles.has(registration.file) ||
			(countAtBase.get(registration.file) ?? 0) > (countNow.get(registration.file) ?? 0),
	)
	return {
		exact,
		byName: findMovedByName({
			cases: registrations.map(({ registration }) => registration),
			baseCases,
		}),
		baseCollect: collected.baseCollect,
	}
}

/** The cases with their moves applied: a moved case is a case of the base (not of the change). */
export function applyMoves(params: { cases: readonly RunCase[]; moves: TddMoves }): RunCase[] {
	const moved = movedCaseLabels(params.moves)
	return params.cases.map((testCase) =>
		moved.has(caseLabel(testCase)) ? { ...testCase, ofChange: false, ofBase: true } : testCase,
	)
}

/**
 * The cases a runner registers (the call at their location is no test call: a helper's), each with that
 * call's text; a case at a test call (or with no location) is none.
 */
function runnerRegistrations(params: {
	files: readonly ChangedTestFile[]
	cases: readonly RunCase[]
}): Array<{ testCase: RunCase; registration: NamedRegistration }> {
	const textByFile = new Map(params.files.map((file) => [file.file, file.text]))
	const indexes = new Map<string, TestCallIndex>()
	return params.cases.flatMap((testCase) => {
		const text = textByFile.get(testCase.file)
		if (text === undefined || !testCase.location) return []
		const runner = runnerAt({ file: testCase.file, text, location: testCase.location, indexes })
		if (runner === undefined) return []
		return [
			{
				testCase,
				registration: {
					file: testCase.file,
					name: testCase.name,
					project: testCase.project,
					runner,
				},
			},
		]
	})
}

/** The runner call at the location, or undefined when the location is a test call; each file parsed once. */
function runnerAt(params: {
	file: string
	text: string
	location: NonNullable<RunCase['location']>
	indexes: Map<string, TestCallIndex>
}): string | undefined {
	const index = params.indexes.get(params.file) ?? indexTestCalls(params)
	params.indexes.set(params.file, index)
	if (testCallAt({ index, location: params.location })) return undefined
	return index.callTextAt(params.location) ?? ''
}

/**
 * The changed file may have lost cases a runner registered: its base text runs a statement holding a call,
 * outside its test calls, that its text now no longer runs under the same describe path (by tokens).
 */
function lostRegistering(params: { file: string; baseText: string; text: string }): boolean {
	const { file } = params
	function keysOf(text: string): string[] {
		return listSurroundings({ text, file })
			.statements.filter((statement) => statement.calls)
			.map((statement) => `${statement.path}\0${testCodeTokens({ text: statement.text, file })}`)
	}
	const now = new Set(keysOf(params.text))
	return keysOf(params.baseText).some((key) => !now.has(key))
}

/**
 * The cases the base registered in the source files, each with its runner call (undefined for a direct test
 * call): one collect-only run, bounded, in a scratch copy of the base tree outside the worktree, removed after.
 */
async function collectAtBase(params: {
	root: string
	base: string
	packageJson: PackageJson
	sources: readonly DeletedTestFile[]
}): Promise<{ result: NamedRegistration[] | { failure: string }; baseCollect: BaseCollect }> {
	const started = Date.now()
	const folder = mkdtempSync(join(tmpdir(), 'dialecte-base-collect-'))
	function baseCollect(): BaseCollect {
		return { files: params.sources.length, milliseconds: Date.now() - started }
	}
	try {
		const copied = await copyBaseTree({ root: params.root, base: params.base, folder })
		if (copied) return { result: { failure: copied }, baseCollect: baseCollect() }
		const modules = await runTestCases({
			root: folder,
			files: params.sources.map((source) => source.file),
			filter: 'collect',
			timeoutMs: BASE_COLLECT_TIMEOUT_MS,
		})
		if ('failure' in modules) return { result: modules, baseCollect: baseCollect() }
		const files = params.sources.map((source) => ({
			file: source.file,
			text: source.baseText,
			baseText: source.baseText,
		}))
		const { cases } = readRunCases({
			root: folder,
			packageJson: params.packageJson,
			modules,
			files,
		})
		const indexes = new Map<string, TestCallIndex>()
		const textByFile = new Map(files.map((file) => [file.file, file.text]))
		const result = cases.map((testCase): NamedRegistration => ({
			file: testCase.file,
			name: testCase.name,
			project: testCase.project,
			runner: testCase.location
				? runnerAt({
						file: testCase.file,
						text: textByFile.get(testCase.file) ?? '',
						location: testCase.location,
						indexes,
					})
				: undefined,
		}))
		return { result, baseCollect: baseCollect() }
	} finally {
		rmSync(folder, { recursive: true, force: true })
	}
}

/**
 * Writes the package's tree at the base into `folder` (`git archive`), and links the `node_modules` the
 * package resolves from, so the base files import what they imported; why it could not, or undefined.
 */
async function copyBaseTree(params: {
	root: string
	base: string
	folder: string
}): Promise<string | undefined> {
	// streamed from git into tar: nothing buffered, the event loop (and the running line) stays live
	const archive = spawn('git', ['archive', '--format=tar', `${params.base}:./`], {
		cwd: params.root,
		stdio: ['ignore', 'pipe', 'pipe'],
	})
	const extract = spawn('tar', ['-x', '-C', params.folder], { stdio: ['pipe', 'ignore', 'pipe'] })
	// a broken pipe (tar gone early, git failing to start) answers through the exit codes, never as a crash
	let pipeError = ''
	function notePipeError(error: Error): void {
		pipeError ||= error.message
	}
	archive.stdout.on('error', notePipeError)
	extract.stdin.on('error', notePipeError)
	archive.stdout.pipe(extract.stdin)
	const [archived, extracted] = await Promise.all([
		endOf({ child: archive }),
		endOf({ child: extract }),
	])
	if (archived.code !== 0) return `git archive failed: ${archived.errors.trim()}`
	if (extracted.code !== 0 || pipeError)
		return `tar failed: ${[extracted.errors.trim(), pipeError].filter(Boolean).join('; ')}`
	const modules = nearestNodeModules(params.root)
	if (modules) symlinkSync(modules, join(params.folder, 'node_modules'))
	return undefined
}

/** How a child ended: its exit code (undefined when it could not start) and what it printed on stderr. */
function endOf(params: {
	child: ChildProcess
}): Promise<{ code: number | null | undefined; errors: string }> {
	return new Promise(function settle(resolve) {
		let errors = ''
		params.child.stderr?.on('data', (chunk: Buffer) => {
			errors += chunk.toString()
		})
		params.child.on('error', (error) => resolve({ code: undefined, errors: error.message }))
		params.child.on('close', (code) => resolve({ code, errors }))
	})
}

/** The `node_modules` folder the package resolves its packages from: its own, else the nearest above it. */
function nearestNodeModules(root: string): string | undefined {
	for (let folder = root; ; folder = dirname(folder)) {
		const candidate = join(folder, 'node_modules')
		if (existsSync(candidate)) return candidate
		if (dirname(folder) === folder) return undefined
	}
}

/** How many cases each file holds, every project counted. */
function countByFile(cases: ReadonlyArray<{ file: string }>): Map<string, number> {
	const counts = new Map<string, number>()
	for (const { file } of cases) counts.set(file, (counts.get(file) ?? 0) + 1)
	return counts
}
