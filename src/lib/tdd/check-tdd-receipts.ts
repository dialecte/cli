import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { closestNames } from '../closest-names.ts'
import { listRepositoryFiles } from '../git.ts'
import { shellWord } from '../shell-quote.ts'
import { shortMessage } from './classify-failure.ts'
import { writtenLinesOf } from './duplicate-case-ids.ts'
import {
	entryNamesCase,
	entryNamesFile,
	findCaseEntry,
	listRevisedHelpers,
	namesOneCase,
	namesRevisedHelper,
	readAcceptances,
	readGoneEntries,
	readMovedEntries,
	findMovedFrom,
	readRevisions,
	readTddExemption,
} from './lot-declaration.ts'
import { movedLines } from './moved-cases.ts'
/**
 * The `tdd` step of `dialecte gate`: every test-code file changed since the base (HEAD: the uncommitted
 * lot; a `--base` ref or `--full`: the whole branch) is as the red run that last froze it left it, and
 * every case of the change holds a red receipt and a later green one (or passed at a red run as the same
 * case as at the base, accepted or revised by the lot file, each with its reason shown; a helper a red run
 * froze for a `revised` entry is shown with its reason too). The flags of the receipts, the receipts the
 * read rule skips (one line per case), the moved cases (one line per source), the cases the change deletes
 * (the untitled test calls the lot file declares gone, with its reason) and the entries of the lot file
 * nothing used are shown for the review. A lot the orchestrator
 * declared exempt in `.dialecte/lot.json` passes with its reason and what the change touches; a package
 * that does not test with vitest and touches no test code of another runner (`node:test`, pytest) skips the step.
 */
import { caseLabel } from './select-cases.ts'
import { resolveTddBase, shortCommitOf } from './tdd-base.ts'
import {
	countChangedFiles,
	hashChangedTestCode,
	isPackageTestCode,
	isTestFile,
	listChangedSince,
	listChangedTestFiles,
	listDeletedSince,
	listDeletedTestFiles,
	readAtBase,
	readLedger,
} from './tdd-files.ts'
import { findingLine, movesLines, readTddState, skippedReceiptsLine } from './tdd-state.ts'
import {
	DUPLICATE_GATE_REASON,
	DUPLICATE_LABEL,
	DUPLICATE_LINES_DETAIL,
	TDD_BASE_LINE,
	TDD_NEXT_STEPS,
	UNUSED_ENTRY_CLOSEST,
	UNUSED_ENTRY_CLOSEST_LIMIT,
	UNUSED_ENTRY_REMOVE,
	VITEST_PACKAGE,
} from './tdd.constants.ts'
import { runnerOf } from './test-runner.ts'
import { readVitestConfigs } from './vitest-configs.ts'
import { zeroCaseLines } from './zero-case-verdict.ts'

import type { PackageJson } from '../package-json.types.ts'
import type { TddBase, TddCheck, TddState, VitestConfigs } from './tdd.types.ts'

export async function checkTddReceipts(params: {
	root: string
	packageJson: PackageJson
	/** `--base <ref>`: measured from where HEAD left it. */
	ref?: string
	/** `--full`: the whole branch, before a merge. Default: HEAD, the uncommitted lot. */
	wholeBranch?: boolean
}): Promise<TddCheck> {
	const { root, packageJson } = params
	const resolved = resolveTddBase({
		root,
		packageJson,
		ref: params.ref,
		wholeBranch: params.wholeBranch,
	})
	if ('failure' in resolved) return { status: 'failed', reason: resolved.failure }
	const check = await judgeTddReceipts({ root, packageJson, base: resolved.commit })
	if (!params.wholeBranch) return check
	return { ...check, baseNote: baseNoteOf({ root, base: resolved }) }
}

/**
 * The line the whole-branch step shows beside its base: a fallback note as it reads (it names the cut already), else
 * `tdd base: <short> (<source>)`.
 */
function baseNoteOf(params: { root: string; base: TddBase }): string {
	const { base } = params
	if (base.note !== undefined) return base.note
	const short = shortCommitOf({ root: params.root, commit: base.commit })
	return TDD_BASE_LINE.replace('{commit}', () => short).replace('{source}', () => base.source)
}

