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
 *   holds) is recorded revised. A file with a refusal still records its other cases' receipts, and is frozen
 *   only when one of them is red (the refused case stays unproven); the files without a refusal are frozen,
 *   and the changed helpers, fixtures and snapshots a red or a revised case of theirs depends on, or a
 *   `revised` entry names when every test file depending on them is frozen without a red (recorded revised),
 *   or, with no changed test file depending on them, that the unchanged test files importing them pass with
 *   (`helper-dependents.ts`). The suite infrastructure (vitest setup files and the helpers they import) is
 *   production, never frozen. A passing case a `moved` entry names carries the red of its earlier label
 *   when its test call is the one that red froze. The change is measured from the lot base
 *   (`resolveTddBase`: HEAD's fork point from the base branch, or from an open stack parent's line), or from where
 *   HEAD left `--base <ref>`; its test code is read through one presence map (`changedTestCodeOf`), and a `gone` or
 *   `moved` entry naming a path the change leaves unchanged, or one known nowhere, is refused before any run. An acceptance never overrides a proof: a
 *   case proven red → green keeps its proof, the line says the acceptance is not needed.
 * - Every subcommand reads a case's receipts through `countingReceipts`: an acceptance or a revision the lot
 *   file no longer declares stands for no proof.
 * - `green`: every case of the changed test files (or those named) must hold a red receipt, its file and
 *   its test call as frozen, the helpers untouched, production changed since its red, and pass.
 * - `status`: each case of the change, the test code changed since it was frozen, the deleted cases (and
 *   the test calls of the base the lot file declares gone); `status --legend`: the tdd terms of the
 *   hand-over card's legend.
 */
import { posix, relative, sep } from 'node:path'

import { DEFAULT_CARD_COLUMNS } from '../lib/card/card.constants.ts'
import { resolveCardColumns } from '../lib/card/render-section-card.ts'
import { resultOf } from '../lib/command-result.ts'
import { getArg, hasFlag, positionalArguments } from '../lib/config.ts'
import { startStep } from '../lib/events/record-step.ts'
import { realPathOf } from '../lib/file-system.ts'
import { computeStateHash } from '../lib/gate-records/state-hash.ts'
import { TDD_LEGEND_TERMS } from '../lib/legend/legend.constants.ts'
import { renderLegend } from '../lib/legend/render-legend.ts'
import { readPackageJson } from '../lib/package-json.ts'
import { joinedOf, jsonOf, printOut, textOf } from '../lib/print/print.ts'
import { relayedTextOf } from '../lib/print/relayed.ts'
import { formatDuration } from '../lib/progress/format-duration.ts'
import { openProcessLiveOutput } from '../lib/progress/process-live-output.ts'
import { createStepProgress } from '../lib/progress/step-progress.ts'
import { createSystemClock } from '../lib/progress/system-clock.ts'
import { runCaseOnBase, runCasesOnBase, trashBaseRunLeftovers } from '../lib/tdd/base-red.ts'
import { frozenHashOf } from '../lib/tdd/case-status.ts'
import { firstLine, notARed } from '../lib/tdd/classify-failure.ts'
import { countingReceipts, isProvenRedThenGreen, receiptsOf } from '../lib/tdd/counting-receipts.ts'
import { isDataDependency } from '../lib/tdd/data-dependency.ts'
import {
	duplicateReasonOf,
	findDuplicateCaseIds,
	isDuplicateMember,
} from '../lib/tdd/duplicate-case-ids.ts'
import {
	budgetDependents,
	judgeHelpers,
	listOrphanHelpers,
	listUnchangedDependents,
} from '../lib/tdd/helper-dependents.ts'
import {
	findCaseEntry,
	namesOneCase,
	readAcceptances,
	readRevisions,
	readGoneEntries,
	readMovedEntries,
	findMovedFroms,
	revisionOfHelper,
} from '../lib/tdd/lot-declaration.ts'
import { createModuleResolver } from '../lib/tdd/module-resolver.ts'
import { movedCaseLabels } from '../lib/tdd/moved-cases.ts'
import { listOwnCode, targetResolverOf } from '../lib/tdd/own-code.ts'
import {
	filesMovedBack,
	isRollbackGreen,
	readProductionState,
} from '../lib/tdd/production-states.ts'
import { pythonBaseTextsOf } from '../lib/tdd/python-case.ts'
import { applyMoves, readMoves } from '../lib/tdd/read-moves.ts'
import { runTestCases } from '../lib/tdd/run-test-cases.ts'
import {
	caseHashOfBody,
	caseLabel,
	modulesOf,
	isTargeted,
	parseTargets,
	readRunCases,
	targetFiles,
} from '../lib/tdd/select-cases.ts'
import {
	appendEntries,
	hashChangedTestCode,
	isTestFile,
	listChangedTestFiles,
	readLedger,
	resolveBase,
} from '../lib/tdd/tdd-files.ts'
import { findingLine, movesLines, readTddState, skippedReceiptsLine } from '../lib/tdd/tdd-state.ts'
import {
	ACCEPTANCE_NOT_NEEDED,
	CHANGED_AND_PASSES,
	DUPLICATE_LABEL,
	FROZEN_AFTER_RED,
	HELPER_DEPENDENT_OUTSIDE_RUN,
	HELPER_DEPENDENTS_LIMIT,
	HELPER_DEPENDENTS_OVER_LIMIT,
	HELPER_DEPENDENTS_STEP,
	NO_RED_RECEIPT,
	NOTHING_CHANGED_SINCE_RED,
	ONLY_REFUSAL,
	PASSES_ON_BASE_TOO,
	MOVED_CALL_DIFFERS,
	MOVED_CONFTESTS_DIFFER,
	MOVED_DEPENDENCY_DIFFERS,
	MOVED_FROM,
	CONFTEST_FILE_PATTERN,
	MOVED_BASE_RUN_STEP,
	MOVED_NO_OWN_CODE,
	MOVED_NO_RED,
	MOVED_OWN_CODE_DIFFERS,
	MOVED_PASSES_ON_BASE,
	PROOF_KINDS,
	PYTHON_FILE_PATTERN,
	PROVES_NOTHING,
	RED_KINDS,
	RED_ON_BASE_FLAG,
	REVISION_NOT_NEEDED,
	ROLLBACK_LINE,
	RUNNER_DISPLAY_NAMES,
	TEST_CODE_CHANGED_SINCE_RED,
	UNREAD_SETUP_LINE,
	UNRESOLVED_IMPORT_HINT,
	TDD_SUBCOMMANDS,
} from '../lib/tdd/tdd.constants.ts'
import { changedTestCodeOf, declaredPathRefusalOf } from '../lib/tdd/test-code-presence.ts'
import { listTestDependencies } from '../lib/tdd/test-dependencies.ts'
import { findOnlyMarkers, isTableTitledAt } from '../lib/tdd/test-source.ts'
import { TESTS_RECORD_STEP } from '../lib/tdd/tests-record.constants.ts'
import { refreshTddPart, testsRecordFolderOf } from '../lib/tdd/tests-record.ts'
import { readVitestConfigs } from '../lib/tdd/vitest-configs.ts'
import { judgeZeroCaseFiles, zeroCaseLines } from '../lib/tdd/zero-case-verdict.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { PackageJson } from '../lib/package-json.types.ts'
import type { LiveOutput } from '../lib/progress/step-progress.types.ts'
import type { BaseRedVerdict } from '../lib/tdd/base-red.types.ts'
import type {
	LotCaseEntry,
	LotMovedEntry,
	MovedCarry,
	ModuleResolver,
	MovedFrom,
	OwnCodeStatement,
	OwnCodeVerdict,
	ChangedTestFile,
	DuplicateCaseId,
	HelperVerdict,
	ReceiptFlag,
	RedJudgement,
	ReportedModule,
	RevisedHelper,
	RunCase,
	RunnerObserver,
	RunnerParams,
	TddContext,
	TddRunAdmission,
	TddEntry,
	TddFreeze,
	TddLedger,
	TddReceipt,
	TddSubcommand,
	TddTargets,
	TestCaseId,
	TestRunFailure,
} from '../lib/tdd/tdd.types.ts'
import type { TestCodePresence } from '../lib/tdd/test-code-presence.types.ts'

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
	printOut({ stream: result.exitCode === 0 ? 'stdout' : 'stderr', text: result.output })
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
		return resultOf({
			exitCode: 2,
			lines: [
				'tdd: red | green | status [<test file> | <test file>::<case name>]... [--base <ref>] [--json] | status --legend',
			],
		})
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
	if ('failure' in ledger)
		return resultOf({ exitCode: 1, lines: [`tdd ${subcommand}: ${ledger.failure}`] })
	const change = readChange({ root, packageJson, ledger, ref: getArg(argv, 'base') })
	if ('failure' in change)
		return resultOf({ exitCode: 1, lines: [`tdd ${subcommand}: ${change.failure}`] })
	const context: TddContext = {
		root,
		packageJson,
		...change,
		json: hasFlag(argv, 'json'),
		flagsOnly: hasFlag(argv, 'flags'),
		now: params.now,
		targets: parseTargets(words),
		ledger,
		...(params.live && {
			progress: createStepProgress({ live: params.live, clock: createSystemClock() }),
		}),
	}
	if (subcommand === 'red' || subcommand === 'green') {
		trashBaseRunLeftovers()
		const admission = admitRun({ context, subcommand })
		if ('refusal' in admission) return admission.refusal
		// the step's events: its lot from the worktree; a refused run writes none; the end after the ledger entry (D12)
		const recorder = startStep({ cwd: root, step: `tdd-${subcommand}`, heavy: false })
		/** The end's state hash, asked by the recorder only when it writes the end (R3-2). */
		function endStateHash(): string | null {
			return stepEndStateHashOf(root)
		}
		try {
			const result =
				subcommand === 'red'
					? await runRed({ context, admission })
					: await runGreen({ context, admission })
			recorder.end({ exit: result.exitCode, stateHash: endStateHash })
			return result
		} catch (error) {
			recorder.end({ exit: 1, stateHash: endStateHash })
			throw error
		}
	}
	return await runStatus(context)
}

