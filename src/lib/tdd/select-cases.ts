/**
 * From a vitest run of test files to the cases `tdd` reasons about: each case (per project) with its own
 * hash (its name and its test call), whether it is new or changed since the base, and how it ended; a file
 * that fails while loading is answered with its failure.
 */
import { realpathSync } from 'node:fs'
import { relative } from 'node:path'

import { isCaseOfChange } from './case-of-change.ts'
import { classifyFailure } from './classify-failure.ts'
import { hashText, isProductionPath } from './tdd-files.ts'
import { CASE_ARGUMENT_SEPARATOR } from './tdd.constants.ts'
import { testCallTextAt } from './test-source.ts'

import type { PackageJson } from '../package-json.types.ts'
import type {
	CaseFailure,
	ChangedTestFile,
	ReportedCase,
	ReportedModule,
	RunCase,
	TddTargets,
	TestCaseId,
	UnlistedFile,
} from './tdd.types.ts'

/** `src/add.test.ts::add > one` → a named case; `src/add.test.ts` → a file. */
export function parseTargets(words: readonly string[]): TddTargets {
	const cases: TddTargets['cases'] = []
	const files: string[] = []
	for (const word of words) {
		const separator = word.indexOf(CASE_ARGUMENT_SEPARATOR)
		if (separator < 0) files.push(word)
		else
			cases.push({
				file: word.slice(0, separator),
				name: word.slice(separator + CASE_ARGUMENT_SEPARATOR.length),
			})
	}
	return { cases, files }
}

/** The changed test files the command line points at (every changed one when it names none). */
export function targetFiles(params: {
	changed: readonly ChangedTestFile[]
	targets: TddTargets
}): ChangedTestFile[] {
	const { targets } = params
	const named = new Set([...targets.files, ...targets.cases.map((testCase) => testCase.file)])
	return named.size ? params.changed.filter((file) => named.has(file.file)) : [...params.changed]
}

/** Each case of the run, per project, in the order of the files then of the run. */
export function readRunCases(params: {
	root: string
	packageJson: PackageJson
	modules: readonly ReportedModule[]
	files: readonly ChangedTestFile[]
}): { cases: RunCase[]; unlisted: UnlistedFile[] } {
	const { root } = params
	const cases: RunCase[] = []
	const unlisted: UnlistedFile[] = []
	for (const file of params.files) {
		const testModule = mergeModules(modulesOf({ root, modules: params.modules, file: file.file }))
		if (!testModule) continue
		const testFile = { path: testModule.file, text: file.text }
		const isProductionFile = productionFileJudge({ root, packageJson: params.packageJson })
		if (testModule.errors.length && testModule.cases.length === 0) {
			unlisted.push({
				file: file.file,
				failure: classifyFailure({
					error: testModule.errors[0],
					testFile,
					atImport: true,
					isProductionFile,
				}),
			})
			continue
		}
		for (const reported of inStableOrder(testModule.cases)) {
			const error = reported.errors[0]
			const failure: CaseFailure | undefined =
				reported.state === 'failed' && error
					? classifyFailure({ error, testFile, atImport: false, isProductionFile })
					: undefined
			cases.push({
				file: file.file,
				name: reported.name,
				project: reported.project,
				state: reported.state,
				...(failure && { failure }),
				caseHash: hashText(
					`${reported.name}\0${reported.location ? (testCallTextAt({ text: file.text, location: reported.location }) ?? '') : ''}`,
				),
				ofChange: isCaseOfChange({ file, name: reported.name, location: reported.location }),
			})
		}
	}
	return { cases, unlisted }
}

/** The case is one the command line names (every case when it names none). */
export function isTargeted(params: { testCase: TestCaseId; targets: TddTargets }): boolean {
	const { targets, testCase } = params
	if (targets.cases.length === 0) return true
	return (
		targets.files.includes(testCase.file) ||
		targets.cases.some((named) => named.file === testCase.file && named.name === testCase.name)
	)
}

/** `file::name`, and ` [project]` when a project runs it. */
export function caseLabel(testCase: TestCaseId): string {
	return `${testCase.file}::${testCase.name}${testCase.project ? ` [${testCase.project}]` : ''}`
}

/**
 * The modules the run reported for a file relative to the root: one per project that runs it (vitest
 * answers real, absolute paths).
 */
export function modulesOf(params: {
	root: string
	modules: readonly ReportedModule[]
	file: string
}): ReportedModule[] {
	const realRoot = realpathSync(params.root)
	return params.modules.filter(
		(testModule) => relative(realRoot, realpathOr(testModule.file)) === params.file,
	)
}

/**
 * The cases of a file in the order of the file, and per project by its name: vitest reports the projects
 * of a run in the order they finish.
 */
function inStableOrder(cases: readonly ReportedCase[]): ReportedCase[] {
	const nameOrder = new Map<string, number>()
	for (const reported of cases)
		if (!nameOrder.has(reported.name)) nameOrder.set(reported.name, nameOrder.size)
	return [...cases].sort(
		(left, right) =>
			(nameOrder.get(left.name) ?? 0) - (nameOrder.get(right.name) ?? 0) ||
			left.project.localeCompare(right.project),
	)
}

/** One file's modules as one: the errors and the cases of every project. */
function mergeModules(modules: readonly ReportedModule[]): ReportedModule | undefined {
	if (modules.length === 0) return undefined
	return {
		file: modules[0].file,
		errors: modules.flatMap((testModule) => testModule.errors),
		cases: modules.flatMap((testModule) => testModule.cases),
	}
}

/** An absolute path of the package's production code (not test code, not a dependency, not outside it). */
function productionFileJudge(params: {
	root: string
	packageJson: PackageJson
}): (path: string) => boolean {
	const realRoot = realpathSync(params.root)
	return function isProductionFile(path) {
		const file = relative(realRoot, realpathOr(path))
		return (
			!file.startsWith('..') &&
			!file.startsWith('/') &&
			isProductionPath({ file, packageJson: params.packageJson })
		)
	}
}

function realpathOr(path: string): string {
	try {
		return realpathSync(path)
	} catch {
		return path
	}
}