/** The step's judgement of the change since `base`. */
async function judgeTddReceipts(params: {
	root: string
	packageJson: PackageJson
	base: string
}): Promise<TddCheck> {
	const { root, packageJson, base } = params
	const exemption = readTddExemption(root)
	if (exemption.kind === 'invalid') return { status: 'failed', reason: exemption.reason }
	if (exemption.kind === 'exempt') {
		const changed = countChangedFiles({ root, base, packageJson })
		return {
			status: 'passed',
			cases: [],
			note: `exempt: ${exemption.reason} (${changed.production} production file(s), ${changed.test} test file(s) changed)`,
		}
	}
	if (!testsWithVitest(packageJson) && !changesTestsOfOtherRunner({ root, base, packageJson }))
		return { status: 'skipped', reason: 'the package does not test with vitest' }
	const ledger = readLedger(root)
	if ('failure' in ledger) return { status: 'failed', reason: ledger.failure }
	const acceptances = readAcceptances(root)
	if ('failure' in acceptances) return { status: 'failed', reason: acceptances.failure }
	const revisions = readRevisions(root)
	if ('failure' in revisions) return { status: 'failed', reason: revisions.failure }
	const gone = readGoneEntries(root)
	if ('failure' in gone) return { status: 'failed', reason: gone.failure }
	const moves = readMovedEntries(root)
	if ('failure' in moves) return { status: 'failed', reason: moves.failure }
	const testCode = hashChangedTestCode({ root, base, packageJson })
	// a change that only deletes test files still lists their cases, as deleted
	if (testCode.size === 0 && listDeletedTestFiles({ root, base }).length === 0)
		return { status: 'passed', cases: [], note: 'no test code new or changed since the base' }
	const state = await readTddState({ root, packageJson, ledger, base })
	if ('failure' in state)
		return {
			status: 'failed',
			reason: state.failure,
			...(state.tail && { lines: [...state.tail] }),
		}
	const cases = state.cases.map((line) => ({ label: caseLabel(line), status: line.status }))
	// the grouped moved lines, kept in the gate record for the hand-over card
	const moved = state.moves ? movedLines(state.moves).grouped : []
	const open = state.cases.filter(
		(line) =>
			line.status !== 'green' &&
			line.status !== 'unchanged' &&
			line.status !== 'accepted' &&
			line.status !== 'revised',
	)
	const revisedHelpers = listRevisedHelpers({ ledger, testCode, revisions })
	const evidence = [
		...revisedHelpers.map(({ file, entry }) => `revised  ${file}  ${entry.reason}`),
		...state.cases
			.filter((line) => line.status === 'revised')
			.map(
				(line) =>
					`revised  ${caseLabel(line)}  ${findCaseEntry({ entries: revisions, testCase: line, list: 'revised' })?.reason ?? '(no longer in the lot file)'}`,
			),
		...state.cases
			.filter((line) => line.status === 'accepted')
			.map(
				(line) =>
					`accepted  ${caseLabel(line)}  ${findCaseEntry({ entries: acceptances, testCase: line, list: 'accept' })?.reason ?? '(no longer in the lot file)'}`,
			),
		...state.findings.map(findingLine),
		...movesLines(state.moves),
		...state.cases.flatMap((line) => skippedReceiptsLine(line) ?? []),
		...state.cases
			.filter((line) => line.flags.length)
			.map((line) => `flag  ${caseLabel(line)}  ${line.flags.join(', ')}`),
	]
	const labels = state.cases.map((line) => caseLabel(line))
	const files = [...new Set(state.cases.map((line) => line.file))]
	const revisedCases = state.cases.filter((line) => line.status === 'revised')
	evidence.push(
		...acceptances
			.filter(
				(acceptance) =>
					!state.cases.some((line) =>
						entryNamesCase({ entry: acceptance.case, testCase: line, list: 'accept' }),
					),
			)
			.map((acceptance) =>
				unusedEntryLine({
					head: 'unused accept',
					list: 'accept',
					entry: acceptance.case,
					why: 'no case of the change has that name',
					reason: acceptance.reason,
					candidates: labels,
				}),
			),
		...revisions
			.filter(
				(revision) =>
					!revisedCases.some((line) =>
						entryNamesCase({ entry: revision.case, testCase: line, list: 'revised' }),
					) && !namesRevisedHelper({ entry: revision, helpers: revisedHelpers }),
			)
			.map((revision) =>
				unusedEntryLine({
					head: 'unused revised entry',
					list: 'revised',
					entry: revision.case,
					why: 'no case of the change stands revised by a red run',
					reason: revision.reason,
					candidates: namesOneCase(revision.case) ? labels : files,
				}),
			),
		...gone
			.filter(
				(entry) =>
					!state.findings.some(
						(finding) =>
							finding.verb === 'gone' && entryNamesFile({ entry: entry.file, file: finding.file }),
					),
			)
			.map((entry) =>
				unusedEntryLine({
					head: 'unused gone entry',
					list: 'gone',
					entry: entry.file,
					why: 'no test call of the base gone without a title in a file it names',
					reason: entry.reason,
					candidates: files,
				}),
			),
		...moves
			.filter(
				(entry) =>
					!state.cases.some(
						(line) => findMovedFrom({ entries: [entry], testCase: line }) !== undefined,
					),
			)
			.map((entry) =>
				unusedEntryLine({
					head: 'unused moved entry',
					list: 'moved',
					entry: entry.to,
					why: `no case of the change carries a red from ${entry.from}`,
					candidates: namesOneCase(entry.to) ? labels : files,
				}),
			),
	)
	const zeroCases = state.zeroCases ?? []
	// a file that ran no case fails the step as a file whose cases cannot be listed; a non-vitest file only shows
	const unlisted = [
		...state.unlisted.map(
			(file) =>
				`cannot list  ${file.file}  ${file.failure.kind}: ${shortMessage(file.failure.message).split('\n')[0]}`,
		),
		...zeroCaseLines({ refused: zeroCases, notVitest: [], pytestIgnored: [] }),
	]
	evidence.push(
		...zeroCaseLines({
			refused: [],
			notVitest: state.notVitest ?? [],
			pytestIgnored: state.pytestIgnored ?? [],
		}),
	)
	const caseLines = open.map((line) => `${line.status}  ${caseLabel(line)}`)
	// a shared id names no single case: whatever else is wrong, the step says it first
	if (state.duplicates.length) {
		const files = [...new Set(state.duplicates.map((duplicate) => duplicate.file))]
		return {
			status: 'failed',
			cases,
			duplicates: state.duplicates,
			reason: DUPLICATE_GATE_REASON.replace('{count}', () => String(files.length)).replace(
				'{files}',
				() => files.join(', '),
			),
			lines: [
				...state.duplicates.map(
					(duplicate) =>
						`${DUPLICATE_LABEL}  ${caseLabel(duplicate)}  ${DUPLICATE_LINES_DETAIL.replace('{lines}', () => writtenLinesOf(duplicate))}`,
				),
				...caseLines,
				...unlisted,
				...evidence,
				TDD_NEXT_STEPS,
			],
		}
	}
	if (state.unfrozen.length)
		return {
			status: 'failed',
			cases,
			reason: `test code changed outside tdd red: ${state.unfrozen.join(', ')}`,
			lines: [...caseLines, ...unlisted, ...evidence, TDD_NEXT_STEPS],
		}
	if (open.length || unlisted.length)
		return {
			status: 'failed',
			cases,
			reason: `${open.length} of ${state.cases.length} case(s) of the change without a red receipt then a green one${state.unlisted.length ? `; ${state.unlisted.length} test file(s) whose cases cannot be listed` : ''}${zeroCases.length ? `; ${zeroCases.length} test file(s) that ran no case` : ''}`,
			lines: [...caseLines, ...unlisted, ...evidence, TDD_NEXT_STEPS],
		}
	const counts = [
		countStatus({ state, status: 'green' })
			? `${countStatus({ state, status: 'green' })} red then green`
			: '',
		countStatus({ state, status: 'unchanged' })
			? `${countStatus({ state, status: 'unchanged' })} unchanged`
			: '',
		countStatus({ state, status: 'accepted' })
			? `${countStatus({ state, status: 'accepted' })} accepted`
			: '',
		countStatus({ state, status: 'revised' })
			? `${countStatus({ state, status: 'revised' })} revised`
			: '',
	].filter(Boolean)
	return {
		status: 'passed',
		cases,
		note: state.cases.length
			? `${state.cases.length} case(s) of the change: ${counts.join(', ')}`
			: 'no test case of the change',
		...(evidence.length && { details: evidence }),
		...(moved.length && { moved }),
	}
}

