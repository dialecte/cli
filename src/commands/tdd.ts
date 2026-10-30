/**
 * `dialecte tdd red|green|status [<test file> | <test file>::<case name>]... [--base <ref>] [--json] [--no-wait]` - the
 * receipts that make the order of a lot's work visible: each new or changed test case failed for a real
 * reason before the code (red), then passed with the test code untouched (green). Receipts live in the
 * worktree's git folder; a package whose tests run in a browser runs them under the machine lock.
 *
 * - `red`: runs every case of the changed test files (or of the files named). A case failing on an
 *   assertion (or on a stub's `not implemented`, or on a TypeError of existing code, inside an asserting
 *   `expect(...)`) gets a red receipt; a passing case that is new or changed is refused (it proves
 *   nothing), one the same as at the base is marked unchanged, one with a receipt and the same test call is
 *   kept, one the lot declares revised at review is recorded revised. A file with a refusal still records
 *   its other cases' receipts but is not frozen; the files without a refusal are frozen, and the changed
 *   helpers, fixtures and snapshots a red of theirs depends on. The change is measured from HEAD (the
 *   uncommitted lot), or from where HEAD left `--base <ref>`.
 * - `green`: every case of the changed test files (or those named) must hold a red receipt, its file and
 *   its test call as frozen, the helpers untouched, production changed since its red, and pass.
 * - `status`: each case of the change, the test code changed since it was frozen, the deleted cases.
 */
import { getArg, hasFlag, positionalArguments } from '../lib/config.ts'
import { runsTestsInABrowser } from '../lib/gate/run-gate.ts'
import {
	acquireMachineLock,
	describeHolder,
	machineLockPath,
} from '../lib/machine-lock/machine-lock.ts'
import { readPackageJson } from '../lib/package-json.ts'
import { formatDuration } from '../lib/progress/format-duration.ts'
import { openProcessLiveOutput } from '../lib/progress/process-live-output.ts'
import { createStepProgress } from '../lib/progress/step-progress.ts'
import { createSystemClock } from '../lib/progress/system-clock.ts'
import { frozenHashOf, receiptsOf } from '../lib/tdd/case-status.ts'
import { shortMessage } from '../lib/tdd/classify-failure.ts'
import { readAcceptances, readRevisions } from '../lib/tdd/lot-declaration.ts'
import { createModuleResolver } from '../lib/tdd/module-resolver.ts'
import { runTestCases } from '../lib/tdd/run-test-cases.ts'
import {
	caseLabel,
	isTargeted,
	parseTargets,
	readRunCases,
	targetFiles,
} from '../lib/tdd/select-cases.ts'
import {
	appendEntries,
	hashChangedTestCode,
	hashProduction,
	listChangedTestFiles,
	readLedger,
	resolveBase,
} from '../lib/tdd/tdd-files.ts'
import { readTddState } from '../lib/tdd/tdd-state.ts'
import {
	CHANGED_AND_PASSES,
	FROZEN_AFTER_RED,
	NO_RED_RECEIPT,
	NOTHING_CHANGED_SINCE_RED,
	ONLY_REFUSAL,
	PROOF_KINDS,
	PROVES_NOTHING,
	RED_KINDS,
	TEST_CODE_CHANGED_SINCE_RED,
	UNRESOLVED_IMPORT_HINT,
	TDD_SUBCOMMANDS,
	TEST_FILE_PATTERN,
} from '../lib/tdd/tdd.constants.ts'
import { listTestDependencies } from '../lib/tdd/test-dependencies.ts'
import { findOnlyMarkers } from '../lib/tdd/test-source.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { WriteLine } from '../lib/handover/handover.types.ts'
import type { Clock } from '../lib/progress/clock.types.ts'
import type { LiveOutput } from '../lib/progress/step-progress.types.ts'
import type {
	LotCaseEntry,
	CaseFailure,
	ReceiptFlag,
	RunCase,
	TddContext,
	TddEntry,
	TddReceipt,
	TddSubcommand,
	TestCaseId,
} from '../lib/tdd/tdd.types.ts'

export async function run(argv: string[]): Promise<void> {
	const result = await runTdd({
		cwd: process.cwd(),
		argv,
		now: () => new Date(),
		...(!hasFlag(argv, 'json') && { live: openProcessLiveOutput() }),
	})
	;(result.exitCode === 0 ? console.log : console.error)(result.output)
	if (result.exitCode !== 0) process.exit(result.exitCode)
}

