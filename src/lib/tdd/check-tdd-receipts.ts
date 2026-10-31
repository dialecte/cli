import { shortMessage } from './classify-failure.ts'
import {
	entryNamesCase,
	entryNamesFile,
	findCaseEntry,
	readAcceptances,
	readGoneEntries,
	readRevisions,
	readTddExemption,
} from './lot-declaration.ts'
/**
 * The `tdd` step of `dialecte gate`: every test-code file changed since the base (HEAD: the uncommitted
 * lot; a `--base` ref or `--full`: the whole branch) is as the red run that last froze it left it, and
 * every case of the change holds a red receipt and a later green one (or passed at a red run as the same
 * case as at the base, accepted or revised by the lot file, each with its reason shown). The flags
 * of the receipts, the cases the change deletes (the untitled test calls the lot file declares gone, with
 * its reason) and the entries of the lot file nothing used are shown for the review. A lot the orchestrator
 * declared exempt in `.dialecte/lot.json` passes with its reason and what the change touches; a package
 * that does not test with vitest skips the step.
 */
import { caseLabel } from './select-cases.ts'
import { countChangedFiles, hashChangedTestCode, readLedger, resolveBase } from './tdd-files.ts'
import { findingLine, readTddState } from './tdd-state.ts'
import { TDD_NEXT_STEPS, VITEST_PACKAGE } from './tdd.constants.ts'

import type { PackageJson } from '../package-json.types.ts'
import type { TddCheck, TddState } from './tdd.types.ts'

export async function checkTddReceipts(params: {
	root: string
	packageJson: PackageJson
	/** Takes the machine lock before the run that lists the cases (a browser package). */
	lock: () => { release(): void } | { refusal: string }
	/** `--base <ref>`: measured from where HEAD left it. */
	ref?: string
	/** `--full`: the whole branch, before a merge. Default: HEAD, the uncommitted lot. */
	wholeBranch?: boolean
}): Promise<TddCheck> {
	const { root, packageJson } = params
	const base = resolveBase({
		root,
		packageJson,
		ref: params.ref,
		wholeBranch: params.wholeBranch,
	})
	if (typeof base !== 'string') return { status: 'failed', reason: base.failure }
	const exemption = readTddExemption(root)
	if (exemption.kind === 'invalid') return { status: 'failed', reason: exemption.reason }
	if (exemption.kind === 'exempt') {
		const changed = countChangedFiles({ root, base, packageJson })
		return {
			status: 'passed',
			note: `exempt: ${exemption.reason} (${changed.production} production file(s), ${changed.test} test file(s) changed)`,
		}
	}
	if (!testsWithVitest(packageJson))
		return { status: 'skipped', reason: 'the package does not test with vitest' }
	const ledger = readLedger(root)
	if ('failure' in ledger) return { status: 'failed', reason: ledger.failure }
	const acceptances = readAcceptances(root)
	if ('failure' in acceptances) return { status: 'failed', reason: acceptances.failure }
	const revisions = readRevisions(root)
	if ('failure' in revisions) return { status: 'failed', reason: revisions.failure }
	const gone = readGoneEntries(root)
	if ('failure' in gone) return { status: 'failed', reason: gone.failure }
	if (hashChangedTestCode({ root, base, packageJson }).size === 0)
		return { status: 'passed', note: 'no test code new or changed since the base' }
	const lock = params.lock()
	if ('refusal' in lock) return { status: 'failed', reason: lock.refusal }
	let state: TddState | { failure: string }
	try {
		state = await readTddState({ root, packageJson, ledger, base })
	} finally {
		lock.release()
	}
	if ('failure' in state) return { status: 'failed', reason: state.failure }
	const open = state.cases.filter(
		(line) =>
			line.status !== 'green' &&
			line.status !== 'unchanged' &&
			line.status !== 'accepted' &&
			line.status !== 'revised',
	)
	const evidence = [
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
		...state.cases
			.filter((line) => line.flags.length)
			.map((line) => `flag  ${caseLabel(line)}  ${line.flags.join(', ')}`),
	]
	evidence.push(
		...acceptances
			.filter(
				(acceptance) =>
					!state.cases.some((line) =>
						entryNamesCase({ entry: acceptance.case, testCase: line, list: 'accept' }),
					),
			)
			.map(
				(acceptance) =>
					`unused accept  ${acceptance.case}  no case of the change has that name (${acceptance.reason})`,
			),
	)
	const revisedCases = state.cases.filter((line) => line.status === 'revised')
	evidence.push(
		...revisions
			.filter(
				(revision) =>
					!revisedCases.some((line) =>
						entryNamesCase({ entry: revision.case, testCase: line, list: 'revised' }),
					),
			)
			.map(
				(revision) =>
					`unused revised entry  ${revision.case}  no case of the change stands revised by a red run (${revision.reason})`,
			),
		...gone
			.filter(
				(entry) =>
					!state.findings.some(
						(finding) =>
							finding.verb === 'gone' && entryNamesFile({ entry: entry.file, file: finding.file }),
					),
			)
			.map(
				(entry) =>
					`unused gone entry  ${entry.file}  no test call of the base gone without a title in a file it names (${entry.reason})`,
			),
	)
	const unlisted = state.unlisted.map(
		(file) =>
			`cannot list  ${file.file}  ${file.failure.kind}: ${shortMessage(file.failure.message).split('\n')[0]}`,
	)
	const caseLines = open.map((line) => `${line.status}  ${caseLabel(line)}`)
	if (state.unfrozen.length)
		return {
			status: 'failed',
			reason: `test code changed outside tdd red: ${state.unfrozen.join(', ')}`,
			lines: [...caseLines, ...unlisted, ...evidence, TDD_NEXT_STEPS],
		}
	if (open.length || unlisted.length)
		return {
			status: 'failed',
			reason: `${open.length} of ${state.cases.length} case(s) of the change without a red receipt then a green one${unlisted.length ? `; ${unlisted.length} test file(s) whose cases cannot be listed` : ''}`,
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
		note: state.cases.length
			? `${state.cases.length} case(s) of the change: ${counts.join(', ')}`
			: 'no test case of the change',
		...(evidence.length && { details: evidence }),
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
