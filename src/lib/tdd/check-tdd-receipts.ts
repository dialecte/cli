import { shortMessage } from './classify-failure.ts'
import { readAcceptances, readRevisions, readTddExemption } from './lot-declaration.ts'
/**
 * The `tdd` step of `dialecte gate`: every test-code file changed since the base (HEAD: the uncommitted
 * lot; a `--base` ref or `--full`: the whole branch) is as the red run that last froze it left it, and
 * every case of the change holds a red receipt and a later green one (or passed at a red run as the same
 * case as at the base, accepted or revised by the lot file, each with its reason shown). The flags
 * of the receipts and the cases the change deletes are shown for the review. A lot the orchestrator
 * declared exempt in `.dialecte/lot.json` passes with its reason and what the change touches; a package
 * that does not test with vitest skips the step.
 */
import { caseLabel } from './select-cases.ts'
import { countChangedFiles, hashChangedTestCode, readLedger, resolveBase } from './tdd-files.ts'
import { readTddState } from './tdd-state.ts'
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
					`revised  ${caseLabel(line)}  ${revisions.find((revised) => revised.case === caseLabel(line))?.reason ?? '(no longer in the lot file)'}`,
			),
		...state.cases
			.filter((line) => line.status === 'accepted')
			.map(
				(line) =>
					`accepted  ${caseLabel(line)}  ${acceptances.find((accepted) => accepted.case === caseLabel(line))?.reason ?? '(no longer in the lot file)'}`,
			),
		...state.findings.map((finding) => `deleted  ${finding.file}  ${finding.detail}`),
		...state.cases
			.filter((line) => line.flags.length)
			.map((line) => `flag  ${caseLabel(line)}  ${line.flags.join(', ')}`),
	]
	const labels = new Set(state.cases.map((line) => caseLabel(line)))
	evidence.push(
		...acceptances
			.filter((acceptance) => !labels.has(acceptance.case))
			.map(
				(acceptance) =>
					`unused accept  ${acceptance.case}  no case of the change has that name (${acceptance.reason})`,
			),
	)
	const revisedLabels = new Set(
		state.cases.filter((line) => line.status === 'revised').map((line) => caseLabel(line)),
	)
	evidence.push(
		...revisions
			.filter((revision) => !revisedLabels.has(revision.case))
			.map(
				(revision) =>
					`unused revised entry  ${revision.case}  no case of the change stands revised by a red run (${revision.reason})`,
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