export async function runTdd(params: {
	cwd: string
	argv: string[]
	/** Where the start line (or spinner) of the vitest run goes while it runs. */
	live?: LiveOutput
	/** The time a receipt records. */
	now: () => Date
	/** The machine lock a browser package's runs take: its file, the clock it waits with, where its lines go. */
	machineLock?: {
		path: string
		clock: Clock
		write: WriteLine
		isAlive?: (pid: number) => boolean
	}
}): Promise<CommandResult> {
	const { cwd: root, argv } = params
	const [subcommand, ...words] = positionalArguments({ argv, valueOptions: ['base'] })
	if (!isSubcommand(subcommand))
		return {
			exitCode: 2,
			output:
				'tdd: red | green | status [<test file> | <test file>::<case name>]... [--base <ref>] [--json] [--no-wait]',
		}
	const packageJson = readPackageJson(root)
	const ledger = readLedger(root)
	if ('failure' in ledger) return { exitCode: 1, output: `tdd ${subcommand}: ${ledger.failure}` }
	const lock = runsTestsInABrowser({ root, packageJson })
		? lockMachine({ root, subcommand, argv, machineLock: params.machineLock })
		: undefined
	if (lock && 'refusal' in lock)
		return { exitCode: 1, output: `tdd ${subcommand}: ${lock.refusal}` }
	const base = resolveBase({ root, packageJson, ref: getArg(argv, 'base') })
	if (typeof base !== 'string') {
		if (lock && !('refusal' in lock)) lock.release()
		return { exitCode: 1, output: `tdd ${subcommand}: ${base.failure}` }
	}
	try {
		const context: TddContext = {
			root,
			packageJson,
			json: hasFlag(argv, 'json'),
			now: params.now,
			targets: parseTargets(words),
			ledger,
			base,
			...(params.live && {
				progress: createStepProgress({ live: params.live, clock: createSystemClock() }),
			}),
		}
		if (subcommand === 'red') return await runRed(context)
		if (subcommand === 'green') return await runGreen(context)
		return await runStatus(context)
	} finally {
		if (lock && !('refusal' in lock)) lock.release()
	}
}