function countStatus(params: { state: TddState; status: string }): number {
	return params.state.cases.filter((line) => line.status === params.status).length
}

function testsWithVitest(packageJson: PackageJson): boolean {
	return Boolean(
		packageJson.devDependencies?.[VITEST_PACKAGE] ?? packageJson.dependencies?.[VITEST_PACKAGE],
	)
}

/**
 * The change touches test code of a runner other than vitest (`node:test`, pytest): a changed test file of that
 * runner; a deleted one (its runner read from its base text); or other test code (a helper, a fixture, a conftest)
 * changed or deleted in a package that holds a test file of that runner.
 */
function changesTestsOfOtherRunner(params: {
	root: string
	base: string
	packageJson: PackageJson
}): boolean {
	const { root, base, packageJson } = params
	const configs = readVitestConfigs({ root })
	if (
		listChangedTestFiles({ root, base }).some((changed) =>
			isOtherRunnerFile({ root, file: changed.file, text: changed.text, configs }),
		)
	)
		return true
	if (
		listDeletedTestFiles({ root, base }).some((file) =>
			isOtherRunnerFile({ root, file, text: readAtBase({ root, base, file }) ?? '', configs }),
		)
	)
		return true
	const touchesOtherTestCode = [
		...listChangedSince({ root, base }),
		...listDeletedSince({ root, base }),
	].some((file) => !isTestFile({ root, file }) && isPackageTestCode({ root, file, packageJson }))
	return touchesOtherTestCode && holdsOtherRunnerFile({ root, configs })
}

