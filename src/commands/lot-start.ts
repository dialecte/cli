/**
 * `dialecte lot start <brief.json> [--effort low|medium|high] [--by <who> --reason <text>] [--simulate <scenario>]
 * [--dry-run] [--json]`: checks the brief, derives the scope's risk class (an effort below it needs `--by` and
 * `--reason`), claims an index, publishes the lot folder with its `risk.jsonl`, makes the worktree and its link (33S
 * section 5, `lot start`, in order; 33L1 section 5). A simulated start records the overlap and branch findings instead of refusing, copies the scenario
 * into the lot and makes no worktree, branch or link (33S section 8). Each step
 * is an exported function, so the race of two starts can be played in a forced order.
 */
import { linkSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

import { resultOf } from '../lib/command-result.ts'
import { recordForecastRun } from '../lib/coordination/forecast-record.ts'
import { forecastLot } from '../lib/coordination/forecast.ts'
import { recordBaseDeclared } from '../lib/design/base-declared.ts'
import { designNeedLine } from '../lib/design/design-line.ts'
import { designNeedOf } from '../lib/design/design-need.ts'
import { heldPlanEntryOf } from '../lib/design/design-standing.ts'
import { NODE_MODULES_WORDS, NPM_RUN_METHODS } from '../lib/events/record-step.constants.ts'
import { startStep } from '../lib/events/record-step.ts'
import { realPathThroughAncestors } from '../lib/file-system.ts'
import { branchExists } from '../lib/git.ts'
import { registryOfCommonFolder } from '../lib/handover/handover-store-read.ts'
import { createHost } from '../lib/host/select-host.ts'
import { fillMessage } from '../lib/knowledge/standard/fill-message.ts'
import { lazyHostOf, settleMetLots, withSettledLines } from '../lib/landing/met-lots.ts'
import { JSON_FLAG } from '../lib/parse-invocation.constants.ts'
import { jsonOf, textOf } from '../lib/print/print.ts'
import { readCliVersion } from '../lib/read-cli-version.ts'
import { forbiddenWordRefusal, isOneLine } from '../lib/review-rounds/option-checks.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { readDeclaredHigh } from '../lib/risk/declared-high.ts'
import { readBaseDeclaredHigh } from '../lib/risk/derive-lot-risk-class.ts'
import { deriveStartRiskClass } from '../lib/risk/derive-risk-class.ts'
import { appendRiskLine, effortOfClass, isEffortBelow } from '../lib/risk/risk-records.ts'
import {
	RISK_EFFORT_BELOW_LINE,
	RISK_GO_AHEAD_PART,
	RISK_SCHEMA,
} from '../lib/risk/risk.constants.ts'
import { BRIEF_EFFORTS } from '../lib/store/brief.constants.ts'
import { briefRepositoryOf, checkBrief, overlapHoldOf } from '../lib/store/brief.ts'
import {
	CARRY_DECLARATION_COPY_NAME,
	CARRY_DRY_RUN_LINE,
	CARRY_LEDGER_COPY_NAME,
	CARRY_SCHEMA,
	CARRY_SIMULATE_USAGE,
	CARRY_START_LINE,
} from '../lib/store/carry-source.constants.ts'
import { checkCarrySource, checkCarrySourceState } from '../lib/store/carry-source.ts'
import { readIdentity } from '../lib/store/identity.ts'
import { KEEP_REASON_LIMIT, KEEP_SCHEMA } from '../lib/store/keep-decisions.constants.ts'
import { appendKeepLine } from '../lib/store/keep-decisions.ts'
import { lotRefusalExit, lotUsageExit } from '../lib/store/lot-exits.ts'
import {
	failedNextOf,
	manualNextOf,
	simulatedStartNextOf,
	startNextOf,
	waitNextOf,
} from '../lib/store/lot-next.ts'
import {
	appendLotOverlaps,
	isCoveredOverlap,
	lotOverlapLines,
	overlapGoAheadRefusal,
	overlapRecordsOf,
	overlapsOverLimit,
} from '../lib/store/lot-overlaps.ts'
import {
	overlapLotLabelOf,
	overlapMetText,
	overlappingOpenLots,
	readLotScope,
} from '../lib/store/lot-records.ts'
import { writePlanEntry } from '../lib/store/plan-entry.ts'
import { lotPlanEntryIds } from '../lib/store/public-text.ts'
import { recordText, removeDeadLeftovers, temporaryPidOf } from '../lib/store/publish.ts'
import { SCENARIO_SCHEMA, SCENARIOS } from '../lib/store/scenarios.constants.ts'
import { recordedByOf } from '../lib/store/signer-rules.ts'
import { STACK_SCHEMA } from '../lib/store/stack.constants.ts'
import { readStackRecord, writeStack } from '../lib/store/stack.ts'
import { locateStore, publishLotFolder, removeStoreLeftovers } from '../lib/store/store-folder.ts'
import { appendStoreList, storeListRefusal } from '../lib/store/store-list.ts'
import {
	CALLER,
	GO_AHEAD_LABELS,
	LOT_LINK_SEGMENTS,
	RUNNERS,
	STORE_FILES,
	STORE_REFUSAL,
} from '../lib/store/store.constants.ts'
import { appendTransition } from '../lib/store/transitions.ts'
import { WORKTREES_FOLDER } from '../lib/workspace.constants.ts'
import { addWorktree } from '../lib/worktree/add-worktree.ts'
import {
	claimWorktreeIndex,
	nextWorktreeIndex,
	worktreeFolderName,
} from '../lib/worktree/worktree-index.ts'
import {
	BRANCH_MADE_SUFFIX,
	ENGINE,
	IDENTITY_SCHEMA,
	LINK_REFUSED_NOTE,
	NO_DECLARED_PATH,
	OVERLAP_REASON,
	PROBE_NAME,
	PROBE_SOURCE,
	PROBE_TARGET,
	START_BELOW_REFUSAL,
	START_EFFORT_LINE,
	START_FLAGS,
	START_KEEP_TEXTS,
	START_OVERLAP_LINE,
	START_OVERLAP_NOT_NEEDED_LINE,
	START_OVERLAPS_OVER_LIMIT,
	START_REASON,
	START_SHARES_LINE,
	START_USAGE_REASONS,
	START_VALUE_OPTIONS,
	START_VERB,
} from './lot-start.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { DesignNeed } from '../lib/design/design.types.ts'
import type { StepHandle, WorktreeAddParts } from '../lib/events/record-step.types.ts'
import type { MetLotsSettled } from '../lib/landing/met-lots.types.ts'
import type { RiskClass, RiskDerivation } from '../lib/risk/risk.types.ts'
import type { BriefEffort, CheckedBrief } from '../lib/store/brief.types.ts'
import type {
	CarryFile,
	CarrySource,
	CarrySourceState,
	CarrySummary,
} from '../lib/store/carry-source.types.ts'
import type { KeepLine } from '../lib/store/keep-decisions.types.ts'
import type { LotOverlapRecord } from '../lib/store/lot-overlaps.types.ts'
import type { ScenarioFile } from '../lib/store/scenarios.types.ts'
import type {
	LotIdentity,
	LotOverlap,
	Refusal,
	SynchronousPause,
	Transition,
	TransitionCauseKind,
} from '../lib/store/store.types.ts'
import type { NodeModulesSource } from '../lib/worktree/worktree.types.ts'
import type {
	LinkFunction,
	LotWorktreeResult,
	PreparedStart,
	PrepareStartResult,
	Simulation,
	StartEffort,
	StartGoAhead,
	StartRisk,
	StartSeams,
	StartStack,
	SymlinkFunction,
} from './lot-start.types.ts'

/**
 * Starts the lot of a brief (or checks it with `--dry-run`); every exit is JSON under `--json`, a usage error and a
 * refused brief included (exit 2, `next: null`). `asked` is the effort a terminal answered (D13): source `asked`.
 */
export function startLot(params: {
	cwd: string
	/** The words after the verb: `<brief.json>` and the options. */
	argv: string[]
	now?: Date
	seams?: StartSeams
	asked?: BriefEffort
}): CommandResult {
	const prepared = prepareStart(params)
	if ('exit' in prepared) return prepared.exit
	return finishStart({ prepared: prepared.prepared, asked: params.asked })
}

/**
 * The checks of a start up to its effort: the words, the brief, `--by` and `--reason`, the store list, the scope's
 * risk class. Nothing written, but the landed facts of the lots the scope met that merged on the host (a real start,
 * neither a dry run nor a simulated one): an exit after the brief check names them first.
 */
export function prepareStart(params: {
	cwd: string
	argv: string[]
	now?: Date
	seams?: StartSeams
}): PrepareStartResult {
	const prepared = prepareStartChecks(params)
	if ('prepared' in prepared) return prepared
	return {
		exit: withSettledLines({
			result: prepared.exit,
			settle: 'settle' in prepared ? prepared.settle : undefined,
			json: params.argv.includes(JSON_FLAG),
		}),
	}
}

// dialecte-allow duplicate-read: the body of prepareStart, which names the settled lots on its exits
/** The checks of `prepareStart`; an exit after the brief check carries what the settle of the met lots found. */
function prepareStartChecks(params: {
	cwd: string
	argv: string[]
	now?: Date
	seams?: StartSeams
}): PrepareStartResult | { exit: CommandResult; settle: MetLotsSettled | undefined } {
	const now = params.now ?? new Date()
	const read = readArguments({
		argv: params.argv,
		valueOptions: START_VALUE_OPTIONS,
		flags: START_FLAGS,
	})
	if (typeof read === 'string')
		return { exit: lotUsageExit({ reason: read, json: params.argv.includes(JSON_FLAG) }) }
	const json = read.flags.has('json')
	const [briefPath, ...extra] = read.words
	if (briefPath === undefined)
		return { exit: lotUsageExit({ reason: START_USAGE_REASONS.noBrief, json }) }
	if (extra.length > 0)
		return {
			exit: lotUsageExit({
				reason: START_USAGE_REASONS.extra.replace('{extra}', extra.join(' ')),
				json,
			}),
		}
	const effortFlag = read.values.get('effort')
	if (effortFlag !== undefined && !BRIEF_EFFORTS.includes(effortFlag as BriefEffort))
		return {
			exit: lotUsageExit({
				reason: START_USAGE_REASONS.effort
					.replace('{effort}', effortFlag)
					.replace('{efforts}', BRIEF_EFFORTS.join(', ')),
				json,
			}),
		}
	const goAhead = goAheadOf({ by: read.values.get('by'), reason: read.values.get('reason') })
	if (typeof goAhead === 'string') return { exit: lotUsageExit({ reason: goAhead, json }) }
	// an accepted overlap is always named: who accepts it and why (the same go-ahead an effort below the class takes)
	const overlapOk = read.flags.has('overlap-ok')
	if (overlapOk && goAhead === undefined)
		return { exit: lotUsageExit({ reason: START_USAGE_REASONS.overlapOk, json }) }
	const seams = params.seams ?? {}
	const scenarioName = read.values.get('simulate')
	const simulation = scenarioName === undefined ? undefined : simulationOf({ scenarioName, seams })
	if (typeof simulation === 'string')
		return { exit: errorOutput({ exitCode: 2, message: simulation, json }) }
	const carryState = carrySourceStateOf({
		from: read.values.get('from'),
		simulated: simulation !== undefined,
		briefFile: resolve(params.cwd, briefPath),
		cwd: params.cwd,
		json,
	})
	if (carryState !== undefined && 'exit' in carryState) return carryState
	const stackOn = read.values.get('on')
	const checked = checkBrief({
		briefPath,
		cwd: params.cwd,
		simulated: simulation !== undefined,
		pause: seams.pause,
		overlapOk,
		stackOn,
		now: params.now,
		settleMet: function settleMet(met) {
			return settleMetLots({
				...met,
				host: lazyHostOf({ given: seams.host, make: createHost }),
				now,
				write: !read.flags.has('dry-run') && simulation === undefined,
			})
		},
	})
	if (checked.stackRefusal !== undefined)
		return { exit: lotRefusalExit({ lines: [checked.stackRefusal], json }), settle: checked.settle }
	if (!checked.checked)
		return { exit: refusedOutput({ refused: checked.refused, json }), settle: checked.settle }
	const carry =
		carryState === undefined
			? undefined
			: checkCarrySource({ source: carryState, repository: checked.checked.repository })
	if (carry !== undefined && 'refusals' in carry)
		return { exit: lotRefusalExit({ lines: carry.refusals, json }), settle: checked.settle }
	const { brief, stack } = stackedBriefOf(checked.checked)
	const wordRefusal = goAheadRefusalOf({
		brief,
		goAhead,
		overlapOk,
		now,
		briefFile: resolve(params.cwd, briefPath),
	})
	if (wordRefusal)
		return { exit: lotRefusalExit({ lines: [wordRefusal], json }), settle: checked.settle }
	const keep = startKeepOf({
		brief,
		flag: read.values.get('keep'),
		goAhead,
		now,
		briefFile: resolve(params.cwd, briefPath),
	})
	if (typeof keep === 'string')
		return { exit: lotRefusalExit({ lines: [keep], json }), settle: checked.settle }
	// the store list is refused for a dry run too: it says what a real start would meet
	const listRefusal = storeListRefusal({})
	if (listRefusal)
		return {
			exit: errorOutput({ exitCode: 2, message: listRefusal, json }),
			settle: checked.settle,
		}
	let derivation: RiskDerivation
	try {
		derivation = deriveStartRiskClass({
			declaredHigh: readDeclaredHigh({ root: brief.repository }),
			scope: brief.scope,
		})
	} catch (error) {
		return { exit: thrownOutput({ error, json }), settle: checked.settle }
	}
	return {
		prepared: {
			brief,
			briefPath,
			worktreesFolder: join(dirname(brief.repository), WORKTREES_FOLDER),
			simulation,
			json,
			dryRun: read.flags.has('dry-run'),
			now,
			seams,
			effortFlag: effortFlag as BriefEffort | undefined,
			goAhead,
			derivation,
			stack,
			keep,
			carry,
			settle: checked.settle,
		},
	}
}

/**
 * The lot `--from` names, checked before the brief (a live source still holds its scope, so a rebuild of it would
 * otherwise be refused as an overlap first), resolved in the brief's repository (the folder the start runs from when
 * the brief names none: the brief check then refuses it); the exit of a refusal, or of `--from` with `--simulate` (a
 * simulated lot has no worktree and runs no tdd). Undefined without `--from`.
 */
function carrySourceStateOf(params: {
	from: string | undefined
	simulated: boolean
	briefFile: string
	cwd: string
	json: boolean
}): CarrySourceState | { exit: CommandResult } | undefined {
	const { from, json } = params
	if (from === undefined) return undefined
	if (params.simulated)
		return { exit: errorOutput({ exitCode: 2, message: CARRY_SIMULATE_USAGE, json }) }
	const state = checkCarrySourceState({
		cwd: briefRepositoryOf({ briefFile: params.briefFile }) ?? params.cwd,
		argument: from,
	})
	return 'refusals' in state ? { exit: lotRefusalExit({ lines: state.refusals, json }) } : state
}

/**
 * The first `keep` line of a start (KEEP 3.4): `--keep` or the brief's `keep` (both given is refused), signed by the
 * go-ahead's `--by` (the orchestrator recorded as one word) or `caller`, at the start's time; that signer and the keep's
 * reason pass the go-ahead's text check (a forbidden word, a path, a link, a reference, a plan entry id), the refusal
 * naming `--keep` or the brief's `keep`. Undefined without a keep; the refusal line when refused.
 */
function startKeepOf(params: {
	brief: CheckedBrief
	flag: string | undefined
	goAhead: StartGoAhead | undefined
	now: Date
	briefFile: string
}): KeepLine | undefined | string {
	const { brief, flag } = params
	if (flag !== undefined && brief.keep !== undefined) return START_KEEP_TEXTS.twice
	if (flag !== undefined && !isOneLine(flag)) return START_KEEP_TEXTS.notOneLine
	if (flag !== undefined && flag.length > KEEP_REASON_LIMIT)
		return fillMessage({
			template: START_KEEP_TEXTS.overLimit,
			values: { length: String(flag.length), limit: String(KEEP_REASON_LIMIT) },
		})
	const reason = flag ?? brief.keep
	if (reason === undefined) return undefined
	const by = recordedByOf({ by: params.goAhead?.by ?? CALLER })
	const refusal = overlapGoAheadRefusal({
		root: brief.repository,
		verb: START_VERB,
		by,
		reason,
		ids: lotPlanEntryIds({
			planPath: briefPlanPathOf({ brief, briefFile: params.briefFile }),
			branch: brief.branch,
		}),
		labels: {
			by: GO_AHEAD_LABELS.by,
			reason: flag === undefined ? START_KEEP_TEXTS.briefLabel : START_KEEP_TEXTS.flagLabel,
		},
	})
	if (refusal !== undefined) return refusal
	return { schema: KEEP_SCHEMA, at: params.now.toISOString(), op: 'keep', by, reason }
}

/**
 * The brief of a start `--on <lot>` (33CI CI4): its base is the parent's branch at its tip, the stack naming the parent
 * only; the brief as checked without `--on`.
 */
function stackedBriefOf(brief: CheckedBrief): {
	brief: CheckedBrief
	stack: StartStack | undefined
} {
	const parent = brief.stackParent
	if (parent === undefined) return { brief, stack: undefined }
	return {
		brief: { ...brief, base: { ref: parent.branch, commit: parent.head } },
		stack: { parent: parent.name },
	}
}

/**
 * Why the go-ahead may not be recorded: a person's forbidden word in `--by` or `--reason`; with accepted overlaps (they
 * reach the public records), a path, a link, a reference or a plan entry id in either, or records over the limit of
 * one append. Undefined without a go-ahead, or when it passes.
 */
function goAheadRefusalOf(params: {
	brief: CheckedBrief
	goAhead: StartGoAhead | undefined
	overlapOk: boolean
	now: Date
	/** The brief file's absolute path: its plan's entry ids are among those refused. */
	briefFile: string
}): string | undefined {
	const { brief, goAhead } = params
	if (goAhead === undefined) return undefined
	if (!params.overlapOk || brief.acceptedOverlaps.length === 0)
		return forbiddenWordRefusal({
			root: brief.repository,
			verb: START_VERB,
			options: [
				{ option: '--by', text: goAhead.by },
				{ option: '--reason', text: goAhead.reason },
			],
		})
	const refusal = overlapGoAheadRefusal({
		root: brief.repository,
		verb: START_VERB,
		...goAhead,
		ids: lotPlanEntryIds({
			planPath: briefPlanPathOf({ brief, briefFile: params.briefFile }),
			branch: brief.branch,
		}),
	})
	if (refusal !== undefined) return refusal
	const overLimit = overlapsOverLimit(startOverlapRecordsOf({ brief, goAhead, now: params.now }))
	return overLimit === undefined
		? undefined
		: START_OVERLAPS_OVER_LIMIT.replace('{message}', () => overLimit)
}

/** The lines a start prints of the overlaps it accepted (`! overlaps <lot>: ...`), its dry run too; none without. */
function startOverlapLinesOf(params: {
	brief: CheckedBrief
	goAhead: StartGoAhead | undefined
	now: Date
}): string[] {
	const { goAhead } = params
	if (goAhead === undefined) return []
	return lotOverlapLines(startOverlapRecordsOf({ ...params, goAhead })).map((line) =>
		START_OVERLAP_LINE.replace('{overlap}', () => line),
	)
}

/**
 * The lines of the overlaps the forecast cleared: `shares <met> with <lot> (forecast clean)`, or, for one the start's
 * `--overlap-ok` accepted all the same, that it was not needed.
 */
function clearedOverlapLinesOf(params: { brief: CheckedBrief }): string[] {
	const { brief } = params
	return brief.clearedOverlaps.map((overlap) =>
		brief.acceptedOverlaps.some((accepted) => accepted.name === overlap.name)
			? fillMessage({ template: START_OVERLAP_NOT_NEEDED_LINE, values: { lot: overlap.name } })
			: fillMessage({
					template: START_SHARES_LINE,
					values: { met: overlapMetText(overlap), lot: overlap.name },
				}),
	)
}

/** The brief's own plan file (its `plan`, beside the brief file); undefined when the brief names none. */
function briefPlanPathOf(params: { brief: CheckedBrief; briefFile: string }): string | undefined {
	const parsed: unknown = JSON.parse(params.brief.briefText)
	const plan = (parsed as { plan?: unknown }).plan
	return typeof plan === 'string' ? resolve(dirname(params.briefFile), plan) : undefined
}

/** The `overlaps.jsonl` records of a start: one per overlap its `--overlap-ok` accepted, with the go-ahead. */
function startOverlapRecordsOf(params: {
	brief: CheckedBrief
	goAhead: StartGoAhead
	now: Date
}): LotOverlapRecord[] {
	return overlapRecordsOf({
		overlaps: params.brief.acceptedOverlaps,
		verb: START_VERB,
		at: params.now.toISOString(),
		by: params.goAhead.by,
		reason: params.goAhead.reason,
	})
}

/**
 * The class a terminal is asked the effort for (D13): only when neither `--effort`, `--json`, `--dry-run` nor the
 * brief names one; undefined otherwise.
 */
export function askedClassOf(prepared: PreparedStart): RiskClass | undefined {
	if (prepared.json || prepared.dryRun) return undefined
	if (prepared.effortFlag !== undefined || prepared.brief.effort !== undefined) return undefined
	return prepared.derivation.class
}

/**
 * The lot's design need at its start (DESIGN-GATE section 1), from the brief before any folder exists: its plan
 * entry's kind, its scope, the shared areas its repository declares.
 */
function startDesignNeedOf(params: { brief: CheckedBrief }): DesignNeed {
	const { brief } = params
	return designNeedOf({
		entryKind:
			brief.planEntry === undefined ? undefined : heldPlanEntryOf(brief.planEntry)?.entry.kind,
		// the base's areas through git, as the risk class reads them, and the main checkout's: no file narrows them
		declaredHigh: [
			...new Set([
				...readBaseDeclaredHigh({ root: brief.repository, base: brief.base.commit }),
				...readDeclaredHigh({ root: brief.repository }),
			]),
		],
		paths: brief.scope,
	})
}

/**
 * The start once its effort is known: refused below the class without `--by` and `--reason`, then the dry run or the
 * start itself.
 */
export function finishStart(params: {
	prepared: PreparedStart
	asked?: BriefEffort
}): CommandResult {
	return withSettledLines({
		result: finishStartChecked(params),
		settle: params.prepared.settle,
		json: params.prepared.json,
	})
}

/** The start past its checks (`finishStart`), before the settled lots are named. */
function finishStartChecked(params: {
	prepared: PreparedStart
	asked?: BriefEffort
}): CommandResult {
	const { prepared } = params
	const { brief, json, derivation } = prepared
	const effort = effortOf({ flag: prepared.effortFlag, brief, asked: params.asked, derivation })
	if (
		prepared.goAhead === undefined &&
		isEffortBelow({ effort: effort.level, riskClass: derivation.class })
	)
		return lotRefusalExit({
			lines: [
				fillMessage({
					template: START_BELOW_REFUSAL,
					values: {
						effort: effort.level,
						class: derivation.class,
						detail: firstDetailOf(derivation),
					},
				}),
			],
			json,
		})
	const riskLines = [
		...riskLinesOf({ effort, derivation, goAhead: prepared.goAhead }),
		designNeedLine(startDesignNeedOf({ brief })),
		...startOverlapLinesOf({ brief, goAhead: prepared.goAhead, now: prepared.now }),
		...clearedOverlapLinesOf({ brief }),
	]
	if (prepared.dryRun)
		return dryRunOutput({
			brief,
			briefPath: prepared.briefPath,
			worktreesFolder: prepared.worktreesFolder,
			simulation: prepared.simulation,
			riskLines: [
				...riskLines,
				...keepLinesOf({ keep: prepared.keep, template: START_KEEP_TEXTS.dryRun }),
				...carryLinesOf({ carry: prepared.carry, template: CARRY_DRY_RUN_LINE }),
			],
			carry: prepared.carry,
			json,
		})
	try {
		return startChecked({
			brief,
			worktreesFolder: prepared.worktreesFolder,
			risk: { effort, derivation, goAhead: prepared.goAhead, lines: riskLines },
			json,
			now: prepared.now,
			seams: prepared.seams,
			simulation: prepared.simulation,
			stack: prepared.stack,
			keep: prepared.keep,
			carry: prepared.carry,
		})
	} catch (error) {
		return thrownOutput({ error, json })
	}
}

/** The line naming a start's keep (`keep: <why>` in a dry run, `kept: <why>` once started); none without a keep. */
function keepLinesOf(params: { keep: KeepLine | undefined; template: string }): string[] {
	return params.keep === undefined
		? []
		: [fillMessage({ template: params.template, values: { reason: params.keep.reason } })]
}

/** The line naming a start's carry (`would carry from ...` in a dry run, `carry from ...` once started); none without. */
function carryLinesOf(params: { carry: CarrySource | undefined; template: string }): string[] {
	const summary = carrySummaryOf(params.carry)
	return summary === undefined
		? []
		: [
				fillMessage({
					template: params.template,
					values: { lot: summary.from, state: summary.state, receipts: String(summary.receipts) },
				}),
			]
}

/** What a start prints and answers of its carry (`--json`'s `carry`); undefined without `--from`. */
function carrySummaryOf(carry: CarrySource | undefined): CarrySummary | undefined {
	return carry === undefined
		? undefined
		: { from: basename(carry.lot), state: carry.state, receipts: carry.receipts }
}

/**
 * The race re-check (33S section 5): `lotFolder`, published, is checked against every open real lot of its store.
 * On an overlap it publishes `failed` (cause `overlap`) on its own lot and returns the name of the lot it overlaps
 * with, the transition stamped `now`; undefined when it may go on.
 */
export function recheckOverlap(params: {
	lotFolder: string
	caseInsensitive: boolean
	/** The overlaps the start's `--overlap-ok` accepted: the re-check refuses any other (`isCoveredOverlap`). */
	accepted?: readonly LotOverlap[]
	now: Date
	/** What waits before the one re-read of a lot only `abandoned.json` marks canceled; blocks the thread by default. */
	pause?: SynchronousPause
}): string | undefined {
	return recheckedFailure(params)?.name
}

/**
 * `recheckOverlap` with the reason it published: the lot overlapped (a damaged one named with its damage, P2.2).
 */
function recheckedFailure(params: {
	lotFolder: string
	caseInsensitive: boolean
	accepted?: readonly LotOverlap[]
	now: Date
	pause?: SynchronousPause
}): { name: string; reason: string } | undefined {
	const store = dirname(params.lotFolder)
	const accepted = params.accepted ?? []
	// a stacked lot's parent is its base, never an overlap (33CI CI4)
	const parent = readStackRecord({ lotFolder: params.lotFolder })?.parent
	const [overlap] = overlappingOpenLots({
		store,
		registry: registryOfCommonFolder(dirname(store)),
		scope: readLotScope({ lotFolder: params.lotFolder }),
		caseInsensitive: params.caseInsensitive,
		except: basename(params.lotFolder),
		pause: params.pause,
	})
		.filter((overlap) => overlap.name !== parent)
		.filter((overlap) => !isCoveredOverlap({ overlap, accepted }))
		// what the forecast clears no longer refuses (33CO 4.7): only a damaged, unreadable or exclusive overlap, or a
		// lot whose work does not read; one still starting has no worktree yet, so no work: it goes on (Q5)
		.filter((overlap) => overlapHoldOf({ overlap, store, now: params.now }) !== undefined)
	if (overlap === undefined) return undefined
	const reason = OVERLAP_REASON.replace('{lot}', overlapLotLabelOf(overlap))
	publishFailure({ lotFolder: params.lotFolder, kind: 'overlap', reason, now: params.now })
	return { name: overlap.name, reason }
}

/**
 * Makes the worktree of a published lot at its recorded base commit, then the `.dialecte/lot` link. A failure
 * publishes `failed` (cause `fail`) on the lot and is returned; nothing is removed.
 */
export function makeLotWorktree(params: {
	lotFolder: string
	now: Date
	seams?: Pick<StartSeams, 'addWorktree' | 'symlink'>
}): LotWorktreeResult {
	const identity = readIdentity({ lotFolder: params.lotFolder })
	if (identity === undefined) throw new Error(`${params.lotFolder} holds no readable identity.json`)
	const make = params.seams?.addWorktree ?? addWorktree
	let failure: string
	// the step's events: in the lot being started (passed in, never found from a folder), once the path is decided
	let recorder: StepHandle | undefined
	try {
		const made = make({
			repository: identity.repository,
			branch: identity.branch,
			from: identity.base.commit,
			index: identity.index,
			now: params.now,
			// the pool gives the lot's own entry first (one its earlier worktree parked)
			owner: identity.name,
			onPlanned: function startWorktreeStep(worktree) {
				recorder = startStep({
					cwd: identity.repository,
					step: 'worktree-add',
					heavy: false,
					place: {
						lot: params.lotFolder,
						worktree: realPathThroughAncestors(worktree),
						throwaway: false,
					},
				})
			},
		})
		// after the worktree exists (D12); the cli never runs `npm ci`
		recorder?.end({
			exit: typeof made === 'string' ? 1 : 0,
			...(typeof made !== 'string' && { parts: worktreeAddPartsOf(made) }),
			stateHash: null,
		})
		if (typeof made !== 'string')
			return linkLotFolder({
				worktree: made.worktree,
				lotFolder: params.lotFolder,
				symlink: params.seams?.symlink ?? symlinkSync,
			})
		failure = made
	} catch (error) {
		recorder?.end({ exit: 1, stateHash: null })
		failure = (error as Error).message
	}
	const reason = branchExists({ root: identity.repository, branch: identity.branch })
		? `${failure}${BRANCH_MADE_SUFFIX.replace('{branch}', identity.branch)}`
		: failure
	publishFailure({ lotFolder: params.lotFolder, kind: 'fail', reason, now: params.now })
	return { failed: reason }
}

/** The parts of a `worktree-add` event: how `node_modules` came (none when a seam made the worktree without one). */
export function worktreeAddPartsOf(made: {
	worktree: string
	nodeModules?: NodeModulesSource
}): WorktreeAddParts {
	return {
		nodeModules:
			made.nodeModules === undefined ? 'none' : NODE_MODULES_WORDS[made.nodeModules.method],
		npmCi: made.nodeModules !== undefined && NPM_RUN_METHODS.includes(made.nodeModules.method),
	}
}

/**
 * Probes a hard link in `folder` (a temporary file linked, then both removed): undefined when the file system
 * makes one, else the reason it refuses.
 */
export function probeHardLinks(params: {
	folder: string
	link?: LinkFunction
}): string | undefined {
	const link = params.link ?? linkSync
	const source = join(params.folder, PROBE_SOURCE.replace('{pid}', String(process.pid)))
	const target = join(params.folder, PROBE_TARGET.replace('{pid}', String(process.pid)))
	try {
		writeFileSync(source, '')
		link(source, target)
		return undefined
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code
		return `${params.folder} makes no hard link${code ? ` (${code})` : ''}: ${(error as Error).message}; the store publishes its records by hard links`
	} finally {
		rmSync(source, { force: true })
		rmSync(target, { force: true })
	}
}

/**
 * The start after the checks: the dead probes' leftovers swept, the probe, the store list, the claim, the lot
 * folder, the re-check, the worktree.
 */
function startChecked(params: {
	brief: CheckedBrief
	worktreesFolder: string
	risk: StartRisk
	json: boolean
	now: Date
	seams: StartSeams
	/** A simulated start: the scenario copied into the lot; no re-check, worktree, branch nor link. */
	simulation: Simulation | undefined
	stack: StartStack | undefined
	/** The first `keep` line, written with the start's records before the publish rename (KEEP 3.4). */
	keep: KeepLine | undefined
	/** `--from <lot>`: the canceled lot whose receipts ride the publish rename (never with a simulation). */
	carry: CarrySource | undefined
}): CommandResult {
	const { brief, now, seams, json, simulation, risk, stack, keep, carry } = params
	const store = locateStore({ from: brief.repository })?.store
	if (store === undefined)
		return errorOutput({ exitCode: 2, message: `${brief.repository} holds no git folder`, json })
	mkdirSync(store, { recursive: true })
	removeDeadLeftovers({
		folder: store,
		pidOf: (name) => temporaryPidOf({ name, finalName: PROBE_NAME }),
		kind: 'files',
	})
	const probe = probeHardLinks({ folder: store, link: seams.link })
	if (probe) return errorOutput({ exitCode: 2, message: probe, json })
	removeStoreLeftovers({ store })
	appendStoreList({ store })
	const index = claimWorktreeIndex({
		worktreesFolder: params.worktreesFolder,
		afterPick: seams.afterClaimPick,
	})
	const name = worktreeFolderName({ index, repository: brief.repository, branch: brief.branch })
	const lotFolder = join(store, name)
	seams.beforePublish?.()
	const published = publishLotFolder({
		store,
		name,
		brief: brief.briefBytes,
		plan: brief.plan.bytes,
		scenario: simulation && recordText(scenarioFileOf(simulation)),
		firstTransition: firstTransitionOf({
			name,
			steps: brief.steps.length,
			now,
			simulated: simulation !== undefined,
		}),
		identity: identityOf({
			brief,
			name,
			index,
			store,
			worktreesFolder: params.worktreesFolder,
			effort: risk.effort,
			now,
			simulation,
		}),
		// a simulated start writes no risk.jsonl, only its keep; a real one's lines ride the publish rename, its keep too
		...(simulation === undefined
			? {
					beforeIdentity: function writeStartRecords(temporary: string) {
						writeStartRecordsTo({ folder: temporary, brief, risk, now, stack, keep, carry })
					},
				}
			: keep !== undefined && {
					beforeIdentity: function writeSimulatedKeep(temporary: string) {
						appendKeepLine({ lotFolder: temporary, line: keep })
					},
				}),
	})
	if (!published)
		return errorOutput({
			exitCode: 1,
			message: `${lotFolder} exists already: the store is damaged, the index ${index} stays claimed`,
			json,
		})
	// a simulated lot holds no lock and no branch: never re-checked, no worktree made
	if (simulation)
		return startedOutput({ name, lotFolder, worktree: null, notes: [], risk, json, keep, carry })
	try {
		return startPublished({ name, lotFolder, brief, now, seams, risk, json, keep, carry })
	} catch (error) {
		// the lot exists from here on: the exit names it
		return thrownOutput({ error, json, lot: name })
	}
}

/** The start of a published real lot: the race re-check, then the worktree and its link. */
function startPublished(params: {
	name: string
	lotFolder: string
	brief: CheckedBrief
	now: Date
	seams: StartSeams
	risk: StartRisk
	json: boolean
	keep: KeepLine | undefined
	carry: CarrySource | undefined
}): CommandResult {
	const { name, lotFolder, brief, now, seams, json, risk, keep, carry } = params
	const overlap = recheckedFailure({
		lotFolder,
		caseInsensitive: brief.caseInsensitive,
		accepted: brief.acceptedOverlaps,
		now,
		pause: seams.pause,
	})
	if (overlap) return failedOutput({ name, lotFolder, reason: overlap.reason, json })
	const made = makeLotWorktree({ lotFolder, now, seams })
	if ('failed' in made) return failedOutput({ name, lotFolder, reason: made.failed, json })
	return startedOutput({
		name,
		lotFolder,
		worktree: made.worktree,
		notes: [
			...('linkRefused' in made ? [made.linkRefused] : []),
			...recordStartForecast({ lotFolder, now }),
		],
		risk,
		json,
		keep,
		carry,
	})
}

/**
 * The new lot's own forecast (trigger `start`), recorded in its folder so its card reads a pair with every open lot from
 * the start; a run that cannot be had or written is a note, never a failure of the start.
 */
function recordStartForecast(params: { lotFolder: string; now: Date }): string[] {
	const { now } = params
	const run = forecastLot({ lotFolder: params.lotFolder, trigger: 'start', now: () => now })
	if ('refusal' in run) return [run.refusal]
	return recordForecastRun({ lotFolder: params.lotFolder, run, trigger: 'start' }).notes
}

/**
 * Makes `<worktree>/.dialecte/lot`, a link to the lot folder. A link that cannot be made does not fail the lot (its
 * worktree exists): the reason is returned, and `status` reports the link missing.
 */
function linkLotFolder(params: {
	worktree: string
	lotFolder: string
	symlink: SymlinkFunction
}): LotWorktreeResult {
	const link = join(params.worktree, ...LOT_LINK_SEGMENTS)
	try {
		mkdirSync(dirname(link), { recursive: true })
		params.symlink(params.lotFolder, link)
		return { worktree: params.worktree, link }
	} catch (error) {
		return {
			worktree: params.worktree,
			linkRefused: LINK_REFUSED_NOTE.replace('{link}', link).replace(
				'{reason}',
				(error as Error).message,
			),
		}
	}
}

/**
 * An exit before any lot exists (or a step that broke): the message, and no next command; once the lot folder
 * exists, the lot it happened to (`lot` in the JSON, `lot start: <lot>: <message>` as text).
 */
function errorOutput(params: {
	exitCode: number
	message: string
	json: boolean
	lot?: string
}): CommandResult {
	const { lot } = params
	return {
		exitCode: params.exitCode,
		output: params.json
			? jsonOf({ error: params.message, ...(lot !== undefined && { lot }), next: null }, 2)
			: textOf([`lot start: ${lot === undefined ? '' : `${lot}: `}${params.message}`]),
	}
}

/** The exit of an error thrown during a start: exit 2 for a store refusal, else 1; the lot when it exists. */
function thrownOutput(params: { error: unknown; json: boolean; lot?: string }): CommandResult {
	const error = params.error as Error
	return errorOutput({
		exitCode: error.name === STORE_REFUSAL ? 2 : 1,
		message: error.message,
		json: params.json,
		lot: params.lot,
	})
}

/** A lot published then failed: its name, folder, the reason, and the stop line. */
function failedOutput(params: {
	name: string
	lotFolder: string
	reason: string
	json: boolean
}): CommandResult {
	const next = failedNextOf(params.name)
	if (params.json)
		return {
			exitCode: 1,
			output: jsonOf(
				{
					lot: params.name,
					folder: params.lotFolder,
					state: 'failed',
					reason: params.reason,
					next,
				},
				2,
			),
		}
	return resultOf({
		exitCode: 1,
		lines: [
			`${params.name} failed: ${params.reason}`,
			`folder: ${params.lotFolder}`,
			`next: ${next}`,
		],
	})
}

/** `--effort`, else the brief's, else the terminal's answer, else the effort of the scope's class; with where it came from. */
function effortOf(params: {
	flag: BriefEffort | undefined
	brief: CheckedBrief
	asked: BriefEffort | undefined
	derivation: RiskDerivation
}): StartEffort {
	if (params.flag) return { level: params.flag, source: 'flag' }
	if (params.brief.effort) return { level: params.brief.effort, source: 'brief' }
	if (params.asked) return { level: params.asked, source: 'asked' }
	return { level: effortOfClass({ riskClass: params.derivation.class }), source: 'risk' }
}

/** `--by` and `--reason`: both or neither, each one non-empty line; the usage reason otherwise. */
function goAheadOf(params: {
	by: string | undefined
	reason: string | undefined
}): StartGoAhead | undefined | string {
	const { by, reason } = params
	if (by === undefined && reason === undefined) return undefined
	if (by === undefined || reason === undefined)
		return fillMessage({
			template: START_USAGE_REASONS.goAheadHalf,
			values: { option: by === undefined ? '--reason' : '--by' },
		})
	if (!isOneLine(by))
		return fillMessage({ template: START_USAGE_REASONS.goAheadLine, values: { option: '--by' } })
	if (!isOneLine(reason))
		return fillMessage({
			template: START_USAGE_REASONS.goAheadLine,
			values: { option: '--reason' },
		})
	return { by, reason }
}

/** The first reason's detail of a class, or the words of a class without one. */
function firstDetailOf(derivation: RiskDerivation): string {
	return derivation.reasons[0]?.detail ?? NO_DECLARED_PATH
}

/** The lines a start prints for its effort: the effort line, then the `!` line of an effort below the class. */
function riskLinesOf(params: {
	effort: StartEffort
	derivation: RiskDerivation
	goAhead: StartGoAhead | undefined
}): string[] {
	const { effort, derivation, goAhead } = params
	const effortLine = fillMessage({
		template: START_EFFORT_LINE,
		values: {
			effort: effort.level,
			source: effort.source,
			class: derivation.class,
			detail: firstDetailOf(derivation),
		},
	})
	if (
		goAhead === undefined ||
		!isEffortBelow({ effort: effort.level, riskClass: derivation.class })
	)
		return [effortLine]
	return [
		effortLine,
		fillMessage({
			template: RISK_EFFORT_BELOW_LINE,
			values: {
				effort: effort.level,
				class: derivation.class,
				goAhead: fillMessage({ template: RISK_GO_AHEAD_PART, values: goAhead }),
			},
		}),
	]
}

/**
 * The records a real start publishes with its folder: its risk lines, accepted overlaps, plan entry and stack, and the
 * first line of its keep when given (KEEP 3.4).
 *
 * @internal
 */
export function writeStartRecordsTo(params: {
	folder: string
	brief: CheckedBrief
	risk: StartRisk
	now: Date
	stack: StartStack | undefined
	/** The first `keep` line of a start with `--keep` or a brief `keep`. */
	keep?: KeepLine
	/** `--from <lot>`: `carry.json` and the copies of the source's ledger and lot file. */
	carry?: CarrySource
}): void {
	const { folder, brief, risk, now, stack } = params
	writeStartRiskLines({ folder, risk, now })
	// the lot is never visible without its keep: the line rides the publish rename with the risk lines
	if (params.keep !== undefined) appendKeepLine({ lotFolder: folder, line: params.keep })
	writeStartOverlaps({ folder, brief, goAhead: risk.goAhead, now })
	if (brief.planEntry !== undefined) writePlanEntry({ folder, entry: brief.planEntry })
	// the base's shared areas, where the views read them without git (DESIGN-GATE)
	recordBaseDeclared({ lotFolder: folder, root: brief.repository, ref: brief.base.commit })
	if (stack !== undefined)
		writeStack({
			lotFolder: folder,
			record: { schema: STACK_SCHEMA, parent: stack.parent },
		})
	if (params.carry !== undefined) writeCarryRecords({ folder, carry: params.carry, now })
}

/**
 * `carry.json` and `carry/ledger.json` (`carry/lot.json` when the source has a lot file), the bytes as the check read
 * them: `tdd red` reads only these copies, checked against the sha256 recorded beside them (FIX-receipt-carry-over D2).
 */
function writeCarryRecords(params: { folder: string; carry: CarrySource; now: Date }): void {
	const { folder, carry } = params
	const copies = join(folder, STORE_FILES.carryCopies)
	mkdirSync(copies, { recursive: true })
	writeFileSync(join(copies, CARRY_LEDGER_COPY_NAME), carry.ledger.bytes)
	if (carry.declaration !== undefined)
		writeFileSync(join(copies, CARRY_DECLARATION_COPY_NAME), carry.declaration.bytes)
	const record: CarryFile = {
		schema: CARRY_SCHEMA,
		from: basename(carry.lot),
		state: carry.state,
		at: params.now.toISOString(),
		ledger: carry.ledger.hash,
		...(carry.declaration !== undefined && { declaration: carry.declaration.hash }),
		receipts: carry.receipts,
	}
	writeFileSync(join(folder, STORE_FILES.carry), recordText(record))
}

/**
 * The `overlaps.jsonl` lines of a real start: one per open lot its `--overlap-ok` accepted, with the go-ahead's who and
 * why (the usage refuses the flag without one); none when it accepted none.
 */
function writeStartOverlaps(params: {
	folder: string
	brief: CheckedBrief
	goAhead: StartGoAhead | undefined
	now: Date
}): void {
	const { brief, goAhead } = params
	if (brief.acceptedOverlaps.length === 0 || goAhead === undefined) return
	appendLotOverlaps({
		lotFolder: params.folder,
		records: startOverlapRecordsOf({ brief, goAhead, now: params.now }),
	})
}

/** The `risk.jsonl` lines of a real start: the effort line of a go-ahead, then the derived line (from `start`). */
function writeStartRiskLines(params: { folder: string; risk: StartRisk; now: Date }): void {
	const { folder, risk } = params
	const at = params.now.toISOString()
	if (risk.goAhead !== undefined)
		appendRiskLine({
			folder,
			line: {
				schema: RISK_SCHEMA,
				kind: 'effort',
				at,
				effort: risk.effort.level,
				by: risk.goAhead.by,
				reason: risk.goAhead.reason,
			},
		})
	appendRiskLine({
		folder,
		line: {
			schema: RISK_SCHEMA,
			kind: 'derived',
			at,
			class: risk.derivation.class,
			reasons: risk.derivation.reasons,
			from: 'start',
		},
	})
}

/** Transition 1 (D4): working, step 0 (no station has run) of the brief's steps, cause start. */
function firstTransitionOf(params: {
	name: string
	steps: number
	now: Date
	simulated: boolean
}): Transition {
	return {
		seq: 1,
		at: params.now.toISOString(),
		lot: params.name,
		state: 'working',
		position: { step: 0, of: params.steps, station: null, round: null },
		cause: { kind: 'start', by: ENGINE, reason: START_REASON },
		question: null,
		simulated: params.simulated,
	}
}

/**
 * The scenario `--simulate <name>` names in the table (the built-in one unless a seam gives another), or why it is
 * refused: an unknown name, the names listed.
 */
function simulationOf(params: { scenarioName: string; seams: StartSeams }): Simulation | string {
	const table = params.seams.scenarios ?? SCENARIOS
	const { scenarioName } = params
	if (!Object.hasOwn(table, scenarioName))
		return `no scenario ${scenarioName}: --simulate takes one of ${Object.keys(table).sort().join(', ')}`
	return { name: scenarioName, steps: table[scenarioName] }
}

/** `scenario.json`: the scenario's steps as the table holds them, so `wait` plays the lot's own copy. */
function scenarioFileOf(simulation: Simulation): ScenarioFile {
	return { schema: SCENARIO_SCHEMA, name: simulation.name, steps: simulation.steps }
}

/** `identity.json` (D3): real paths, the base as given and its commit, both hashes, the cli version. */
function identityOf(params: {
	brief: CheckedBrief
	name: string
	index: string
	store: string
	worktreesFolder: string
	effort: StartEffort
	now: Date
	simulation: Simulation | undefined
}): LotIdentity {
	const { brief, simulation } = params
	return {
		schema: IDENTITY_SCHEMA,
		name: params.name,
		index: params.index,
		repository: brief.repository,
		store: params.store,
		worktree: simulation ? null : join(params.worktreesFolder, params.name),
		branch: brief.branch,
		base: brief.base,
		feature: brief.feature,
		effort: params.effort,
		simulated: simulation !== undefined,
		scenario: simulation?.name ?? null,
		// a real lot holds no such key: it was refused for what a simulated one records here
		...(simulation ? { wouldRefuse: brief.wouldRefuse } : {}),
		cli: readCliVersion(),
		briefHash: brief.briefHash,
		planHash: brief.plan.hash,
		created: params.now.toISOString(),
	}
}

/** Publishes `failed` on the lot, its position repeating the last transition's. */
function publishFailure(params: {
	lotFolder: string
	kind: TransitionCauseKind
	reason: string
	now: Date
}): void {
	appendTransition({
		lotFolder: params.lotFolder,
		next: function failed({ last }) {
			return {
				at: params.now.toISOString(),
				// the folder's name is the lot's name (the folder rule): never a stray name a record carries
				lot: basename(params.lotFolder),
				state: 'failed',
				position: last?.position ?? { step: 0, of: 0, station: null, round: null },
				cause: { kind: params.kind, by: ENGINE, reason: params.reason },
				question: null,
				simulated: last?.simulated ?? false,
			}
		},
	})
}

/** A refused brief: `{ refused, next: null }` with `--json`, else one line per refusal `<field>: <rule> - <detail>`. */
function refusedOutput(params: { refused: readonly Refusal[]; json: boolean }): CommandResult {
	return {
		exitCode: 2,
		output: params.json
			? jsonOf({ refused: params.refused, next: null }, 2)
			: textOf(params.refused.map(refusalLineOf)),
	}
}

/** A finding of the brief checks as a line: `<field>: <rule> - <detail>`. */
function refusalLineOf(refusal: Refusal): string {
	return `${refusal.field}: ${refusal.rule} - ${refusal.detail}`
}

/**
 * `--dry-run`: the lot the next index would name and the start to run next (the brief path as given); nothing
 * written or claimed. A real dry run: the checks passed, its worktree, the real start. A simulated one (G6): the
 * findings a real start would refuse for (`wouldRefuse`), no worktree, the same simulated start.
 */
function dryRunOutput(params: {
	brief: CheckedBrief
	/** The brief path as the command was given it. */
	briefPath: string
	worktreesFolder: string
	simulation: Simulation | undefined
	/** The effort line a start would print (D13). */
	riskLines: string[]
	/** `--from <lot>`: what the start would carry (`carry` in the JSON). */
	carry: CarrySource | undefined
	json: boolean
}): CommandResult {
	const { brief, simulation } = params
	const carry = carrySummaryOf(params.carry)
	const lot = worktreeFolderName({
		index: nextWorktreeIndex({ worktreesFolder: params.worktreesFolder }),
		repository: brief.repository,
		branch: brief.branch,
	})
	const lotLine = `lot: ${lot} (<next index>-${basename(brief.repository)}-${brief.branch.split('/').at(-1)}; no index claimed)`
	if (simulation !== undefined) {
		const next = simulatedStartNextOf({ briefPath: params.briefPath, scenario: simulation.name })
		const { wouldRefuse } = brief
		if (params.json)
			return {
				exitCode: 0,
				output: jsonOf({ dryRun: true, lot, worktree: null, wouldRefuse, next }, 2),
			}
		return resultOf({
			exitCode: 0,
			lines: [
				...(wouldRefuse.length === 0
					? ['checks: every check passed']
					: [
							`checks: ${wouldRefuse.length} a real start would refuse for (wouldRefuse)`,
							...wouldRefuse.map(refusalLineOf),
						]),
				lotLine,
				'worktree: none (simulated)',
				...params.riskLines,
				`next: ${next}`,
			],
		})
	}
	const worktree = join(params.worktreesFolder, lot)
	const next = startNextOf(params.briefPath)
	if (params.json)
		return {
			exitCode: 0,
			output: jsonOf(
				{ dryRun: true, lot, worktree, ...(carry !== undefined && { carry }), next },
				2,
			),
		}
	return resultOf({
		exitCode: 0,
		lines: [
			'checks: every check passed',
			lotLine,
			`worktree: ${worktree}`,
			...params.riskLines,
			`next: ${next}`,
		],
	})
}

/**
 * A lot started: its name, folder, worktree, runner and next; the notes of what was not made (the link). A
 * simulated lot (no worktree): runner simulated, next the wait line.
 */
function startedOutput(params: {
	name: string
	lotFolder: string
	worktree: string | null
	notes: string[]
	risk: StartRisk
	json: boolean
	/** The keep the start wrote: `kept: <why>` in its lines and its JSON. */
	keep: KeepLine | undefined
	/** The carry the start wrote: its line and `carry` in its JSON. */
	carry: CarrySource | undefined
}): CommandResult {
	const { risk, worktree, keep } = params
	const carry = carrySummaryOf(params.carry)
	// a simulated lot has no worktree: it waits; a real one runs its stations, landing as its repository's flow says
	const { runner, next } =
		worktree === null
			? { runner: RUNNERS.simulated, next: waitNextOf({ name: params.name, simulated: true }) }
			: { runner: RUNNERS.manual, next: manualNextOf({ name: params.name, root: worktree }) }
	if (params.json)
		return {
			exitCode: 0,
			output: jsonOf(
				{
					lot: params.name,
					folder: params.lotFolder,
					worktree,
					runner,
					effort: risk.effort,
					riskClass: risk.derivation,
					notes: params.notes,
					...(keep !== undefined && { kept: keep.reason }),
					...(carry !== undefined && { carry }),
					next,
				},
				2,
			),
		}
	return resultOf({
		exitCode: 0,
		lines: [
			`${params.name} started`,
			`folder: ${params.lotFolder}`,
			`worktree: ${worktree ?? 'none (simulated)'}`,
			`runner: ${runner}`,
			...keepLinesOf({ keep, template: START_KEEP_TEXTS.started }),
			...carryLinesOf({ carry: params.carry, template: CARRY_START_LINE }),
			...risk.lines,
			...params.notes.map((note) => `note: ${note}`),
			`next: ${next}`,
		],
	})
}