async function runRed(context: TddContext): Promise<CommandResult> {
	const { root } = context
	const files = targetFiles({ changed: listChangedTestFiles(context), targets: context.targets })
	if (files.length === 0)
		return {
			exitCode: 1,
			output: 'tdd red: no test file new or changed since the base (or among the files named)',
		}
	const lines: string[] = []
	const entries: TddEntry[] = []
	const at = context.now().toISOString()
	const productionHash = hashProduction(context)
	const testCode = hashChangedTestCode(context)
	const focused = files.filter(
		(file) => findOnlyMarkers({ text: file.text, file: file.file }).length > 0,
	)
	for (const file of focused) {
		lines.push(
			statusLine({
				label: 'refused',
				id: file.file,
				detail: ONLY_REFUSAL.replace(
					'{lines}',
					findOnlyMarkers({ text: file.text, file: file.file }).join(', '),
				),
			}),
		)
		entries.push(
			fileRefusal({ file: file.file, reason: 'focus markers', productionHash, testCode, at }),
		)
	}
	const acceptances = readAcceptances(root)
	if ('failure' in acceptances) return { exitCode: 1, output: `tdd red: ${acceptances.failure}` }
	const revisions = readRevisions(root)
	if ('failure' in revisions) return { exitCode: 1, output: `tdd red: ${revisions.failure}` }
	const runnable = files.filter((file) => !focused.includes(file))
	const modules = runnable.length
		? await announcedRun({
				context,
				subcommand: 'red',
				files: runnable.map((file) => file.file),
			})
		: []
	if ('failure' in modules) return { exitCode: 1, output: `tdd red: ${modules.failure}` }
	const { cases, unlisted } = readRunCases({
		root,
		packageJson: context.packageJson,
		modules,
		files: runnable,
	})
	for (const file of unlisted) {
		lines.push(
			statusLine({
				label: 'refused',
				id: file.file,
				detail: `cannot list its cases: ${notARed(file.failure)}`,
			}),
		)
		entries.push(
			fileRefusal({ file: file.file, reason: notARed(file.failure), productionHash, testCode, at }),
		)
	}
	const changedTestCode = [...testCode.keys()]
	const resolveModule = createModuleResolver({ root })
	const frozen: Record<string, string> = {}
	for (const file of runnable.filter(
		(candidate) => !unlisted.some((file) => file.file === candidate.file),
	)) {
		const { dependencies, unresolved: unresolvedImports } = listTestDependencies({
			root,
			file: file.file,
			changedTestCode,
			resolveModule,
			packageJson: context.packageJson,
		})
		if (unresolvedImports.length) {
			const reason = `cannot resolve the import ${unresolvedImports.map((specifier) => `"${specifier}"`).join(', ')}: ${UNRESOLVED_IMPORT_HINT}`
			lines.push(statusLine({ label: 'refused', id: file.file, detail: reason }))
			entries.push(fileRefusal({ file: file.file, reason, productionHash, testCode, at }))
			continue
		}
		const testCodeChanged = [file.file, ...dependencies].some(
			(path) =>
				testCode.has(path) &&
				frozenHashOf({ ledger: context.ledger, file: path }) !== testCode.get(path),
		)
		const judged = cases
			.filter((testCase) => testCase.file === file.file && testCase.state !== 'skipped')
			.map((testCase) =>
				judgeRed({ testCase, context, productionHash, testCodeChanged, acceptances, revisions }),
			)
		const refused = judged.some((judgement) => judgement.kind === 'refused')
		for (const judgement of judged) {
			const recordable = judgement.kind !== 'kept' || judgement.flags.length > 0
			const receipt: TddReceipt | undefined = recordable
				? {
						kind: judgement.kind,
						...idOf(judgement.testCase),
						testFileHash: testCode.get(file.file) ?? '',
						caseHash: judgement.testCase.caseHash,
						productionHash,
						...(judgement.message && { message: judgement.message }),
						...(judgement.reason && { reason: judgement.reason }),
						...(judgement.flags.length && { flags: judgement.flags }),
						at,
					}
				: undefined
			// a refusal keeps the file unfrozen, not the other cases' receipts
			if (receipt) entries.push(receipt)
			lines.push(
				statusLine({
					label: judgement.kind,
					id: caseLabel(judgement.testCase),
					detail: [
						judgement.detail,
						judgement.flags.length ? `flags: ${judgement.flags.join(', ')}` : '',
					]
						.filter(Boolean)
						.join('  '),
				}),
			)
		}
		if (refused) continue
		frozen[file.file] = testCode.get(file.file) ?? ''
		// a helper, fixture or snapshot is frozen only by a red it can have shaped
		if (judged.some((judgement) => judgement.kind === 'red'))
			for (const dependency of dependencies)
				if (testCode.has(dependency)) frozen[dependency] = testCode.get(dependency) ?? ''
	}
	if (Object.keys(frozen).length) entries.push({ kind: 'freeze', files: frozen, at })
	appendEntries({ root, entries })
	const summary = `tdd red: ${countLines({ lines, label: 'red' })} red, ${countLines({ lines, label: 'unchanged' })} unchanged, ${countLines({ lines, label: 'kept' })} kept, ${countLines({ lines, label: 'accepted' })} accepted, ${countLines({ lines, label: 'revised' })} revised, ${countLines({ lines, label: 'refused' })} refused; ${
		Object.keys(frozen).length ? `frozen: ${Object.keys(frozen).join(', ')}` : 'nothing frozen'
	}`
	return finish({ context, lines, summary, refused: countLines({ lines, label: 'refused' }) })
}