/**
 * The state hash a `red` or `green` step end carries (D29, D30): the hash of the tree the run handed over, as the gate
 * records it; null when it cannot be computed (the end is recorded all the same, never a refusal). Given to the
 * recorder as a function: it runs only when the end is written, never outside a lot (R3-2).
 */
function stepEndStateHashOf(root: string): string | null {
	try {
		return computeStateHash(root)
	} catch {
		return null
	}
}

/**
 * What a `red` or `green` run reads before it runs, or the refusal that stops it there: test code changed since the
 * last red (`green` only), no test file new or changed, an unreadable lot file.
 */
function admitRun(params: {
	context: TddContext
	subcommand: 'red' | 'green'
}): TddRunAdmission | { refusal: CommandResult } {
	const { context, subcommand } = params
	const { root, ledger } = context
	const testCode = hashChangedTestCode(context)
	if (subcommand === 'green') {
		const changedHelpers = [...testCode]
			.filter(
				([file, hash]) => !isTestFile({ root, file }) && frozenHashOf({ ledger, file }) !== hash,
			)
			.map(([file]) => file)
		if (changedHelpers.length)
			return {
				refusal: resultOf({
					exitCode: 1,
					lines: [
						`tdd green: test code changed since the last red run: ${changedHelpers.join(', ')} - ${FROZEN_AFTER_RED}`,
					],
				}),
			}
	}
	const changed = listChangedTestFiles(context)
	const files = targetFiles({ changed, targets: context.targets })
	const noFileRefusal = {
		refusal: resultOf({
			exitCode: 1,
			lines: [
				`tdd ${subcommand}: no test file new or changed since the base (or among the files named)`,
			],
		}),
	}
	if (files.length === 0 && subcommand === 'green') return noFileRefusal
	const acceptances = readAcceptances(root)
	if ('failure' in acceptances)
		return {
			refusal: resultOf({ exitCode: 1, lines: [`tdd ${subcommand}: ${acceptances.failure}`] }),
		}
	const revisions = readRevisions(root)
	if ('failure' in revisions)
		return {
			refusal: resultOf({ exitCode: 1, lines: [`tdd ${subcommand}: ${revisions.failure}`] }),
		}
	const moves = readMovedEntries(root)
	if ('failure' in moves)
		return { refusal: resultOf({ exitCode: 1, lines: [`tdd ${subcommand}: ${moves.failure}`] }) }
	// a red run with no test file still runs for a changed helper differing from its last freeze: it may freeze it
	if (files.length === 0 && !hasHelperToFreeze({ root, ledger, testCode })) return noFileRefusal
	return {
		testCode,
		changed,
		files,
		acceptances,
		revisions,
		moves,
		configs: readVitestConfigs({ root }),
	}
}