/** The package holds a test file of a runner other than vitest. */
function holdsOtherRunnerFile(params: { root: string; configs: VitestConfigs }): boolean {
	const { root, configs } = params
	return listRepositoryFiles({ root, folder: '.' }).some(function isOtherRunnerTestFile(file) {
		const path = join(root, file)
		if (!isTestFile({ root, file }) || !existsSync(path)) return false
		return isOtherRunnerFile({ root, file, text: readFileSync(path, 'utf8'), configs })
	})
}

/** The test file runs under a known runner other than vitest. */
function isOtherRunnerFile(params: {
	root: string
	file: string
	text: string
	configs: VitestConfigs
}): boolean {
	const runner = runnerOf(params)
	return runner !== undefined && runner !== 'vitest'
}

/**
 * The line of a lot file entry that matches nothing: what it names and why it is unused, the closest real label of the
 * change (`candidates`: its case labels, or its test files), its reason, and the verb that drops it.
 */
function unusedEntryLine(params: {
	head: string
	list: string
	entry: string
	why: string
	/** The entry's reason; a `moved` entry has none. */
	reason?: string
	candidates: readonly string[]
}): string {
	const [closest] = closestNames({
		name: params.entry,
		candidates: params.candidates,
		limit: UNUSED_ENTRY_CLOSEST_LIMIT,
	})
	const named = closest === undefined ? '' : UNUSED_ENTRY_CLOSEST.replace('{label}', () => closest)
	const remove = UNUSED_ENTRY_REMOVE.replace('{list}', params.list).replace('{entry}', () =>
		shellWord(params.entry),
	)
	const reason = params.reason === undefined ? '' : ` (${params.reason})`
	return `${params.head}  ${params.entry}  ${params.why}${named}${reason}${remove}`
}
