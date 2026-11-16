/**
 * A changed test helper no changed test file depends on can be shaped by no red: the unchanged test files importing
 * it stand for it instead. They run with the helper as it is now; passing, they freeze it (a refactor of test code,
 * proven by the tests that read it); one failing with it, or none importing it, leaves it unfrozen with the reason (a
 * `revised` entry naming it still lets a red run freeze it).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { listRepositoryFiles } from '../git.ts'
import { frozenHashOf } from './case-status.ts'
import { modulesOf } from './select-cases.ts'
import { isTestFile } from './tdd-files.ts'
import {
	HELPER_DEPENDENT_FAILS,
	HELPER_DEPENDENTS_RAN_NO_CASE,
	HELPER_FROZEN_THROUGH_DEPENDENTS,
	HELPER_IMPORTED_BY_NONE,
} from './tdd.constants.ts'
import { writtenNameOf } from './written-name.ts'

import type { HelperVerdict, ReportedModule, TddLedger } from './tdd.types.ts'

/**
 * The changed helpers a red run has not frozen and no changed test file depends on (`changedDependents`), each
 * differing from its last freeze.
 */
export function listOrphanHelpers(params: {
	root: string
	ledger: TddLedger
	/** The test code changed since the base, with its hash now. */
	testCode: ReadonlyMap<string, string>
	/** The test code the run freezes so far. */
	frozen: Readonly<Record<string, string>>
	/** The changed test files depending on the helper. */
	changedDependents: (helper: string) => string[]
}): string[] {
	return [...params.testCode]
		.filter(
			([file, hash]) =>
				!isTestFile({ root: params.root, file }) &&
				!(file in params.frozen) &&
				frozenHashOf({ ledger: params.ledger, file }) !== hash &&
				params.changedDependents(file).length === 0,
		)
		.map(([file]) => file)
}

/**
 * The unchanged test files of the repository importing each helper (by `dependenciesOf`), in path order. A test file
 * whose text never writes the helper's name (its file name without extension, a folder's for an `index`) cannot
 * import it nor read it by name: never parsed.
 */
export function listUnchangedDependents(params: {
	root: string
	helpers: readonly string[]
	/** The test files changed since the base: never a dependent standing for a helper. */
	changed: ReadonlySet<string>
	dependenciesOf: (file: string) => readonly string[]
}): Map<string, string[]> {
	const testFiles = listRepositoryFiles({ root: params.root, folder: '.' })
		.filter((file) => !params.changed.has(file) && isTestFile({ root: params.root, file }))
		.sort()
	const texts = new Map<string, string>()
	/** The test file's text, read once. */
	function textOf(file: string): string {
		const text = texts.get(file) ?? readFileSync(join(params.root, file), 'utf8')
		texts.set(file, text)
		return text
	}
	return new Map(
		params.helpers.map((helper) => {
			const name = writtenNameOf(helper)
			return [
				helper,
				testFiles.filter(
					(file) => textOf(file).includes(name) && params.dependenciesOf(file).includes(helper),
				),
			]
		}),
	)
}

/**
 * Each helper's verdict from the run of its unchanged dependents (`modules`, absolute paths): frozen when every
 * dependent ran with no failing case and no error, unfrozen naming the failing ones, or none importing it.
 */
export function judgeHelpers(params: {
	root: string
	dependents: ReadonlyMap<string, readonly string[]>
	modules: readonly ReportedModule[]
}): HelperVerdict[] {
	return [...params.dependents].map(function verdictOf([file, dependents]): HelperVerdict {
		if (dependents.length === 0) return { file, frozen: false, detail: HELPER_IMPORTED_BY_NONE }
		const outcomes = dependents.map((dependent) => ({
			dependent,
			outcome: outcomeOf({ root: params.root, modules: params.modules, file: dependent }),
		}))
		const failing = outcomes.filter(({ outcome }) => outcome === 'failed')
		if (failing.length > 0)
			return {
				file,
				frozen: false,
				detail: HELPER_DEPENDENT_FAILS.replace('{files}', () =>
					failing.map(({ dependent }) => dependent).join(', '),
				),
			}
		const passing = outcomes.filter(({ outcome }) => outcome === 'passed')
		if (passing.length === 0)
			return {
				file,
				frozen: false,
				detail: HELPER_DEPENDENTS_RAN_NO_CASE.replace('{files}', () => dependents.join(', ')),
			}
		return {
			file,
			frozen: true,
			detail: HELPER_FROZEN_THROUGH_DEPENDENTS.replace('{files}', () =>
				passing.map(({ dependent }) => dependent).join(', '),
			),
		}
	})
}

/**
 * How an unchanged dependent ran with the helpers (every project's module): failed (not run, an error, a failing
 * case), passed (a case passed), or none (every case skipped or pending).
 */
function outcomeOf(params: {
	root: string
	modules: readonly ReportedModule[]
	file: string
}): 'failed' | 'passed' | 'none' {
	const modules = modulesOf(params)
	if (
		modules.length === 0 ||
		modules.some(
			(module) =>
				module.errors.length > 0 || module.cases.some((testCase) => testCase.state === 'failed'),
		)
	)
		return 'failed'
	return modules.some((module) => module.cases.some((testCase) => testCase.state === 'passed'))
		? 'passed'
		: 'none'
}
