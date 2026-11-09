/**
 * `dialecte tdd red|green|status [<test file> | <test file>::<case name>]... [--base <ref>] [--json]` - the
 * receipts that make the order of a lot's work visible: each new or changed test case failed for a real
 * reason before the code (red), then passed with the test code untouched (green). Receipts live in the
 * worktree's git folder.
 *
 * - `red`: runs every case of the changed test files (or of the files named). A case failing on an
 *   assertion (or on a stub's `not implemented`, or on a TypeError of existing code, inside an asserting
 *   `expect(...)`) gets a red receipt; a passing case that is new or changed is refused (it proves
 *   nothing), one the same as at the base is marked unchanged, one with a receipt and the same test call is
 *   kept, one the lot declares revised at review (a proven case, or an edited case the base provably
 *   holds) is recorded revised. A file with a refusal still records its other cases' receipts but is not
 *   frozen; the files without a refusal are frozen, and the changed helpers, fixtures and snapshots a red
 *   or a revised case of theirs depends on, or a `revised` entry names when every test file depending on
 *   them is frozen without a red (recorded revised). The change is measured from HEAD (the
 *   uncommitted lot), or from where HEAD left `--base <ref>`. An acceptance never overrides a proof: a
 *   case proven red → green keeps its proof, the line says the acceptance is not needed.
 * - Every subcommand reads a case's receipts through `countingReceipts`: an acceptance or a revision the lot
 *   file no longer declares stands for no proof.
 * - `green`: every case of the changed test files (or those named) must hold a red receipt, its file and
 *   its test call as frozen, the helpers untouched, production changed since its red, and pass.
 * - `status`: each case of the change, the test code changed since it was frozen, the deleted cases (and
 *   the test calls of the base the lot file declares gone); `status --legend`: the tdd terms of the
 *   hand-over card's legend.
 */
