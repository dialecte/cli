/**
 * The state of the change's tests, as `tdd status` and the gate read it: every case of the changed test
 * files (a collect-only run) with its status, flags and the receipts the read rule skips; the test code
 * changed since the red run that last froze it; the test cases the change deletes (an untitled test call of the base, in a file a `gone` entry of
 * the lot file names, is declared gone with its reason); the files whose cases cannot be listed; the files that ran
 * no case (refused with why) and those no vitest config includes (no test code tdd measures).
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { isWrittenAsString } from './case-of-change.ts'
import { caseStatusOf, flagsOf, frozenHashOf } from './case-status.ts'
import { countingReceipts, describeSkippedReceipts } from './counting-receipts.ts'
import { findDuplicateCaseIds, isDuplicateMember } from './duplicate-case-ids.ts'
import {
	entryNamesFile,
	readAcceptances,
	readGoneEntries,
	readRevisions,
} from './lot-declaration.ts'
import { createModuleResolver } from './module-resolver.ts'
import {
	allCallsMoved,
	baseCollectLine,
	movedCaseLabels,
	movedLines,
	movedSources,
} from './moved-cases.ts'
import { readMoves } from './read-moves.ts'
import { runTestCases } from './run-test-cases.ts'
import { caseLabel, readRunCases } from './select-cases.ts'
import {
	hashChangedTestCode,
	listChangedTestFiles,
	listDeletedTestFiles,
	listMovedTestFiles,
	readAtBase,
} from './tdd-files.ts'
import { SKIPPED_RECEIPTS_LABEL, UNTITLED_CALL_GONE } from './tdd.constants.ts'
import { listTestDependencies } from './test-dependencies.ts'
import { listTestCalls } from './test-source.ts'
import { readVitestConfigs } from './vitest-configs.ts'
import { judgeZeroCaseFiles } from './zero-case-verdict.ts'

import type { PackageJson } from '../package-json.types.ts'
import type {
	CaseStatusLine,
	ChangedTestFile,
	LotGoneEntry,
	TddFinding,
	TddLedger,
	TddMoves,
	TddState,
	TestRunFailure,
} from './tdd.types.ts'

export async function readTddState(params: {
	root: string
	packageJson: PackageJson
	ledger: TddLedger
	base: string
}): Promise<TddState | TestRunFailure> {
	const { root, ledger, base } = params
	const testCode = hashChangedTestCode({ root, base, packageJson: params.packageJson })
	const unfrozen = [...testCode]
		.filter(([file, hash]) => frozenHashOf({ ledger, file }) !== hash)
		.map(([file]) => file)
	const changed = listChangedTestFiles({ root, base })
	const gone = readGoneEntries(root)
	if ('failure' in gone) return gone
	const acceptances = readAcceptances(root)
	if ('failure' in acceptances) return acceptances
	const revisions = readRevisions(root)
	if ('failure' in revisions) return revisions
	// a test file moved with its bytes: its cases listed, unchanged, with no receipt to hold
	const moved = listMovedTestFiles({ root, base })
	// in path order, as the changed files are listed
	const listed = [...changed, ...moved].sort((one, other) =>
		one.file < other.file ? -1 : one.file > other.file ? 1 : 0,
	)
	if (listed.length === 0)
		return {
			cases: [],
			duplicates: [],
			unfrozen,
			findings: findDeletedCases({ root, base, ledger, changed, gone }),
			unlisted: [],
		}
	const modules = await runTestCases({
		root,
		files: listed.map((file) => file.file),
		filter: 'collect',
	})
	if ('failure' in modules) return modules
	const { cases, unlisted } = readRunCases({
		root,
		packageJson: params.packageJson,
		modules,
		files: listed,
	})
	// read once for the state: why a changed test file ran no case
	const zeroCases = judgeZeroCaseFiles({
		root,
		configs: readVitestConfigs({ root }),
		modules,
		files: changed,
		unlisted,
		collectOnly: true,
	})
	const movedFiles = new Set(moved.map((file) => file.file))
	const duplicates = findDuplicateCaseIds(cases)
	// cases moved out of a deleted or shrunk test file keep the base's proof (no receipt needed); a name two
	// cases share names no single case to move
	const moves = await readMoves({
		root,
		base,
		packageJson: params.packageJson,
		files: changed,
		cases: cases.filter((testCase) => !isDuplicateMember({ testCase, duplicates })),
	})
	const movedCases = movedCaseLabels(moves)
	const findings = findDeletedCases({ root, base, ledger, changed, gone, moves })
	const resolveModule = createModuleResolver({ root })
	const dependencies = new Map<string, string[]>()
	/** The test code a test file depends on, read once per file. */
	function dependenciesOf(file: string): string[] {
		const known = dependencies.get(file)
		if (known) return known
		const found = listTestDependencies({
			root,
			file,
			changedTestCode: [...testCode.keys()],
			resolveModule,
			packageJson: params.packageJson,
		}).dependencies
		dependencies.set(file, found)
		return found
	}
	return {
		cases: cases.map(function statusLine(testCase): CaseStatusLine {
			const id = { file: testCase.file, name: testCase.name, project: testCase.project }
			if (movedFiles.has(testCase.file)) return { ...id, status: 'unchanged' as const, flags: [] }
			const { skipped } = countingReceipts({ ledger, testCase: id, acceptances, revisions })
			const status = caseStatusOf({
				ledger,
				testCase: id,
				testFileHash: testCode.get(testCase.file) ?? '',
				caseHash: testCase.caseHash,
				dependencies: dependenciesOf(testCase.file),
				acceptances,
				revisions,
			})
			return {
				...id,
				// a moved case with no receipt yet is the base's case, as a file moved with its bytes
				status:
					status === 'missing receipt' && movedCases.has(caseLabel(id)) ? 'unchanged' : status,
				flags: flagsOf({ ledger, testCase: id }),
				...(skipped.length && { skipped }),
			}
		}),
		duplicates,
		// a file no vitest config includes is no test code tdd measures
		unfrozen: unfrozen.filter((file) => !zeroCases.notVitest.includes(file)),
		findings,
		unlisted,
		...(zeroCases.refused.length && { zeroCases: zeroCases.refused }),
		...(zeroCases.notVitest.length && { notVitest: zeroCases.notVitest }),
		...(hasMoves(moves) && { moves }),
	}
}