/** What a red run makes of one case. */
function judgeRed(params: {
	testCase: RunCase
	context: TddContext
	productionHash: string
	/** The case's test file, or test code it depends on, differs from its last freeze. */
	testCodeChanged: boolean
	acceptances: readonly LotCaseEntry[]
	/** The cases the lot declares revised at review. */
	revisions: readonly LotCaseEntry[]
}): {
	testCase: RunCase
	kind: 'red' | 'unchanged' | 'accepted' | 'kept' | 'revised' | 'refused'
	detail: string
	message?: string
	reason?: string
	flags: ReceiptFlag[]
} {
	const { testCase, productionHash } = params
	const { ledger } = params.context
	const receipts = receiptsOf({ ledger, testCase: idOf(testCase) }).filter(
		(receipt) => receipt.kind !== 'refused',
	)
	const prior = receipts.at(-1)
	if (testCase.state === 'failed' && testCase.failure) {
		const { failure } = testCase
		if (!RED_KINDS.includes(failure.kind)) {
			const reason = notARed(failure)
			return { testCase, kind: 'refused', detail: reason, reason, flags: [] }
		}
		const flags: ReceiptFlag[] = []
		if (isRolledBack({ receipts, productionHash })) flags.push('rollback')
		// a case the lot declares revised at review is made red again on purpose
		const revised = params.revisions.some((revision) => revision.case === caseLabel(testCase))
		if (prior?.kind === 'green' && prior.productionHash === productionHash && !revised)
			flags.push('red after green')
		return {
			testCase,
			kind: 'red',
			detail: `${failure.kind}: ${firstLine(failure.message)}`,
			message: failure.message,
			flags,
		}
	}
	if (testCase.state === 'failed')
		return {
			testCase,
			kind: 'refused',
			detail: 'failed without an error',
			reason: 'failed',
			flags: [],
		}
	const acceptance = params.acceptances.find((accepted) => accepted.case === caseLabel(testCase))
	if (acceptance)
		return {
			testCase,
			kind: 'accepted',
			detail: acceptance.reason,
			reason: acceptance.reason,
			flags: [],
		}
	const revision = params.revisions.find((revised) => revised.case === caseLabel(testCase))
	// a proven case edited at review passes: the lot's reason stands for a new red
	if (revision && prior && (prior.caseHash !== testCase.caseHash || params.testCodeChanged))
		return {
			testCase,
			kind: 'revised',
			detail: revision.reason,
			reason: revision.reason,
			flags: [],
		}
	if (prior && prior.caseHash === testCase.caseHash) {
		if (!params.testCodeChanged)
			return { testCase, kind: 'kept', detail: `proven before (${prior.kind})`, flags: [] }
		const lastRed = lastIndexOfKind({ receipts, kind: 'red' })
		const lastGreen = lastIndexOfKind({ receipts, kind: 'green' })
		if (lastRed > lastGreen)
			return {
				testCase,
				kind: 'refused',
				detail: TEST_CODE_CHANGED_SINCE_RED,
				reason: TEST_CODE_CHANGED_SINCE_RED,
				flags: [],
			}
		return {
			testCase,
			kind: 'kept',
			detail: `proven before (${lastGreen >= 0 ? 'green' : prior.kind})`,
			flags: ['test code changed around it'],
		}
	}
	if (prior)
		return {
			testCase,
			kind: 'refused',
			detail: CHANGED_AND_PASSES,
			reason: CHANGED_AND_PASSES,
			flags: [],
		}
	if (testCase.ofChange) {
		const lastGreen = [...ledger.entries]
			.reverse()
			.find((entry): entry is TddReceipt => entry.kind === 'green')
		const reason =
			lastGreen && lastGreen.productionHash !== productionHash
				? `${PROVES_NOTHING}; production changed since the last green receipt (${lastGreen.at})`
				: PROVES_NOTHING
		return { testCase, kind: 'refused', detail: reason, reason, flags: [] }
	}
	return { testCase, kind: 'unchanged', detail: '', flags: [] }
}

function lastIndexOfKind(params: {
	receipts: readonly TddReceipt[]
	kind: TddReceipt['kind']
}): number {
	return params.receipts.map((receipt) => receipt.kind).lastIndexOf(params.kind)
}

/** The production state equals an earlier receipt's of the case that a later receipt with another state superseded. */
function isRolledBack(params: {
	receipts: readonly TddReceipt[]
	productionHash: string
}): boolean {
	const { receipts, productionHash } = params
	return receipts.some(
		(receipt, index) =>
			receipt.productionHash === productionHash &&
			receipts.slice(index + 1).some((later) => later.productionHash !== productionHash),
	)
}