import { DEFAULT_CARD_COLUMNS } from '../lib/card/card.constants.ts'
import { resolveCardColumns } from '../lib/card/render-section-card.ts'
import { getArg, hasFlag, positionalArguments } from '../lib/config.ts'
import { TDD_LEGEND_TERMS } from '../lib/legend/legend.constants.ts'
import { renderLegend } from '../lib/legend/render-legend.ts'
import { readPackageJson } from '../lib/package-json.ts'
import { formatDuration } from '../lib/progress/format-duration.ts'
import { openProcessLiveOutput } from '../lib/progress/process-live-output.ts'
import { createStepProgress } from '../lib/progress/step-progress.ts'
import { createSystemClock } from '../lib/progress/system-clock.ts'
import { frozenHashOf } from '../lib/tdd/case-status.ts'
import { shortMessage } from '../lib/tdd/classify-failure.ts'
import { countingReceipts, isProvenRedThenGreen, receiptsOf } from '../lib/tdd/counting-receipts.ts'
import {
	findCaseEntry,
	namesOneCase,
	readAcceptances,
	readRevisions,
	revisionOfHelper,
} from '../lib/tdd/lot-declaration.ts'
import { createModuleResolver } from '../lib/tdd/module-resolver.ts'
import { movedCaseLabels } from '../lib/tdd/moved-cases.ts'
import {
	filesMovedBack,
	isRollbackGreen,
	readProductionState,
} from '../lib/tdd/production-states.ts'
import { applyMoves, readMoves } from '../lib/tdd/read-moves.ts'
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
	listChangedTestFiles,
	readLedger,
	resolveBase,
} from '../lib/tdd/tdd-files.ts'
import { findingLine, movesLines, readTddState, skippedReceiptsLine } from '../lib/tdd/tdd-state.ts'
import {
	ACCEPTANCE_NOT_NEEDED,
	CHANGED_AND_PASSES,
	FROZEN_AFTER_RED,
	HELPER_DEPENDENT_OUTSIDE_RUN,
	NO_RED_RECEIPT,
	NOT_PROVABLY_OF_THE_BASE,
	NOTHING_CHANGED_SINCE_RED,
	ONLY_REFUSAL,
	PROOF_KINDS,
	PROVES_NOTHING,
	RED_KINDS,
	REVISION_NOT_NEEDED,
	ROLLBACK_LINE,
	TEST_CODE_CHANGED_SINCE_RED,
	UNRESOLVED_IMPORT_HINT,
	TDD_SUBCOMMANDS,
	TEST_FILE_PATTERN,
} from '../lib/tdd/tdd.constants.ts'
import { listTestDependencies } from '../lib/tdd/test-dependencies.ts'
import { findOnlyMarkers } from '../lib/tdd/test-source.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { LiveOutput } from '../lib/progress/step-progress.types.ts'
import type {
	LotCaseEntry,
	CaseFailure,
	ReceiptFlag,
	RedJudgement,
	RevisedHelper,
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
		// the legend's width: the terminal's columns, else $COLUMNS, else 80
		columns: resolveCardColumns({
			terminalColumns: process.stdout.isTTY ? process.stdout.columns : undefined,
			environmentColumns: process.env.COLUMNS,
		}),
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
	/** The width `status --legend` wraps its lines to. Default: 80. */
	columns?: number
}): Promise<CommandResult> {
	const { cwd: root, argv } = params
	const [subcommand, ...words] = positionalArguments({ argv, valueOptions: ['base'] })
	if (!isSubcommand(subcommand))
		return {
			exitCode: 2,
			output:
				'tdd: red | green | status [<test file> | <test file>::<case name>]... [--base <ref>] [--json] | status --legend',
		}
	// the legend needs no package: printed before any is looked up
	if (subcommand === 'status' && hasFlag(argv, 'legend'))
		return {
			exitCode: 0,
			output: renderLegend({
				groups: [TDD_LEGEND_TERMS],
				width: params.columns ?? DEFAULT_CARD_COLUMNS,
			}),
		}
	const packageJson = readPackageJson(root)
	const ledger = readLedger(root)
	if ('failure' in ledger) return { exitCode: 1, output: `tdd ${subcommand}: ${ledger.failure}` }
	const base = resolveBase({ root, packageJson, ref: getArg(argv, 'base') })
	if (typeof base !== 'string') return { exitCode: 1, output: `tdd ${subcommand}: ${base.failure}` }
	const context: TddContext = {
		root,
		packageJson,
		json: hasFlag(argv, 'json'),
		flagsOnly: hasFlag(argv, 'flags'),
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
}

async function runRed(context: TddContext): Promise<CommandResult> {
	const { root } = context
	const changed = listChangedTestFiles(context)
	const files = targetFiles({ changed, targets: context.targets })
	if (files.length === 0)
		return {
			exitCode: 1,
			output: 'tdd red: no test file new or changed since the base (or among the files named)',
		}
	const lines: string[] = []
	const entries: TddEntry[] = []
	const at = context.now().toISOString()
	const production = readProductionState(context)
	const productionHash = production.hash
	const movedBack = filesMovedBack({ ledger: context.ledger, current: production })
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
	const run = readRunCases({
		root,
		packageJson: context.packageJson,
		modules,
		files: runnable,
	})
	const { unlisted } = run
	// a case moved out of a deleted or shrunk test file is a case of the base: unchanged when it passes
	const moves = await readMoves({
		root,
		base: context.base,
		packageJson: context.packageJson,
		files: runnable,
		cases: run.cases,
	})
	const cases = applyMoves({ cases: run.cases, moves })
	const movedCases = movedCaseLabels(moves)
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
	// listed once per file, for the run's files and, when a `revised` entry names a helper, every changed one
	const listedDependencies = new Map<string, ReturnType<typeof listTestDependencies>>()
	function dependenciesOf(file: string): ReturnType<typeof listTestDependencies> {
		const listed =
			listedDependencies.get(file) ??
			listTestDependencies({
				root,
				file,
				changedTestCode,
				resolveModule,
				packageJson: context.packageJson,
			})
		listedDependencies.set(file, listed)
		return listed
	}
	const frozen: Record<string, string> = {}
	for (const file of runnable.filter(
		(candidate) => !unlisted.some((file) => file.file === candidate.file),
	)) {
		const { dependencies, unresolved: unresolvedImports } = dependenciesOf(file.file)
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
				judgeRed({
					testCase,
					context,
					productionHash,
					movedBack: movedBack.length > 0,
					testCodeChanged,
					acceptances,
					revisions,
				}),
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
		// a helper, fixture or snapshot is frozen only by a red it can have shaped, a revision declared, or a
		// moved case (the helper a split registers its cases through)
		if (
			judged.some(
				(judgement) =>
					judgement.kind === 'red' ||
					judgement.kind === 'revised' ||
					movedCases.has(caseLabel(judgement.testCase)),
			)
		)
			for (const dependency of dependencies)
				if (testCode.has(dependency)) frozen[dependency] = testCode.get(dependency) ?? ''
	}
	const { revised: revisedHelpers, outsideRun } = helpersToRevise({
		context,
		revisions,
		testCode,
		frozen,
		// every changed test file, refused or outside the run too: the entry waits for all the helper's dependents
		dependents: (helper) =>
			changed
				.filter((file) => dependenciesOf(file.file).dependencies.includes(helper))
				.map((file) => file.file),
		inRun: (file) => files.some((runFile) => runFile.file === file),
	})
	for (const { file, entry } of revisedHelpers) {
		frozen[file] = testCode.get(file) ?? ''
		lines.push(statusLine({ label: 'revised', id: file, detail: entry.reason }))
	}
	for (const { file, outside } of outsideRun)
		lines.push(
			statusLine({
				label: 'unfrozen',
				id: file,
				detail: HELPER_DEPENDENT_OUTSIDE_RUN.replace('{files}', outside.join(', ')),
			}),
		)
	if (Object.keys(frozen).length)
		entries.push({
			kind: 'freeze',
			files: frozen,
			...(revisedHelpers.length && { revised: revisedHelpers.map(({ file }) => file) }),
			at,
		})
	appendEntries({ root, entries, production })
	const summary = `tdd red: ${countLines({ lines, label: 'red' })} red, ${countLines({ lines, label: 'unchanged' })} unchanged, ${countLines({ lines, label: 'kept' })} kept, ${countLines({ lines, label: 'accepted' })} accepted, ${countLines({ lines, label: 'revised' })} revised, ${countLines({ lines, label: 'refused' })} refused; ${
		Object.keys(frozen).length ? `frozen: ${Object.keys(frozen).join(', ')}` : 'nothing frozen'
	}`
	const refused = countLines({ lines, label: 'refused' })
	// counted before: the rollback line is no case line
	if (movedBack.length && countLines({ lines, label: 'red' }) > 0)
		lines.push(ROLLBACK_LINE.replace('{files}', movedBack.join(', ')))
	return finish({ context, lines, summary, refused })
}

/**
 * The changed helpers a `revised` entry of the lot file lets this red run freeze: changed since their last
 * freeze, not frozen by a red or a revised case of the run, and with at least one changed test file
 * depending on them, every such file in the run and frozen by it (none refused, none with a red: a red
 * freezes its helpers itself). The entry never excuses a red. With the helpers it leaves unfrozen only
 * because changed dependents of theirs are outside a targeted run, and those files.
 */
function helpersToRevise(params: {
	context: TddContext
	revisions: readonly LotCaseEntry[]
	testCode: ReadonlyMap<string, string>
	/** The test code this run freezes so far. */
	frozen: Readonly<Record<string, string>>
	/** The changed test files depending on the helper. */
	dependents: (helper: string) => string[]
	/** The test file is one of the run's. */
	inRun: (file: string) => boolean
}): { revised: RevisedHelper[]; outsideRun: Array<{ file: string; outside: string[] }> } {
	const { frozen } = params
	const revised: RevisedHelper[] = []
	const outsideRun: Array<{ file: string; outside: string[] }> = []
	for (const [file, hash] of params.testCode) {
		const entry = revisionOfHelper({ revisions: params.revisions, file })
		if (!entry || file in frozen) continue
		if (frozenHashOf({ ledger: params.context.ledger, file }) === hash) continue
		const dependents = params.dependents(file)
		const inRun = dependents.filter((dependent) => params.inRun(dependent))
		const outside = dependents.filter((dependent) => !params.inRun(dependent))
		if (!inRun.length || !inRun.every((dependent) => dependent in frozen)) continue
		if (outside.length) outsideRun.push({ file, outside })
		else revised.push({ file, entry })
	}
	return { revised, outsideRun }
}

/** What a red run makes of one case. */
function judgeRed(params: {
	testCase: RunCase
	context: TddContext
	productionHash: string
	/** A production file moved back from the newest content the lot reached to an earlier one. */
	movedBack: boolean
	/** The case's test file, or test code it depends on, differs from its last freeze. */
	testCodeChanged: boolean
	acceptances: readonly LotCaseEntry[]
	/** The cases the lot declares revised at review. */
	revisions: readonly LotCaseEntry[]
}): RedJudgement {
	const { testCase, productionHash } = params
	const { ledger } = params.context
	const receipts = receiptsOf({ ledger, testCase: idOf(testCase) }).filter(
		(receipt) => receipt.kind !== 'refused',
	)
	// the receipts the read rule counts: a stale acceptance or revision is no prior proof
	const counted = countingReceipts({
		ledger,
		testCase: idOf(testCase),
		acceptances: params.acceptances,
		revisions: params.revisions,
	}).counting.filter((receipt) => receipt.kind !== 'refused')
	const prior = counted.at(-1)
	if (testCase.state === 'failed' && testCase.failure) {
		const { failure } = testCase
		if (!RED_KINDS.includes(failure.kind)) {
			const reason = notARed(failure)
			return { testCase, kind: 'refused', detail: reason, reason, flags: [] }
		}
		const flags: ReceiptFlag[] = []
		if (params.movedBack || isRolledBack({ receipts, productionHash })) flags.push('rollback')
		// a case the lot names revised at review is made red again on purpose; a file or glob entry
		// records only passing cases revised, so it never excuses a red
		const revised = findCaseEntry({ entries: params.revisions, testCase, list: 'revised' })
		const namedRevised = revised !== undefined && namesOneCase(revised.case)
		if (prior?.kind === 'green' && prior.productionHash === productionHash && !namedRevised)
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
	const acceptance = findCaseEntry({ entries: params.acceptances, testCase, list: 'accept' })
	// an acceptance never overrides a proof: a case proven red → green goes the normal path, the line says so
	if (acceptance && !isProvenRedThenGreen({ receipts: counted, caseHash: testCase.caseHash }))
		return {
			testCase,
			kind: 'accepted',
			detail: acceptance.reason,
			reason: acceptance.reason,
			flags: [],
		}
	const judged = judgePass({ ...params, counted })
	return acceptance
		? { ...judged, detail: joinParts([judged.detail, ACCEPTANCE_NOT_NEEDED]) }
		: judged
}

/** What a red run makes of a passing case no acceptance decides, from the receipts of it that count. */
function judgePass(params: {
	testCase: RunCase
	context: TddContext
	productionHash: string
	testCodeChanged: boolean
	revisions: readonly LotCaseEntry[]
	/** The receipts of the case the read rule counts, refusals left out. */
	counted: readonly TddReceipt[]
}): RedJudgement {
	const { testCase, productionHash, counted } = params
	const { ledger } = params.context
	const prior = counted.at(-1)
	const revision = findCaseEntry({ entries: params.revisions, testCase, list: 'revised' })
	// a file or glob entry never stands for the green a red case still owes; an exact entry may
	const covers = revision !== undefined && (namesOneCase(revision.case) || !awaitsGreen(counted))
	// a proven case edited at review passes: the lot's reason stands for a new red
	if (
		revision &&
		covers &&
		prior &&
		(prior.caseHash !== testCase.caseHash || params.testCodeChanged)
	)
		return {
			testCase,
			kind: 'revised',
			detail: revision.reason,
			reason: revision.reason,
			flags: [],
		}
	if (prior && prior.caseHash === testCase.caseHash) {
		// a revision declared on a case nothing changed since its proof: acknowledged, never a new proof
		if (!params.testCodeChanged)
			return {
				testCase,
				kind: 'kept',
				detail: joinParts([
					`proven before (${prior.kind})`,
					revision && covers ? REVISION_NOT_NEEDED.replace('{reason}', () => revision.reason) : '',
				]),
				flags: [],
			}
		const lastRed = lastIndexOfKind({ receipts: counted, kind: 'red' })
		const lastGreen = lastIndexOfKind({ receipts: counted, kind: 'green' })
		if (lastRed > lastGreen)
			return {
				testCase,
				kind: 'refused',
				detail: TEST_CODE_CHANGED_SINCE_RED,
				reason: TEST_CODE_CHANGED_SINCE_RED,
				flags: [],
			}
		// only a green can have been weakened by the code around it; a case never proven green is kept as is
		if (lastGreen < 0)
			return { testCase, kind: 'kept', detail: `proven before (${prior.kind})`, flags: [] }
		return {
			testCase,
			kind: 'kept',
			detail: 'proven before (green)',
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
	// a case of the base edited at review: the base proves it as a receipt would; a new one needs a red
	if (revision && testCase.ofChange) {
		if (testCase.ofBase)
			return {
				testCase,
				kind: 'revised',
				detail: revision.reason,
				reason: revision.reason,
				flags: [],
			}
		const reason = `${PROVES_NOTHING}; ${NOT_PROVABLY_OF_THE_BASE}`
		return { testCase, kind: 'refused', detail: reason, reason, flags: [] }
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

/** The case's last proof is a red with no green after it: its green is still owed. */
function awaitsGreen(receipts: readonly TddReceipt[]): boolean {
	const lastProof = receipts.map((receipt) => PROOF_KINDS.includes(receipt.kind)).lastIndexOf(true)
	return (
		receipts[lastProof]?.kind === 'red' && lastIndexOfKind({ receipts, kind: 'green' }) < lastProof
	)
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
	const acceptances = readAcceptances(root)
	if ('failure' in acceptances) return { exitCode: 1, output: `tdd green: ${acceptances.failure}` }
	const revisions = readRevisions(root)
	if ('failure' in revisions) return { exitCode: 1, output: `tdd green: ${revisions.failure}` }
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
	const production = readProductionState(context)
	const productionHash = production.hash
	const movedBack = filesMovedBack({ ledger, current: production })
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
	const verdicts = cases
		.filter(
			(testCase) =>
				testCase.state !== 'skipped' && isTargeted({ testCase, targets: context.targets }),
		)
		.map(function judgeCase(testCase) {
			// the last proof the read rule counts: a stale acceptance or revision never stands in for the red
			const proof = countingReceipts({ ledger, testCase: idOf(testCase), acceptances, revisions })
				.counting.filter((receipt) => PROOF_KINDS.includes(receipt.kind))
				.at(-1)
			const refusal = greenRefusal({ testCase, proof, ledger, testCode, productionHash })
			return { testCase, proof, refusal }
		})
	const proven = verdicts
		.filter(({ proof, refusal }) => refusal === undefined && !isTestOnlyProof(proof))
		.map(({ testCase }) => ({ ...idOf(testCase), caseHash: testCase.caseHash }))
	// a green at code put back still advances; flagged when it proves a case never green before
	const flags: ReceiptFlag[] = isRollbackGreen({ ledger, cases: proven, movedBack })
		? ['rollback']
		: []
	for (const { testCase, proof, refusal } of verdicts) {
		const base = {
			...idOf(testCase),
			testFileHash: testCode.get(testCase.file) ?? '',
			caseHash: testCase.caseHash,
			productionHash,
			at,
		}
		if (refusal) {
			entries.push({ ...base, kind: 'refused', reason: refusal })
			lines.push(statusLine({ label: 'refused', id: caseLabel(testCase), detail: refusal }))
		} else if (proof && isTestOnlyProof(proof))
			lines.push(statusLine({ label: proof.kind, id: caseLabel(testCase), detail: '' }))
		else {
			entries.push({ ...base, kind: 'green', ...(flags.length && { flags }) })
			lines.push(
				statusLine({
					label: 'green',
					id: caseLabel(testCase),
					detail: flags.length ? `flags: ${flags.join(', ')}` : '',
				}),
			)
		}
	}
	appendEntries({ root, entries, production })
	const summary = `tdd green: ${countLines({ lines, label: 'green' })} green, ${countLines({ lines, label: 'unchanged' })} unchanged, ${countLines({ lines, label: 'refused' })} refused`
	const refused = countLines({ lines, label: 'refused' })
	// counted before: the rollback line is no case line
	if (flags.length && countLines({ lines, label: 'green' }) > 0)
		lines.push(ROLLBACK_LINE.replace('{files}', movedBack.join(', ')))
	return finish({ context, lines, summary, refused })
}

/** Whether the case's last proof is one a green run only reports (no green receipt): unchanged, accepted, revised. */
function isTestOnlyProof(proof: TddReceipt | undefined): boolean {
	return proof?.kind === 'unchanged' || proof?.kind === 'accepted' || proof?.kind === 'revised'
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
	if (context.flagsOnly) {
		const flagged = state.cases.filter((line) => line.flags.length)
		return {
			exitCode: 0,
			output: flagged.length
				? flagged
						.map((line) => `${line.status}  ${caseLabel(line)}  flags: ${line.flags.join(', ')}`)
						.join('\n')
				: 'tdd status: no case of the change carries a flag',
		}
	}
	// a test file with cases already says so on each case line
	const listed = new Set(state.cases.map((line) => line.file))
	const helpersUnfrozen = state.unfrozen.filter((file) => !listed.has(file))
	const lines = [
		...state.cases.map(
			(line) =>
				`${line.status}  ${caseLabel(line)}${line.flags.length ? `  flags: ${line.flags.join(', ')}` : ''}`,
		),
		...state.cases.flatMap((line) => skippedReceiptsLine(line) ?? []),
		...movesLines(state.moves),
		...(helpersUnfrozen.length
			? [`test code changed outside tdd red: ${helpersUnfrozen.join(', ')}`]
			: []),
		...state.findings.map(findingLine),
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
	const modules = await runTestCases({
		root: context.root,
		files,
		filter: 'all',
	})
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

/** The parts of a line's detail that are not empty, two spaces apart. */
function joinParts(parts: readonly string[]): string {
	return parts.filter(Boolean).join('  ')
}

function firstLine(message: string): string {
	return shortMessage(message).split('\n')[0]
}

function idOf(testCase: TestCaseId): TestCaseId {
	return { file: testCase.file, name: testCase.name, project: testCase.project }
}

function isSubcommand(word: string | undefined): word is TddSubcommand {
	return TDD_SUBCOMMANDS.some((subcommand) => subcommand === word)
}