/** Something moved, something is ambiguous, or a base collect ran: the state carries the moves. */
function hasMoves(moves: TddMoves): boolean {
	return (
		moves.exact.groups.length +
			moves.exact.ambiguous.length +
			moves.byName.groups.length +
			moves.byName.ambiguous.length >
			0 || moves.baseCollect !== undefined
	)
}

/**
 * The lines `tdd status` and the gate print for the moves: the grouped lines, the ambiguous cases, and the
 * base collect run (with its duration) when one ran.
 */
export function movesLines(moves: TddMoves | undefined): string[] {
	if (!moves) return []
	const { grouped, ambiguous } = movedLines(moves)
	const collect = baseCollectLine(moves)
	return [...grouped, ...ambiguous, ...(collect ? [collect] : [])]
}

/**
 * Test cases the change removes: a test call of the base whose source and title are gone from its file, a
 * test file of the base deleted, a new test file that held receipts and is gone.
 */
function findDeletedCases(params: {
	root: string
	base: string
	ledger: TddLedger
	changed: readonly ChangedTestFile[]
	/** The lot file's `gone` entries. */
	gone: readonly LotGoneEntry[]
	/** The moves of the change's cases: a test call moved to another file is not gone. */
	moves?: TddMoves
}): TddFinding[] {
	const findings: TddFinding[] = []
	const sources = params.moves ? movedSources(params.moves) : new Set<string>()
	const targetTexts = movedTargetTexts({ changed: params.changed, moves: params.moves })
	for (const file of params.changed) {
		if (file.baseText === undefined) continue
		for (const call of listTestCalls({ text: file.baseText, file: file.file })) {
			if (file.text.includes(call.text)) continue
			if (sources.has(file.file) && targetTexts.some((text) => text.includes(call.text))) continue
			if (call.title !== undefined && isWrittenAsString({ text: file.text, title: call.title }))
				continue
			if (call.title !== undefined) {
				findings.push({
					verb: 'deleted',
					file: file.file,
					detail: `the test "${call.title}" of the base is gone`,
				})
				continue
			}
			// an edited call with a computed title looks deleted: the lot file may say why
			const declared = params.gone.find((entry) =>
				entryNamesFile({ entry: entry.file, file: file.file }),
			)
			findings.push(
				declared
					? { verb: 'gone', file: file.file, detail: `${UNTITLED_CALL_GONE} (${declared.reason})` }
					: { verb: 'deleted', file: file.file, detail: UNTITLED_CALL_GONE },
			)
		}
	}
	// a deleted file every test call of which moved is reported by its moved line instead; a partial move
	// keeps the deleted finding (the cases that moved nowhere)
	const { moves } = params
	for (const file of listDeletedTestFiles(params).filter(
		(file) =>
			!moves ||
			!sources.has(file) ||
			!allCallsMoved({ file, baseText: readAtBase({ ...params, file }) ?? '', moves }),
	))
		findings.push({ verb: 'deleted', file, detail: 'the test file of the base is deleted' })
	const receiptFiles = new Set(
		params.ledger.entries.flatMap((entry) => (entry.kind === 'freeze' ? [] : [entry.file])),
	)
	for (const file of receiptFiles)
		if (!existsSync(join(params.root, file)) && readAtBase({ ...params, file }) === undefined)
			findings.push({ verb: 'deleted', file, detail: 'a new test file deleted after its receipts' })
	return findings
}

/** The texts of the files cases moved into, exactly or by name. */
function movedTargetTexts(params: {
	changed: readonly ChangedTestFile[]
	moves: TddMoves | undefined
}): string[] {
	if (!params.moves) return []
	const targets = new Set(
		[...params.moves.exact.groups, ...params.moves.byName.groups].flatMap((group) => group.targets),
	)
	return params.changed.filter((file) => targets.has(file.file)).map((file) => file.text)
}

/** A finding as `tdd status` and the gate print it: `deleted  <file>  <detail>`, `gone  <file>  <detail>`. */
export function findingLine(finding: TddFinding): string {
	return `${finding.verb}  ${finding.file}  ${finding.detail}`
}

/**
 * The receipts of a case the read rule skips, as `tdd status` and the gate print them:
 * `skipped  <case>  1 accepted receipt (no longer declared)`; undefined when none is skipped.
 */
export function skippedReceiptsLine(line: CaseStatusLine): string | undefined {
	if (!line.skipped?.length) return undefined
	return `${SKIPPED_RECEIPTS_LABEL}  ${caseLabel(line)}  ${describeSkippedReceipts(line.skipped)}`
}