async function runGreen(context: TddContext): Promise<CommandResult> {
	const { root, ledger } = context
	const testCode = hashChangedTestCode(context)
	const changedHelpers = [...testCode]
		.filter(
			([file, hash]) => !TEST_FILE_PATTERN.test(file) && frozenHashOf({ ledger, file }) !== hash,
		)
		.map(([file]) => file)
	if (changedHelpers.length)
		return {
			exitCode: 1,
			output: `tdd green: test code changed since the last red run: ${changedHelpers.join(', ')} - ${FROZEN_AFTER_RED}`,
		}
	const files = targetFiles({ changed: listChangedTestFiles(context), targets: context.targets })
	if (files.length === 0)
		return {
			exitCode: 1,
			output: 'tdd green: no test file new or changed since the base (or among the files named)',
		}
	const modules = await announcedRun({
		context,
		subcommand: 'green',
		files: files.map((file) => file.file),
	})
	if ('failure' in modules) return { exitCode: 1, output: `tdd green: ${modules.failure}` }
	const { cases, unlisted } = readRunCases({
		root,
		packageJson: context.packageJson,
		modules,
		files,
	})
	const productionHash = hashProduction(context)
	const at = context.now().toISOString()
	const lines: string[] = []
	const entries: TddEntry[] = []
	for (const file of unlisted)
		lines.push(
			statusLine({
				label: 'refused',
				id: file.file,
				detail: `cannot list its cases: ${notARed(file.failure)}`,
			}),
		)
	for (const testCase of cases) {
		if (testCase.state === 'skipped' || !isTargeted({ testCase, targets: context.targets }))
			continue
		const proof = receiptsOf({ ledger, testCase: idOf(testCase) })
			.filter((receipt) => PROOF_KINDS.includes(receipt.kind))
			.at(-1)
		const base = {
			...idOf(testCase),
			testFileHash: testCode.get(testCase.file) ?? '',
			caseHash: testCase.caseHash,
			productionHash,
			at,
		}
		const refusal = greenRefusal({ testCase, proof, ledger, testCode, productionHash })
		if (refusal) {
			entries.push({ ...base, kind: 'refused', reason: refusal })
			lines.push(statusLine({ label: 'refused', id: caseLabel(testCase), detail: refusal }))
		} else if (
			proof?.kind === 'unchanged' ||
			proof?.kind === 'accepted' ||
			proof?.kind === 'revised'
		)
			lines.push(statusLine({ label: proof.kind, id: caseLabel(testCase), detail: '' }))
		else {
			entries.push({ ...base, kind: 'green' })
			lines.push(statusLine({ label: 'green', id: caseLabel(testCase), detail: '' }))
		}
	}
	appendEntries({ root, entries })
	return finish({
		context,
		lines,
		summary: `tdd green: ${countLines({ lines, label: 'green' })} green, ${countLines({ lines, label: 'unchanged' })} unchanged, ${countLines({ lines, label: 'refused' })} refused`,
		refused: countLines({ lines, label: 'refused' }),
	})
}

/** Why a case cannot be green now, or undefined when its green is earned. */
function greenRefusal(params: {
	testCase: RunCase
	proof: TddReceipt | undefined
	ledger: TddContext['ledger']
	testCode: Map<string, string>
	productionHash: string
}): string | undefined {
	const { testCase, proof } = params
	if (!proof) return NO_RED_RECEIPT
	const testFileHash = params.testCode.get(testCase.file)
	const frozen = frozenHashOf({ ledger: params.ledger, file: testCase.file })
	// as frozen; a file never frozen (a case of it refused) as its red saw it
	const fileUntouched =
		frozen === testFileHash || (frozen === undefined && proof.testFileHash === testFileHash)
	if (!fileUntouched || proof.caseHash !== testCase.caseHash) return FROZEN_AFTER_RED
	if (proof.kind === 'unchanged' || proof.kind === 'accepted' || proof.kind === 'revised')
		return undefined
	if (testCase.state !== 'passed')
		return testCase.failure
			? `still fails: ${testCase.failure.kind}: ${firstLine(testCase.failure.message)}`
			: `${testCase.state}: the run did not pass it`
	if (proof.productionHash === params.productionHash) return NOTHING_CHANGED_SINCE_RED
	return undefined
}

