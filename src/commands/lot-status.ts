/**
 * `dialecte lot status <id> [--json]`: the lot's state derived from the records; reads files only, writes nothing,
 * starts no process (nothing this module reaches imports a child process).
 */
import { lstatSync, readlinkSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { isFolder, realPathOf } from '../lib/file-system.ts'
import { readStoreEntries } from '../lib/handover/handover-store-read.ts'
import { fillMessage } from '../lib/knowledge/standard/fill-message.ts'
import { JSON_FLAG } from '../lib/parse-invocation.constants.ts'
import { jsonOf, textOf } from '../lib/print/print.ts'
import { independentLedgerRounds, readReviewLedger } from '../lib/review-rounds/ledger-rounds.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { snapshotRounds } from '../lib/review-rounds/round-names.ts'
import { goAheadText } from '../lib/risk/risk-reason.ts'
import { riskCapOf, riskStandingOf } from '../lib/risk/risk-records.ts'
import { RISK_EFFORT_BELOW_LINE, RISK_LINE_SOURCE } from '../lib/risk/risk.constants.ts'
import { lotDamagedExit, lotRefusalExit, lotUsageExit } from '../lib/store/lot-exits.ts'
import { nextCommandsOf } from '../lib/store/lot-next.ts'
import {
	readBriefStepCount,
	readCheckedLotState,
	readLotStateInput,
	registryOfLotFolder,
} from '../lib/store/lot-records.ts'
import { lotState } from '../lib/store/lot-state.ts'
import { noLotRefusal, requiredLotOf } from '../lib/store/resolve-lot.ts'
import { readBeyondCapRows, readStationNext } from '../lib/store/station-records.ts'
import { LOT_LINK_SEGMENTS, RUNNERS } from '../lib/store/store.constants.ts'
import {
	CHECK_WORDS,
	STATION_LINE,
	STATION_WHAT,
	STATUS_FLAGS,
	STATUS_MAX_LINES,
	STATUS_USAGE_REASONS,
} from './lot-status.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { StoreEntry } from '../lib/handover/handover.types.ts'
import type {
	LinkCheck,
	LotIdentity,
	LotStateInput,
	LotStateReport,
	WorktreeCheck,
} from '../lib/store/store.types.ts'
import type { LotStatusEffort, LotStatusJson, RoundsStatus } from './lot-status.types.ts'

/**
 * The status of the lot `<id>` names, as text or `--json`; a damaged lot answers `damaged` with its reason and the
 * stop to run (exit 6); a usage error or a refusal exits 2 (JSON with `next: null` under `--json`).
 */
export function lotStatus(params: {
	cwd: string
	/** The words after the verb: `<id>` and the options. */
	argv: string[]
}): CommandResult {
	const read = readArguments({ argv: params.argv, valueOptions: [], flags: STATUS_FLAGS })
	if (typeof read === 'string')
		return lotUsageExit({ reason: read, json: params.argv.includes(JSON_FLAG) })
	const json = read.flags.has('json')
	const [id, ...extra] = read.words
	if (id === undefined) return lotUsageExit({ reason: STATUS_USAGE_REASONS.noId, json })
	if (extra.length > 0)
		return lotUsageExit({
			reason: STATUS_USAGE_REASONS.extra.replace('{extra}', extra.join(' ')),
			json,
		})
	const required = requiredLotOf({ argument: id, cwd: params.cwd, mode: 'read' })
	if ('exitCode' in required) return lotRefusalExit({ lines: required.lines, json })
	const lotFolder = required.lot
	const registry = registryOfLotFolder(lotFolder)
	const entries = readStoreEntries(registry)
	const checked = readCheckedLotState({ lotFolder, registry, entries })
	if (checked === undefined) return lotRefusalExit({ lines: [noLotRefusal(id)], json })
	if ('damage' in checked) return lotDamagedExit({ lotFolder, damage: checked.damage, json })
	const status = lotStatusOfInput({ input: checked.input, lotFolder, entries })
	return { exitCode: 0, output: json ? jsonOf(status, 2) : textOf(lotStatusLines(status)) }
}

/**
 * The status JSON of the lot folder (33S section 7, D17), read from its records; undefined when it holds no
 * readable identity. Reads files only.
 */
export function lotStatusOf(params: {
	lotFolder: string
	/** The registry's entries, read once by a reader of many lots; read here when left out. */
	entries?: readonly StoreEntry[]
}): LotStatusJson | undefined {
	const { lotFolder } = params
	const registry = registryOfLotFolder(lotFolder)
	const entries = params.entries ?? readStoreEntries(registry)
	const input = readLotStateInput({ lotFolder, registry, entries })
	return input && lotStatusOfInput({ input, lotFolder, entries })
}

/**
 * The status JSON of a lot (33S section 7, D17) from its records already read, with the registry's entries they
 * were read with: the next station from the lot folder's and the worktree's records (33L1 section 4). Reads files
 * only.
 */
export function lotStatusOfInput(params: {
	input: LotStateInput
	lotFolder: string
	entries: readonly StoreEntry[]
}): LotStatusJson {
	const { input, lotFolder } = params
	const { identity } = input
	const report = lotState(input)
	const last = input.transitions.at(-1)
	const station = readStationNext({ input, lotFolder })
	const { next, also } = nextCommandsOf({ input, report, station })
	return {
		lot: identity.name,
		index: identity.index,
		feature: identity.feature,
		repository: identity.repository,
		branch: identity.branch,
		base: identity.base,
		worktree: identity.worktree,
		folder: lotFolder,
		state: report.state,
		since: report.since,
		limit: report.limit,
		runner: identity.simulated ? RUNNERS.simulated : RUNNERS.manual,
		position: last?.position ?? null,
		questions: questionsOf({ input, report }),
		answered: input.answers.length,
		handover: input.registryEntry
			? { name: input.registryEntry.name, state: input.registryEntry.state }
			: null,
		effort: effortStatusOf({ identity, lotFolder }),
		simulated: identity.simulated,
		scenario: identity.scenario,
		checks: checksOf({ identity, lotFolder }),
		notes: otherFolderNotes(params),
		next,
		also,
		station: station?.next ?? null,
		rounds: roundsOf({ input, lotFolder }),
	}
}

/**
 * The effort block of a lot's status (33L1 D25): the effective effort and where it came from (`risk-line` for an
 * effort line, else the identity's source), the last derived line's class and whether the effort is below it; null
 * when no effort is recorded.
 */
function effortStatusOf(params: {
	identity: LotIdentity
	lotFolder: string
}): LotStatusEffort | null {
	const standing = riskStandingOf({ folder: params.lotFolder })
	if (standing.effort === undefined) return null
	const { derived } = standing
	return {
		level: standing.effort,
		source: standing.effortLine === undefined ? params.identity.effort.source : RISK_LINE_SOURCE,
		riskClass:
			derived === undefined
				? null
				: { class: derived.class, at: derived.at, reasons: derived.reasons },
		below: standing.below,
	}
}

/**
 * The rounds block of a lot's status: the snapshots, the effort the cap is taken from (D2) and that cap, the brief's
 * step count, the beyond-cap rows with their author and reason, the distinct ledger rounds above the last snapshot
 * (33L1 section 6).
 */
function roundsOf(params: { input: LotStateInput; lotFolder: string }): RoundsStatus {
	const { lotFolder } = params
	const snapshots = snapshotRounds(lotFolder)
	const { cap, effort } = riskCapOf({ folder: lotFolder })
	return {
		review: snapshots.length,
		cap: effort === undefined ? null : cap,
		effort: effort ?? null,
		steps: readBriefStepCount({ lotFolder }),
		beyondCap: readBeyondCapRows({ lotFolder }),
		independent: independentLedgerRounds({
			ledger: readReviewLedger({ folder: lotFolder }),
			lastRound: Math.max(0, ...snapshots),
		}).length,
	}
}

/** The open questions with the time their transition asked them. */
function questionsOf(params: {
	input: LotStateInput
	report: LotStateReport
}): LotStatusJson['questions'] {
	return params.report.openQuestions.map((question) => ({
		...question,
		asked:
			params.input.transitions.find((transition) => transition.question?.id === question.id)?.at ??
			'',
	}))
}

/**
 * The worktree and its link as they are on disk; null for a simulated lot (no worktree), which carries instead the
 * findings its start recorded (`wouldRefuse`); a real lot refuses at its start, so it holds none.
 */
function checksOf(params: { identity: LotIdentity; lotFolder: string }): LotStatusJson['checks'] {
	const { identity } = params
	if (identity.worktree === null)
		return { worktree: null, link: null, wouldRefuse: identity.wouldRefuse ?? [] }
	const worktree: WorktreeCheck = isFolder(identity.worktree) ? 'present' : 'missing'
	return {
		worktree,
		link: linkCheckOf({
			link: join(identity.worktree, ...LOT_LINK_SEGMENTS),
			lotFolder: params.lotFolder,
		}),
		wouldRefuse: [],
	}
}

function linkCheckOf(params: { link: string; lotFolder: string }): LinkCheck {
	try {
		if (!lstatSync(params.link).isSymbolicLink()) return 'wrong'
	} catch {
		return 'missing'
	}
	let target: string
	try {
		target = realpathSync(params.link)
	} catch {
		return 'dangling'
	}
	return target === params.lotFolder ||
		resolve(dirname(params.link), readlinkSync(params.link)) === params.lotFolder
		? 'present'
		: 'wrong'
}

/**
 * A note per registry entry holding the lot's worktree and branch in another folder: a hand-over written without
 * `--out <full name>`, which the lot does not see.
 */
function otherFolderNotes(params: {
	input: LotStateInput
	lotFolder: string
	entries: readonly StoreEntry[]
}): string[] {
	const { identity } = params.input
	if (identity.worktree === null) return []
	const worktree = realPathOf(identity.worktree)
	const lotFolder = realPathOf(params.lotFolder)
	return params.entries
		.filter(
			(entry) =>
				entry.branch === identity.branch &&
				realPathOf(entry.worktree) === worktree &&
				realPathOf(entry.folder) !== lotFolder,
		)
		.map(
			(entry) =>
				`the hand-over ${entry.name} holds this lot's worktree and branch in ${entry.folder}: the lot sees no hand-over until one is written with --out ${identity.name}`,
		)
}

/**
 * The text form of a status, five lines at most: the state line, the next station (33L1 D20.2-3), the position, the
 * open questions, the checks when not all present, next and also.
 */
export function lotStatusLines(status: LotStatusJson): string[] {
	const { station } = status.position ?? {}
	const position = status.position
		? `step ${status.position.step} of ${status.position.of}${station ? `, ${station}` : ''}${status.position.round === null ? '' : `, round ${status.position.round}`}`
		: undefined
	const [first] = status.questions
	const missing = checksText(status.checks)
	const rest = [
		belowLineOf(status),
		first ? `questions: ${status.questions.length} open, ${first.id}: ${first.text}` : undefined,
		missing ? `checks: ${missing}` : undefined,
		status.next === null ? undefined : `next: ${status.next}`,
		status.also.length > 0 ? `also: ${status.also.join(' | ')}` : undefined,
	].filter((line): line is string => line !== undefined)
	const state = `${status.lot} ${status.state} since ${status.since}${status.limit ? ' (limit: run again)' : ''}`
	const stationLine = stationLineOf(status)
	const head = stationLine === undefined ? [state] : [state, stationLine]
	// the position is the line given up when every other one is needed
	const withPosition =
		position && head.length + rest.length + 1 <= STATUS_MAX_LINES ? [position] : []
	return [...head, ...withPosition, ...rest]
}

/**
 * The station line: `station <what> · round <r|->/<cap|-> · effort <level|->`; none for a simulated lot and a walk
 * that names nothing (`none`). The effort and the step count are the JSON's rounds block (33L1 D13, D2; R1-13).
 */
function stationLineOf(status: LotStatusJson): string | undefined {
	const { station } = status
	if (station === null || station.kind === 'none') return undefined
	const what = stationWhatOf({ status, station })
	return fillMessage({
		template: STATION_LINE.line,
		values: {
			what,
			round: station.round === null ? STATION_LINE.none : String(station.round),
			cap: status.rounds.cap === null ? STATION_LINE.none : String(status.rounds.cap),
			effort: status.rounds.effort ?? STATION_LINE.none,
		},
	})
}

/** What the station line names (33L1 D20.2): the station, the check, the snapshot, the question, the answer. */
function stationWhatOf(params: {
	status: LotStatusJson
	station: NonNullable<LotStatusJson['station']>
}): string {
	const { status, station } = params
	const template =
		station.kind === 'station' ? stationTemplateOf(station) : STATION_WHAT[station.kind]
	return fillMessage({
		template,
		values: {
			station: station.station ?? STATION_LINE.none,
			step: String(station.step),
			of: String(status.rounds.steps),
			round: String(station.round),
			why: station.why,
			check: station.check === null ? STATION_LINE.none : CHECK_WORDS[station.check],
			question: status.questions[0]?.id ?? STATION_LINE.none,
		},
	})
}

/** A station to run: with its step and the brief's step count, with its round, or alone. */
function stationTemplateOf(station: NonNullable<LotStatusJson['station']>): string {
	if (station.step !== null) return STATION_LINE.stationStep
	return station.round === null ? STATION_LINE.station : STATION_LINE.stationRound
}

/**
 * The line of an effort below its risk class, naming the class it is held to (the highest of the last derived class and
 * the effort line's, read from the lot folder: the JSON's `riskClass` is the derived line alone) and its go-ahead
 * (D30); undefined when it is not below.
 */
function belowLineOf(status: LotStatusJson): string | undefined {
	const { effort } = status
	if (effort === null || !effort.below) return undefined
	const { comparedClass, effortLine } = riskStandingOf({ folder: status.folder })
	if (comparedClass === undefined) return undefined
	return fillMessage({
		template: RISK_EFFORT_BELOW_LINE,
		values: { effort: effort.level, class: comparedClass, goAhead: goAheadText({ effortLine }) },
	})
}

/** The checks that are not `present`, as `worktree missing, link dangling`; empty when all are. */
function checksText(checks: LotStatusJson['checks']): string {
	if (checks.worktree === 'missing') return 'worktree missing'
	if (checks.link === null || checks.link === 'present') return ''
	return `link ${checks.link}`
}