/** A changed helper differs from its last freeze: a red run may freeze it (a `revised` entry, or its dependents). */
function hasHelperToFreeze(params: {
	root: string
	ledger: TddLedger
	testCode: ReadonlyMap<string, string>
}): boolean {
	return [...params.testCode].some(
		([file, hash]) =>
			!isTestFile({ root: params.root, file }) &&
			frozenHashOf({ ledger: params.ledger, file }) !== hash,
	)
}

async function runRed(params: {
	context: TddContext
	admission: TddRunAdmission
}): Promise<CommandResult> {
	const { context } = params
	const { root } = context
	const { testCode, changed, files, acceptances, revisions } = params.admission
	const lines: string[] = []
	const entries: TddEntry[] = []
	const at = context.now().toISOString()
	const production = readProductionState(context)
	const productionHash = production.hash
	const movedBack = filesMovedBack({ ledger: context.ledger, current: production })
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
	const runnable = files.filter((file) => !focused.includes(file))
	const modules = runnable.length
		? await announcedRun({
				context,
				subcommand: 'red',
				files: runnable.map((file) => file.file),
				filter: targetedFilter(context.targets),
				baseTexts: pythonBaseTextsOf(runnable),
				ownCode: true,
			})
		: []
	if ('failure' in modules) return runFailureResult({ subcommand: 'red', failure: modules })
	// what the run saw, for the listing of each file's dependencies below (a pytest file's come from its run)
	const reported: readonly ReportedModule[] = modules
	const run = readRunCases({
		root,
		packageJson: context.packageJson,
		modules,
		files: runnable,
	})
	const { unlisted } = run
	const duplicates = findDuplicateCaseIds(run.cases)
	const memberReasons = memberReasonsOf({ duplicates, cases: run.cases, files: runnable })
	// a case moved out of a deleted or shrunk test file is a case of the base: unchanged when it passes; a
	// name two cases share names no single case to move
	const moves = await readMoves({
		root,
		base: context.base,
		packageJson: context.packageJson,
		files: runnable,
		cases: run.cases.filter((testCase) => !isDuplicateMember({ testCase, duplicates })),
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
	const zeroCases = judgeZeroCaseFiles({
		root,
		configs: params.admission.configs,
		modules,
		files: runnable,
		unlisted,
		collectOnly: false,
	})
	lines.push(...zeroCaseLines(zeroCases))
	for (const refusal of zeroCases.refused)
		entries.push(
			fileRefusal({ file: refusal.file, reason: refusal.reason, productionHash, testCode, at }),
		)
	// a file that ran no case is never judged nor frozen: refused, or no vitest test file at all
	const ranNoCase = new Set([
		...unlisted.map((file) => file.file),
		...zeroCases.refused.map((refusal) => refusal.file),
		...zeroCases.notVitest,
		...zeroCases.pytestIgnored,
	])
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
				modules: reported,
			})
		listedDependencies.set(file, listed)
		return listed
	}
	const frozen: Record<string, string> = {}
	const judgedFiles = runnable.filter((candidate) => !ranNoCase.has(candidate.file))
	const { carries: movedCarries, onBase: movedOnBase } = await decideMovedCases({
		context,
		modules: reported,
		resolveModule,
		files: judgedFiles,
		cases: cases.filter((testCase) => judgedFiles.some((file) => file.file === testCase.file)),
		moves: params.admission.moves,
		acceptances,
		revisions,
		testCode,
		dependenciesOf: (file) => dependenciesOf(file).dependencies,
	})
	for (const file of judgedFiles) {
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
		const ofFile = cases.filter((testCase) => testCase.file === file.file)
		// a member of a duplicate group is never judged: refused when the run judges it, else only listed
		const unjudged = ofFile.filter(
			(testCase) => memberReasons.has(caseLabel(testCase)) && !isJudgedByRun({ testCase, context }),
		)
		const judged: RedJudgement[] = []
		// one case at a time: a revised case may run once more on the base
		for (const testCase of ofFile) {
			if (testCase.state === 'skipped' || unjudged.includes(testCase)) continue
			const reason = memberReasons.get(caseLabel(testCase))
			if (reason !== undefined) {
				judged.push({ testCase, kind: 'refused', detail: reason, reason, flags: [] })
				continue
			}
			const judgement = await judgeRed({
				testCase,
				context,
				productionHash,
				movedBack: movedBack.length > 0,
				testCodeChanged,
				acceptances,
				revisions,
				movedCarry: movedCarries.get(caseLabel(testCase)),
				movedOnBase: movedOnBase.get(caseLabel(testCase)),
			})
			judged.push(judgement)
		}
		const refused = judged.some((judgement) => judgement.kind === 'refused')
		for (const judgement of judged) {
			const recordable = judgement.kind !== 'kept' || judgement.flags.length > 0
			const receipt: TddReceipt | undefined = recordable
				? {
						kind: judgement.kind,
						...idOf(judgement.testCase),
						testFileHash: testCode.get(file.file) ?? '',
						caseHash: judgement.testCase.caseHash,
						productionHash: judgement.productionHash ?? productionHash,
						...(judgement.message && { message: judgement.message }),
						...(judgement.reason && { reason: judgement.reason }),
						...(judgement.flags.length && { flags: judgement.flags }),
						at,
					}
				: undefined
			// a refusal never drops the other cases' receipts
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
		// the members the run leaves unjudged: listed, no receipt (they still fail the run)
		lines.push(...unjudged.map((testCase) => duplicateLine({ testCase, memberReasons })))
		// a file with a refused case is frozen for its cases proven red: they need no re-red; the refused case,
		// with no red receipt, stays unproven
		if (refused && !judged.some((judgement) => judgement.kind === 'red')) continue
		frozen[file.file] = testCode.get(file.file) ?? ''
		// a helper, fixture or snapshot is frozen only by a red it can have shaped, a revision declared, or a
		// moved case (the helper a split registers its cases through); an accepted case freezes the data it reads
		// (a fixture, a document, a snapshot), never a code helper
		const shapesDependencies = judged.some(
			(judgement) =>
				judgement.kind === 'red' ||
				judgement.kind === 'revised' ||
				movedCases.has(caseLabel(judgement.testCase)),
		)
		const hasAcceptedCase = judged.some((judgement) => judgement.kind === 'accepted')
		for (const dependency of dependencies)
			if (
				testCode.has(dependency) &&
				(shapesDependencies || (hasAcceptedCase && isDataDependency(dependency)))
			)
				frozen[dependency] = testCode.get(dependency) ?? ''
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
	const helperVerdicts = await judgeOrphanHelpers({
		context,
		testCode,
		frozen,
		changed,
		dependenciesOf: (file) => dependenciesOf(file).dependencies,
	})
	for (const verdict of helperVerdicts) {
		if (verdict.frozen) frozen[verdict.file] = testCode.get(verdict.file) ?? ''
		lines.push(
			statusLine({
				label: verdict.frozen ? 'frozen' : 'unfrozen',
				id: verdict.file,
				detail: verdict.detail,
			}),
		)
	}
	const ownCode = ownCodeOfRun({ root, files: runnable, frozen, resolveModule, modules: reported })
	const conftests = conftestsOfRun({ root, files: runnable, frozen, modules: reported })
	if (Object.keys(frozen).length)
		entries.push({
			kind: 'freeze',
			files: frozen,
			...(revisedHelpers.length && { revised: revisedHelpers.map(({ file }) => file) }),
			...(Object.keys(ownCode).length && { ownCode }),
			...(Object.keys(conftests).length && { conftests }),
			at,
		})
	appendEntries({ root, entries, production })
	const summary = `tdd red: ${countLines({ lines, label: 'red' })} red, ${countLines({ lines, label: 'unchanged' })} unchanged, ${countLines({ lines, label: 'kept' })} kept, ${countLines({ lines, label: 'accepted' })} accepted, ${countLines({ lines, label: 'revised' })} revised, ${countLines({ lines, label: 'refused' })} refused${duplicateCountOf(lines)}; ${
		Object.keys(frozen).length ? `frozen: ${Object.keys(frozen).join(', ')}` : 'nothing frozen'
	}`
	const refused = countLines({ lines, label: 'refused' })
	const unjudgedMembers = countLines({ lines, label: DUPLICATE_LABEL })
	// counted before: the rollback line is no case line
	if (movedBack.length && countLines({ lines, label: 'red' }) > 0)
		lines.push(ROLLBACK_LINE.replace('{files}', movedBack.join(', ')))
	return finish({ context, lines, summary, refused, unjudgedMembers, duplicates })
}

/**
 * The changed helpers a `revised` entry of the lot file lets this red run freeze: changed since their last
 * freeze, not frozen by a red or a revised case of the run, and either with no changed test file depending
 * on them (whatever files the run names) or with every changed dependent in the run and frozen by it (none
 * refused, none with a red: a red freezes its helpers itself). The entry never excuses a red. With the
 * helpers it leaves unfrozen only because changed dependents of theirs are outside a targeted run, and
 * those files.
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
		const entry = revisionOfHelper({
			root: params.context.root,
			revisions: params.revisions,
			file,
		})
		if (!entry || file in frozen) continue
		if (frozenHashOf({ ledger: params.context.ledger, file }) === hash) continue
		const dependents = params.dependents(file)
		const inRun = dependents.filter((dependent) => params.inRun(dependent))
		const outside = dependents.filter((dependent) => !params.inRun(dependent))
		// no changed dependent: nothing else can ever freeze the helper, the entry does
		if (!inRun.every((dependent) => dependent in frozen)) continue
		if (outside.length) outsideRun.push({ file, outside })
		else revised.push({ file, entry })
	}
	return { revised, outsideRun }
}

/**
 * The changed helpers no changed test file depends on and nothing froze yet, judged by a run of the unchanged test files
 * importing them (`helper-dependents.ts`): none such, no run.
 */
async function judgeOrphanHelpers(params: {
	context: TddContext
	testCode: ReadonlyMap<string, string>
	frozen: Readonly<Record<string, string>>
	changed: readonly ChangedTestFile[]
	dependenciesOf: (file: string) => readonly string[]
}): Promise<HelperVerdict[]> {
	const { context, changed } = params
	const helpers = listOrphanHelpers({
		root: context.root,
		ledger: context.ledger,
		testCode: params.testCode,
		frozen: params.frozen,
		changedDependents: (helper) =>
			changed
				.filter((file) => params.dependenciesOf(file.file).includes(helper))
				.map((file) => file.file),
	})
	if (helpers.length === 0) return []
	const dependents = listUnchangedDependents({
		root: context.root,
		helpers,
		changed: new Set(changed.map((file) => file.file)),
		presence: context.presence,
		dependenciesOf: params.dependenciesOf,
	})
	// a refactor of a widely shared helper never runs most of the suite here: the helpers run in order while their
	// dependents fit the budget; each one past it is named with its own count, the revised entry standing instead
	const { within, over } = budgetDependents({ dependents, limit: HELPER_DEPENDENTS_LIMIT })
	const files = [...new Set([...within.values()].flat())].sort()
	const modules = files.length
		? await runTestCases({
				root: context.root,
				files,
				filter: 'all',
				observer: runnerObserverOf({ context, name: HELPER_DEPENDENTS_STEP }),
			})
		: []
	const overVerdicts: HelperVerdict[] = [...over].map(([file, of]) => ({
		file,
		frozen: false,
		detail: HELPER_DEPENDENTS_OVER_LIMIT.replace('{count}', String(of.length)).replace(
			'{limit}',
			String(HELPER_DEPENDENTS_LIMIT),
		),
	}))
	if ('failure' in modules)
		return [
			...[...within.keys()].map((file) => ({ file, frozen: false, detail: modules.failure })),
			...overVerdicts,
		]
	return [...judgeHelpers({ root: context.root, dependents: within, modules }), ...overVerdicts]
}

/** What a red run makes of one case. */
async function judgeRed(params: {
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
	/** What the lot's `moved` entries make of the case (`readMovedCarries`); none name it: undefined. */
	movedCarry: MovedCarry | undefined
	/** How the case ran on the base's production, when it may carry a red. */
	movedOnBase: BaseRedVerdict | undefined
}): Promise<RedJudgement> {
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
	// a case moved after its red, with no proof of its own yet: its red is carried from its earlier label
	if (params.movedCarry)
		return judgeMoved({ testCase, carry: params.movedCarry, onBase: params.movedOnBase })
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
	const judged = await judgePass({ ...params, counted })
	return acceptance
		? { ...judged, detail: joinParts([judged.detail, ACCEPTANCE_NOT_NEEDED]) }
		: judged
}

/**
 * The moved cases of a red run decided before their judgement: what the lot's `moved` entries make of each case
 * (`readMovedCarries`), then one run on the base's production of every case that may carry a red.
 */
async function decideMovedCases(params: {
	context: TddContext
	/** What the run reported: a pytest file's own code comes from it. */
	modules: readonly ReportedModule[]
	resolveModule: ModuleResolver
	files: readonly ChangedTestFile[]
	cases: readonly RunCase[]
	moves: readonly LotMovedEntry[]
	acceptances: readonly LotCaseEntry[]
	revisions: readonly LotCaseEntry[]
	testCode: ReadonlyMap<string, string>
	dependenciesOf: (file: string) => readonly string[]
}): Promise<{ carries: Map<string, MovedCarry>; onBase: Map<string, BaseRedVerdict> }> {
	const { context } = params
	const carries = readMovedCarries({
		...params,
		files: new Map(params.files.map((file) => [file.file, file])),
	})
	const onBase = await runCasesOnBase({
		root: context.root,
		base: context.base,
		packageJson: context.packageJson,
		testCases: params.cases.filter(
			(testCase) => carries.get(caseLabel(testCase))?.kind === 'carry',
		),
		observer: runnerObserverOf({ context, name: MOVED_BASE_RUN_STEP }),
	})
	return { carries, onBase }
}

/** The conftests each frozen pytest file of the run ran under (`conftestsOf`): a moved case keeps them. */
function conftestsOfRun(params: {
	root: string
	files: readonly ChangedTestFile[]
	frozen: Readonly<Record<string, string>>
	modules: readonly ReportedModule[]
}): Record<string, string[]> {
	return Object.fromEntries(
		params.files
			.filter((file) => file.file in params.frozen && PYTHON_FILE_PATTERN.test(file.file))
			.map((file) => [file.file, conftestsOf({ ...params, file: file.file })]),
	)
}

/** The conftests a pytest file ran under, as its run reported its dependencies: relative to the root, sorted. */
function conftestsOf(params: {
	root: string
	file: string
	modules: readonly ReportedModule[]
}): string[] {
	const realRoot = realPathOf(params.root)
	const [reported] = modulesOf({ root: params.root, modules: params.modules, file: params.file })
	return (reported?.dependencies ?? [])
		.filter((dependency) => CONFTEST_FILE_PATTERN.test(dependency))
		.map((dependency) => relative(realRoot, realPathOf(dependency)).split(sep).join(posix.sep))
		.sort()
}

/** What a moved case may keep of each frozen test file of the run: its own code by hash (`ownCodeOf`). */
function ownCodeOfRun(params: {
	root: string
	files: readonly ChangedTestFile[]
	frozen: Readonly<Record<string, string>>
	resolveModule: ModuleResolver
	modules: readonly ReportedModule[]
}): Record<string, string[]> {
	return Object.fromEntries(
		params.files
			.filter((file) => file.file in params.frozen)
			.flatMap((file) => {
				const statements = ownCodeOf({ ...params, file, side: 'now' })
				return statements === undefined
					? []
					: [[file.file, statements.map((statement) => statement.hash)]]
			}),
	)
}

/**
 * A test file's own code, now or at the base: read here for a JS/TS file (`own-code.ts`), from the cli's pytest
 * plugin's report for a pytest file (its `ownCode`, or `baseOwnCode` when the run was given the base text); undefined
 * when the report holds none (the file did not run, or its base text was not given).
 */
function ownCodeOf(params: {
	root: string
	file: ChangedTestFile
	side: 'now' | 'base'
	resolveModule: ModuleResolver
	modules: readonly ReportedModule[]
}): OwnCodeStatement[] | undefined {
	const { file, side } = params
	const text = side === 'now' ? file.text : file.baseText
	if (text === undefined) return side === 'base' ? [] : undefined
	if (!PYTHON_FILE_PATTERN.test(file.file))
		return listOwnCode({
			text,
			file: file.file,
			resolveTarget: targetResolverOf({ resolveModule: params.resolveModule, from: file.file }),
		})
	const [reported] = modulesOf({ root: params.root, modules: params.modules, file: file.file })
	return side === 'now' ? reported?.ownCode : reported?.baseOwnCode
}

/**
 * What the lot's `moved` entries make of each passing case of the run with no proof of its own, by its label: the first
 * earlier case (`findMovedFroms`; a file entry speaks only for the cases of the change) whose last counted red froze the
 * case's test call under its earlier name and every changed test code it depends on as it is now carries; none: a
 * refusal naming why (a case entry's earlier case holds no red, an earlier red froze another call or other test code),
 * or nothing when only file entries whose earlier files hold no red of it name the case (the normal path).
 */
function readMovedCarries(params: {
	context: TddContext
	/** What the run reported: a pytest file's own code comes from it. */
	modules: readonly ReportedModule[]
	resolveModule: ModuleResolver
	/** Each test file of the run, its text now and at the base. */
	files: ReadonlyMap<string, ChangedTestFile>
	cases: readonly RunCase[]
	moves: readonly LotMovedEntry[]
	acceptances: readonly LotCaseEntry[]
	revisions: readonly LotCaseEntry[]
	testCode: ReadonlyMap<string, string>
	dependenciesOf: (file: string) => readonly string[]
}): Map<string, MovedCarry> {
	const { context } = params
	const carries = new Map<string, MovedCarry>()
	if (params.moves.length === 0) return carries
	/** The receipts of a case the read rule counts. */
	function countedOf(testCase: TestCaseId): TddReceipt[] {
		return countingReceipts({
			ledger: context.ledger,
			testCase,
			acceptances: params.acceptances,
			revisions: params.revisions,
		}).counting
	}
	for (const testCase of params.cases) {
		if (testCase.state !== 'passed') continue
		if (countedOf(idOf(testCase)).some((receipt) => PROOF_KINDS.includes(receipt.kind))) continue
		const froms = findMovedFroms({ entries: params.moves, testCase }).filter(
			({ entry }) => namesOneCase(entry.to) || testCase.ofChange,
		)
		const carry = movedCarryOf({ ...params, testCase, froms, countedOf })
		if (carry) carries.set(caseLabel(testCase), carry)
	}
	return carries
}

/** The carry or the refusal of one case `froms` name (see `readMovedCarries`). */
function movedCarryOf(params: {
	context: TddContext
	/** What the run reported: a pytest file's own code comes from it. */
	modules: readonly ReportedModule[]
	resolveModule: ModuleResolver
	files: ReadonlyMap<string, ChangedTestFile>
	testCase: RunCase
	froms: readonly MovedFrom[]
	testCode: ReadonlyMap<string, string>
	dependenciesOf: (file: string) => readonly string[]
	countedOf: (testCase: TestCaseId) => TddReceipt[]
}): MovedCarry | undefined {
	const { testCase } = params
	let refusal: string | undefined
	for (const { entry, from } of params.froms) {
		const fromLabel = caseLabel(from)
		const red = params
			.countedOf(from)
			.filter((receipt) => receipt.kind === 'red')
			.at(-1)
		const sameCall =
			red !== undefined && caseHashOfBody({ name: from.name, body: testCase.body }) === red.caseHash
		const differing = sameCall
			? dependenciesUnlikeRed({
					...params,
					red,
					dependencies: params.dependenciesOf(testCase.file),
				})
			: []
		const ownCode =
			red !== undefined && sameCall && differing.length === 0
				? ownCodeUnlikeRed({ ...params, root: params.context.root, red, from })
				: undefined
		if (red !== undefined && ownCode?.kind === 'kept') return { kind: 'carry', from, red }
		// a file entry speaks only where its earlier file held the case's red
		if (refusal === undefined && (red !== undefined || namesOneCase(entry.to)))
			refusal = movedRefusalOf({ red, sameCall, differing, ownCode }).replace(
				'{from}',
				() => fromLabel,
			)
	}
	return refusal === undefined ? undefined : { kind: 'refused', reason: refusal }
}

/** Why a moved case carries no red from one earlier case, its earlier label left as `{from}`. */
function movedRefusalOf(params: {
	red: TddReceipt | undefined
	sameCall: boolean
	differing: readonly string[]
	ownCode: OwnCodeVerdict | undefined
}): string {
	const { ownCode } = params
	if (params.red === undefined) return MOVED_NO_RED
	if (!params.sameCall) return MOVED_CALL_DIFFERS
	if (params.differing.length > 0)
		return MOVED_DEPENDENCY_DIFFERS.replace('{files}', () => params.differing.join(', '))
	if (ownCode?.kind === 'added')
		return MOVED_OWN_CODE_DIFFERS.replace('{statement}', () => firstLine(ownCode.statement))
	if (ownCode?.kind === 'conftests')
		return MOVED_CONFTESTS_DIFFER.replace('{files}', () => ownCode.files.join(', '))
	return MOVED_NO_OWN_CODE
}

/**
 * Whether a moved case's file keeps only own code its earlier file held at the red it would carry (`own-code.ts`), or
 * that the file itself held at the base (a move into an existing file): the freeze of that red run recorded the earlier
 * file's statements; one statement of the new file in neither is named; a red that recorded none (a pytest file, an
 * older ledger) leaves nothing to compare.
 */
function ownCodeUnlikeRed(params: {
	context: TddContext
	root: string
	resolveModule: ModuleResolver
	modules: readonly ReportedModule[]
	testCase: RunCase
	from: TestCaseId
	red: TddReceipt
	files: ReadonlyMap<string, ChangedTestFile>
}): OwnCodeVerdict {
	const freeze = params.context.ledger.entries.find(
		(entry): entry is TddFreeze => entry.kind === 'freeze' && entry.at === params.red.at,
	)
	const recorded = freeze?.ownCode?.[params.from.file]
	const target = params.files.get(params.testCase.file)
	if (recorded === undefined || target === undefined) return { kind: 'unrecorded' }
	const now = ownCodeOf({ ...params, file: target, side: 'now' })
	const atBase = ownCodeOf({ ...params, file: target, side: 'base' })
	if (now === undefined || atBase === undefined) return { kind: 'unrecorded' }
	// what the earlier file held at that red, and what the target file held at the base (a move into an existing file)
	const held = new Set([...recorded, ...atBase.map((statement) => statement.hash)])
	const added = now.find((statement) => !held.has(statement.hash))
	if (added === undefined && PYTHON_FILE_PATTERN.test(target.file)) {
		// a pytest case runs under its folder's conftests: moved under others, its fixtures may be others
		const recordedConftests = freeze?.conftests?.[params.from.file]
		if (recordedConftests === undefined) return { kind: 'unrecorded' }
		const nowConftests = conftestsOf({ ...params, file: target.file })
		const differing = [
			...nowConftests.filter((file) => !recordedConftests.includes(file)),
			...recordedConftests.filter((file) => !nowConftests.includes(file)),
		]
		if (differing.length > 0) return { kind: 'conftests', files: differing }
	}
	return added === undefined ? { kind: 'kept' } : { kind: 'added', statement: added.text }
}

/**
 * The changed test code a moved case depends on now that differs from what the red it would carry froze: the freeze
 * that red run recorded (same moment) holds another hash, or none for a file changed since the base.
 */
function dependenciesUnlikeRed(params: {
	context: TddContext
	red: TddReceipt
	dependencies: readonly string[]
	testCode: ReadonlyMap<string, string>
}): string[] {
	const freeze = params.context.ledger.entries.find(
		(entry): entry is TddFreeze => entry.kind === 'freeze' && entry.at === params.red.at,
	)
	return params.dependencies.filter((file) => {
		const now = params.testCode.get(file)
		return now !== undefined && freeze?.files[file] !== now
	})
}

/**
 * A passing case its `moved` entries decided before the run (`carry`): refused for the reason given; carrying, refused
 * when it passes on the base's production as written now (its file may assert nothing of the lot's code), else the
 * earlier case's red under its label (flag `moved`, at that red's production state).
 */
function judgeMoved(params: {
	testCase: RunCase
	carry: MovedCarry
	onBase: BaseRedVerdict | undefined
}): RedJudgement {
	const { testCase, carry } = params
	if (carry.kind === 'refused')
		return { testCase, kind: 'refused', detail: carry.reason, reason: carry.reason, flags: [] }
	const fromLabel = caseLabel(carry.from)
	if (params.onBase?.kind === 'passes') {
		const reason = MOVED_PASSES_ON_BASE.replace('{from}', () => fromLabel)
		return { testCase, kind: 'refused', detail: reason, reason, flags: [] }
	}
	return {
		testCase,
		kind: 'red',
		detail: MOVED_FROM.replace('{from}', () => fromLabel),
		...(carry.red.message !== undefined && { message: carry.red.message }),
		flags: ['moved'],
		productionHash: carry.red.productionHash,
	}
}

/**
 * What a red run makes of a passing case no acceptance decides, from the receipts of it that count. A revised
 * case nothing else can prove runs once more on the base's production (`judgeOnBase`): one not of the base, and
 * one whose own test call changed since its red that still awaits its green.
 */
async function judgePass(params: {
	testCase: RunCase
	context: TddContext
	productionHash: string
	testCodeChanged: boolean
	revisions: readonly LotCaseEntry[]
	/** The receipts of the case the read rule counts, refusals left out. */
	counted: readonly TddReceipt[]
}): Promise<RedJudgement> {
	const { testCase, productionHash, counted } = params
	const { ledger } = params.context
	const prior = counted.at(-1)
	const revision = findCaseEntry({ entries: params.revisions, testCase, list: 'revised' })
	// its test corrected before its green: only the base can still show it red
	if (revision && prior && prior.caseHash !== testCase.caseHash && awaitsGreen(counted))
		return await judgeOnBase({ testCase, context: params.context })
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
		return await judgeOnBase({ testCase, context: params.context })
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

/**
 * A revised case passing now, run on the base's production with the lot's current test code: red there is a real
 * red flagged `red on base` at the base's production state; passing there, or failing for no real reason, is
 * refused.
 */
async function judgeOnBase(params: {
	testCase: RunCase
	context: TddContext
}): Promise<RedJudgement> {
	const { testCase, context } = params
	const verdict = await runCaseOnBase({
		root: context.root,
		base: context.base,
		packageJson: context.packageJson,
		testCase,
		observer: runnerObserverOf({ context, name: 'tdd red on the base' }),
	})
	if (verdict.kind === 'passes')
		return {
			testCase,
			kind: 'refused',
			detail: PASSES_ON_BASE_TOO,
			reason: PASSES_ON_BASE_TOO,
			flags: [],
		}
	if (verdict.kind === 'refused')
		return { testCase, kind: 'refused', detail: verdict.reason, reason: verdict.reason, flags: [] }
	return {
		testCase,
		kind: 'red',
		detail: `${verdict.failure.kind}: ${firstLine(verdict.failure.message)}`,
		message: verdict.failure.message,
		flags: [RED_ON_BASE_FLAG],
		productionHash: verdict.productionHash,
	}
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

async function runGreen(params: {
	context: TddContext
	admission: TddRunAdmission
}): Promise<CommandResult> {
	const { context } = params
	const { root, ledger } = context
	const { testCode, files, acceptances, revisions } = params.admission
	const modules = await announcedRun({
		context,
		subcommand: 'green',
		baseTexts: pythonBaseTextsOf(files),
		files: files.map((file) => file.file),
	})
	if ('failure' in modules) return runFailureResult({ subcommand: 'green', failure: modules })
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
	lines.push(
		...zeroCaseLines(
			judgeZeroCaseFiles({
				root,
				configs: params.admission.configs,
				modules,
				files,
				unlisted,
				collectOnly: false,
			}),
		),
	)
	const duplicates = findDuplicateCaseIds(cases)
	const memberReasons = memberReasonsOf({ duplicates, cases, files })
	const verdicts = cases
		.filter((testCase) => isJudgedByRun({ testCase, context }))
		.map(function judgeCase(testCase) {
			// the last proof the read rule counts: a stale acceptance or revision never stands in for the red
			const proof = countingReceipts({ ledger, testCase: idOf(testCase), acceptances, revisions })
				.counting.filter((receipt) => PROOF_KINDS.includes(receipt.kind))
				.at(-1)
			// a member of a duplicate group is refused whatever its receipts: they name no single case
			const refusal =
				memberReasons.get(caseLabel(testCase)) ??
				greenRefusal({ testCase, proof, ledger, testCode, productionHash })
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
	// the members the run leaves unjudged (skipped, not targeted): listed, no receipt (they still fail the run)
	lines.push(
		...cases
			.filter(
				(testCase) =>
					memberReasons.has(caseLabel(testCase)) && !isJudgedByRun({ testCase, context }),
			)
			.map((testCase) => duplicateLine({ testCase, memberReasons })),
	)
	appendEntries({ root, entries, production })
	const summary = `tdd green: ${countLines({ lines, label: 'green' })} green, ${countLines({ lines, label: 'unchanged' })} unchanged, ${countLines({ lines, label: 'refused' })} refused${duplicateCountOf(lines)}`
	const refused = countLines({ lines, label: 'refused' })
	const unjudgedMembers = countLines({ lines, label: DUPLICATE_LABEL })
	// counted before: the rollback line is no case line
	if (flags.length && countLines({ lines, label: 'green' }) > 0)
		lines.push(ROLLBACK_LINE.replace('{files}', movedBack.join(', ')))
	const warning = await recordTddPart({ context, at })
	return finish({ context, lines, summary, refused, unjudgedMembers, duplicates, warning })
}

/**
 * The tdd part of the `tests.json` of the lot whose own worktree runs the green, shown as a progress step while it reads
 * the cases: the `!` line when it could not be written; nothing outside a lot's own worktree.
 */
async function recordTddPart(params: {
	context: TddContext
	at: string
}): Promise<string | undefined> {
	const { context } = params
	const found = testsRecordFolderOf({ cwd: context.root })
	if (found === undefined || 'warning' in found) return found?.warning
	const { folder } = found
	const clock = createSystemClock()
	const startedAt = clock.now()
	const running = context.progress?.start({ name: TESTS_RECORD_STEP, detail: '' })
	const warning = await refreshTddPart({
		folder,
		root: context.root,
		packageJson: context.packageJson,
		base: context.base,
		at: params.at,
	})
	running?.finish(
		`${warning === undefined ? '✓' : '✗'} ${TESTS_RECORD_STEP}  ${formatDuration(clock.now() - startedAt)}`,
	)
	return warning
}

/** The case is one the run judges: it ran (not skipped) and the command line targets it. */
function isJudgedByRun(params: { testCase: RunCase; context: TddContext }): boolean {
	const { testCase } = params
	return testCase.state !== 'skipped' && isTargeted({ testCase, targets: params.context.targets })
}

/**
 * The refusal reason of each member of the duplicate groups, by its case label: the hint names the cut of a
 * table title when a member's title is one (`isTableTitledAt`).
 */
function memberReasonsOf(params: {
	duplicates: readonly DuplicateCaseId[]
	cases: readonly RunCase[]
	files: readonly ChangedTestFile[]
}): Map<string, string> {
	const reasons = new Map<string, string>()
	for (const duplicate of params.duplicates) {
		const members = params.cases.filter((testCase) =>
			isDuplicateMember({ testCase, duplicates: [duplicate] }),
		)
		const text = params.files.find((file) => file.file === duplicate.file)?.text
		const tableTitled =
			text !== undefined &&
			members.some(
				(member) =>
					member.location !== undefined &&
					isTableTitledAt({ text, file: duplicate.file, location: member.location }),
			)
		const reason = duplicateReasonOf({ duplicate, tableTitled })
		for (const member of members) reasons.set(caseLabel(member), reason)
	}
	return reasons
}

/** The line of a member a run leaves unjudged: `duplicate  <case>  <reason>`. */
function duplicateLine(params: {
	testCase: RunCase
	memberReasons: ReadonlyMap<string, string>
}): string {
	const id = caseLabel(params.testCase)
	return statusLine({
		label: DUPLICATE_LABEL,
		id,
		detail: params.memberReasons.get(id) ?? '',
	})
}

/** `, <n> duplicate` for the summary when members were left unjudged; nothing otherwise. */
function duplicateCountOf(lines: readonly string[]): string {
	const count = countLines({ lines, label: DUPLICATE_LABEL })
	return count ? `, ${count} ${DUPLICATE_LABEL}` : ''
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
	if ('failure' in state) return runFailureResult({ subcommand: 'status', failure: state })
	if (context.json) return { exitCode: 0, output: jsonOf(state, 2) }
	if (context.flagsOnly) {
		const flagged = state.cases.filter((line) => line.flags.length)
		return resultOf({
			exitCode: 0,
			lines: flagged.length
				? flagged.map(
						(line) => `${line.status}  ${caseLabel(line)}  flags: ${line.flags.join(', ')}`,
					)
				: ['tdd status: no case of the change carries a flag'],
		})
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
		...zeroCaseLines({
			refused: state.zeroCases ?? [],
			notVitest: state.notVitest ?? [],
			pytestIgnored: state.pytestIgnored ?? [],
		}),
		// the suite infrastructure a config names in a way tdd cannot read: said, never dropped in silence
		...createModuleResolver({ root: context.root }).unreadableSetup.map((value) =>
			UNREAD_SETUP_LINE.replace('{config}', () => value.config)
				.replace('{property}', () => value.property)
				.replace('{text}', () => value.text),
		),
	]
	return resultOf({
		exitCode: 0,
		lines: lines.length ? lines : ['tdd status: no test code new or changed since the base'],
	})
}

/** A run that answered no report, exit 1: the cli's reason on its line, then vitest's last lines, relayed. */
function runFailureResult(params: {
	subcommand: TddSubcommand
	failure: TestRunFailure
}): CommandResult {
	const { failure, tail } = params.failure
	const own = textOf([`tdd ${params.subcommand}: ${failure}`])
	return { exitCode: 1, output: tail?.length ? joinedOf([own, relayedTextOf(tail)]) : own }
}

/**
 * The cases a red run asks its runners for: the cases the command line names, when it names cases and no whole
 * file (`<file>::<case>` runs only that case: vitest skips the others, node never starts them); else every case.
 */
function targetedFilter(targets: TddTargets): RunnerParams['filter'] {
	if (targets.cases.length === 0 || targets.files.length > 0) return 'all'
	return { names: targets.cases.map((testCase) => testCase.name) }
}

/** The cases of the files `filter` asks (default: every one), run by their runners, the run announced first (a start line or a spinner). */
async function announcedRun(params: {
	context: TddContext
	subcommand: TddSubcommand
	files: string[]
	filter?: RunnerParams['filter']
	baseTexts?: RunnerParams['baseTexts']
	ownCode?: boolean
}): Promise<Awaited<ReturnType<typeof runTestCases>>> {
	const { context } = params
	return runTestCases({
		root: context.root,
		files: params.files,
		filter: params.filter ?? 'all',
		...(params.baseTexts && { baseTexts: params.baseTexts }),
		...(params.ownCode && { ownCode: true }),
		observer: runnerObserverOf({ context, name: `tdd ${params.subcommand}` }),
	})
}

/** Each runner's run shown as a progress step `<name>: <runner>`: a running line, then its mark and duration. */
function runnerObserverOf(params: { context: TddContext; name: string }): RunnerObserver {
	const { context } = params
	const clock = createSystemClock()
	return {
		start: function startRunnerStep({ runner, fileCount }) {
			const startedAt = clock.now()
			const name = `${params.name}: ${RUNNER_DISPLAY_NAMES[runner]}`
			const running = context.progress?.start({ name, detail: `${fileCount} test file(s)` })
			return {
				finish: function finishRunnerStep({ failed }) {
					running?.finish(
						`${failed ? '✗' : '✓'} ${name} ran ${fileCount} test file(s)  ${formatDuration(clock.now() - startedAt)}`,
					)
				},
			}
		},
	}
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

/** A red or green run's result: exit 1 on a refusal or a duplicate member left unjudged; `--json` with the groups. */
function finish(params: {
	context: TddContext
	lines: string[]
	summary: string
	refused: number
	/** The duplicate members the run listed without judging them. */
	unjudgedMembers: number
	duplicates: readonly DuplicateCaseId[]
	/** The `!` line of a record the run could not write (its receipts stand). */
	warning?: string
}): CommandResult {
	const { warning } = params
	const exitCode = params.refused + params.unjudgedMembers > 0 ? 1 : 0
	if (params.context.json)
		return {
			exitCode,
			output: jsonOf(
				{
					lines: params.lines,
					refused: params.refused,
					duplicates: params.duplicates,
					...(warning !== undefined && { warning }),
				},
				2,
			),
		}
	return resultOf({
		exitCode,
		lines: [...params.lines, params.summary, ...(warning === undefined ? [] : [warning])],
	})
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

function idOf(testCase: TestCaseId): TestCaseId {
	return { file: testCase.file, name: testCase.name, project: testCase.project }
}

function isSubcommand(word: string | undefined): word is TddSubcommand {
	return TDD_SUBCOMMANDS.some((subcommand) => subcommand === word)
}

/**
 * The change a run measures: its base (`resolveBase`: the lot base, or `--base <ref>`) and its presence map
 * (`changedTestCodeOf`); or why there is none: no base, a lot file that cannot be read, or a `gone` or `moved` entry
 * naming a path the presence map refuses (`declaredPathRefusalOf`), refused before anything is read.
 */
function readChange(params: {
	root: string
	packageJson: PackageJson
	ledger: TddLedger
	ref: string | undefined
}): { base: string; presence: TestCodePresence } | { failure: string } {
	const { root, ledger } = params
	const base = resolveBase(params)
	if (typeof base !== 'string') return base
	const presence = changedTestCodeOf({ root, base })
	const gone = readGoneEntries(root)
	if ('failure' in gone) return gone
	const moved = readMovedEntries(root)
	if ('failure' in moved) return moved
	const refusal = declaredPathRefusalOf({ root, presence, ledger, gone, moved })
	return refusal === undefined ? { base, presence } : { failure: refusal }
}