async function runStatus(context: TddContext): Promise<CommandResult> {
	const state = await readTddState(context)
	if ('failure' in state) return { exitCode: 1, output: `tdd status: ${state.failure}` }
	if (context.json) return { exitCode: 0, output: JSON.stringify(state, null, 2) }
	// a test file with cases already says so on each case line
	const listed = new Set(state.cases.map((line) => line.file))
	const helpersUnfrozen = state.unfrozen.filter((file) => !listed.has(file))
	const lines = [
		...state.cases.map(
			(line) =>
				`${line.status}  ${caseLabel(line)}${line.flags.length ? `  flags: ${line.flags.join(', ')}` : ''}`,
		),
		...(helpersUnfrozen.length
			? [`test code changed outside tdd red: ${helpersUnfrozen.join(', ')}`]
			: []),
		...state.findings.map((finding) => `deleted  ${finding.file}  ${finding.detail}`),
		...state.unlisted.map(
			(file) =>
				`cannot list  ${file.file}  ${file.failure.kind}: ${firstLine(file.failure.message)}`,
		),
	]
	return {
		exitCode: 0,
		output: lines.length
			? lines.join('\n')
			: 'tdd status: no test code new or changed since the base',
	}
}

/** Every case of the files, run by vitest, the run announced first (a start line or a spinner). */
async function announcedRun(params: {
	context: TddContext
	subcommand: TddSubcommand
	files: string[]
}): Promise<Awaited<ReturnType<typeof runTestCases>>> {
	const { context, files } = params
	const clock = createSystemClock()
	const startedAt = clock.now()
	const running = context.progress?.start({
		name: `tdd ${params.subcommand}: vitest`,
		detail: `${files.length} test file(s)`,
	})
	const modules = await runTestCases({ root: context.root, files, filter: 'all' })
	running?.finish(
		`${'failure' in modules ? '✗' : '✓'} tdd ${params.subcommand}: vitest ran ${files.length} test file(s)  ${formatDuration(clock.now() - startedAt)}`,
	)
	return modules
}

/** A refusal of a whole file (it cannot run, or holds a focus marker), kept in the ledger. */
function fileRefusal(params: {
	file: string
	reason: string
	productionHash: string
	testCode: Map<string, string>
	at: string
}): TddReceipt {
	return {
		kind: 'refused',
		file: params.file,
		name: '',
		project: '',
		testFileHash: params.testCode.get(params.file) ?? '',
		caseHash: '',
		productionHash: params.productionHash,
		reason: params.reason,
		at: params.at,
	}
}

function notARed(failure: CaseFailure): string {
	return `${failure.kind} (not a red): ${firstLine(failure.message)}`
}

function finish(params: {
	context: TddContext
	lines: string[]
	summary: string
	refused: number
}): CommandResult {
	const exitCode = params.refused > 0 ? 1 : 0
	if (params.context.json)
		return {
			exitCode,
			output: JSON.stringify({ lines: params.lines, refused: params.refused }, null, 2),
		}
	return { exitCode, output: [...params.lines, params.summary].join('\n') }
}

/** How many output lines report `label` (red, green, refused...). */
function countLines(params: { lines: readonly string[]; label: string }): number {
	return params.lines.filter((line) => line.startsWith(`${params.label} `)).length
}

function statusLine(params: { label: string; id: string; detail: string }): string {
	return [params.label.padEnd(7), params.id, params.detail].filter(Boolean).join('  ')
}

function firstLine(message: string): string {
	return shortMessage(message).split('\n')[0]
}

function idOf(testCase: TestCaseId): TestCaseId {
	return { file: testCase.file, name: testCase.name, project: testCase.project }
}

function lockMachine(params: {
	root: string
	subcommand: TddSubcommand
	argv: string[]
	machineLock: Parameters<typeof runTdd>[0]['machineLock']
}): { release(): void } | { refusal: string } {
	const machineLock = params.machineLock ?? {
		path: machineLockPath(),
		clock: createSystemClock(),
		write: (line: string) => console.error(line),
	}
	const outcome = acquireMachineLock({
		path: machineLock.path,
		command: `dialecte tdd ${params.subcommand} in ${params.root}`,
		wait: !hasFlag(params.argv, 'no-wait'),
		clock: machineLock.clock,
		write: machineLock.write,
		isAlive: machineLock.isAlive,
	})
	return outcome.acquired
		? outcome
		: { refusal: `the machine lock is held (--no-wait): ${describeHolder(outcome.holder)}` }
}

function isSubcommand(word: string | undefined): word is TddSubcommand {
	return TDD_SUBCOMMANDS.some((subcommand) => subcommand === word)
}
