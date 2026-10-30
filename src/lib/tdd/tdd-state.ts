/**
 * The state of the change's tests, as `tdd status` and the gate read it: every case of the changed test
 * files (a collect-only run) with its status and flags; the test code changed since the red run that last
 * froze it; the test cases the change deletes; the files whose cases cannot be listed.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { isWrittenAsString } from './case-of-change.ts'
import { caseStatusOf, flagsOf, frozenHashOf } from './case-status.ts'
import { runTestCases } from './run-test-cases.ts'
import { readRunCases } from './select-cases.ts'
import {
	hashChangedTestCode,
	listChangedTestFiles,
	listDeletedTestFiles,
	readAtBase,
} from './tdd-files.ts'
import { listTestCalls } from './test-source.ts'

import type { PackageJson } from '../package-json.types.ts'
import type { ChangedTestFile, TddFinding, TddLedger, TddState } from './tdd.types.ts'

export async function readTddState(params: {
	root: string
	packageJson: PackageJson
	ledger: TddLedger
	base: string
}): Promise<TddState | { failure: string }> {
	const { root, ledger, base } = params
	const testCode = hashChangedTestCode({ root, base })
	const unfrozen = [...testCode]
		.filter(([file, hash]) => frozenHashOf({ ledger, file }) !== hash)
		.map(([file]) => file)
	const changed = listChangedTestFiles({ root, base })
	const findings = findDeletedCases({ root, base, ledger, changed })
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
	return {
		cases: cases.map((testCase) => {
			const id = { file: testCase.file, name: testCase.name, project: testCase.project }
			return {
				...id,
				status: caseStatusOf({
					ledger,
					testCase: id,
					testFileHash: testCode.get(testCase.file) ?? '',
					caseHash: testCase.caseHash,
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
}): TddFinding[] {
	const findings: TddFinding[] = []
	for (const file of params.changed) {
		if (file.baseText === undefined) continue
		for (const call of listTestCalls(file.baseText)) {
			if (file.text.includes(call.text)) continue
			if (call.title !== undefined && isWrittenAsString({ text: file.text, title: call.title }))
				continue
			findings.push({
				file: file.file,
				detail: call.title
					? `the test "${call.title}" of the base is gone`
					: 'a test call of the base is gone',
			})
		}
	}
	for (const file of listDeletedTestFiles(params))
		findings.push({ file, detail: 'the test file of the base is deleted' })
	const receiptFiles = new Set(
		params.ledger.entries.flatMap((entry) => (entry.kind === 'freeze' ? [] : [entry.file])),
	)
	for (const file of receiptFiles)
		if (!existsSync(join(params.root, file)) && readAtBase({ ...params, file }) === undefined)
			findings.push({ file, detail: 'a new test file deleted after its receipts' })
	return findings
}
