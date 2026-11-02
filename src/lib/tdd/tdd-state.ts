/**
 * The state of the change's tests, as `tdd status` and the gate read it: every case of the changed test
 * files (a collect-only run) with its status and flags; the test code changed since the red run that last
 * froze it; the test cases the change deletes (an untitled test call of the base, in a file a `gone` entry of
 * the lot file names, is declared gone with its reason); the files whose cases cannot be listed.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { isWrittenAsString } from './case-of-change.ts'
import { caseStatusOf, flagsOf, frozenHashOf } from './case-status.ts'
import { entryNamesFile, readGoneEntries } from './lot-declaration.ts'
import { createModuleResolver } from './module-resolver.ts'
import { runTestCases } from './run-test-cases.ts'
import { readRunCases } from './select-cases.ts'
import {
	hashChangedTestCode,
	listChangedTestFiles,
	listDeletedTestFiles,
	readAtBase,
} from './tdd-files.ts'
import { UNTITLED_CALL_GONE } from './tdd.constants.ts'
import { listTestDependencies } from './test-dependencies.ts'
import { listTestCalls } from './test-source.ts'

import type { PackageJson } from '../package-json.types.ts'
import type { ChangedTestFile, LotGoneEntry, TddFinding, TddLedger, TddState } from './tdd.types.ts'

export async function readTddState(params: {
	root: string
	packageJson: PackageJson
	ledger: TddLedger
	base: string
}): Promise<TddState | { failure: string }> {
	const { root, ledger, base } = params
	const testCode = hashChangedTestCode({ root, base, packageJson: params.packageJson })
	const unfrozen = [...testCode]
		.filter(([file, hash]) => frozenHashOf({ ledger, file }) !== hash)
		.map(([file]) => file)
	const changed = listChangedTestFiles({ root, base })
	const gone = readGoneEntries(root)
	if ('failure' in gone) return gone
	const findings = findDeletedCases({ root, base, ledger, changed, gone })
	if (changed.length === 0) return { cases: [], unfrozen, findings, unlisted: [] }
	const modules = await runTestCases({
		root,
		files: changed.map((file) => file.file),
		filter: 'collect',
	})
	if ('failure' in modules) return modules
	const { cases, unlisted } = readRunCases({
		root,
		packageJson: params.packageJson,
		modules,
		files: changed,
	})
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
		cases: cases.map(function statusLine(testCase) {
			const id = { file: testCase.file, name: testCase.name, project: testCase.project }
			return {
				...id,
				status: caseStatusOf({
					ledger,
					testCase: id,
					testFileHash: testCode.get(testCase.file) ?? '',
					caseHash: testCase.caseHash,
					dependencies: dependenciesOf(testCase.file),
				}),
				flags: flagsOf({ ledger, testCase: id }),
			}
		}),
		unfrozen,
		findings,
		unlisted,
	}
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
}): TddFinding[] {
	const findings: TddFinding[] = []
	for (const file of params.changed) {
		if (file.baseText === undefined) continue
		for (const call of listTestCalls({ text: file.baseText, file: file.file })) {
			if (file.text.includes(call.text)) continue
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
	for (const file of listDeletedTestFiles(params))
		findings.push({ verb: 'deleted', file, detail: 'the test file of the base is deleted' })
	const receiptFiles = new Set(
		params.ledger.entries.flatMap((entry) => (entry.kind === 'freeze' ? [] : [entry.file])),
	)
	for (const file of receiptFiles)
		if (!existsSync(join(params.root, file)) && readAtBase({ ...params, file }) === undefined)
			findings.push({ verb: 'deleted', file, detail: 'a new test file deleted after its receipts' })
	return findings
}

/** A finding as `tdd status` and the gate print it: `deleted  <file>  <detail>`, `gone  <file>  <detail>`. */
export function findingLine(finding: TddFinding): string {
	return `${finding.verb}  ${finding.file}  ${finding.detail}`
}
