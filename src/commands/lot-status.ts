/**
 * `dialecte lot status <id> [--json]`: the lot's state derived from the records; reads files only, writes nothing,
 * starts no process (nothing this module reaches imports a child process).
 */
import { lstatSync, readlinkSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { isFolder, realPathOf } from '../lib/file-system.ts'
import { readStoreEntries } from '../lib/handover/handover-store-read.ts'
import { JSON_FLAG } from '../lib/parse-invocation.constants.ts'
import { jsonOf, textOf } from '../lib/print/print.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { lotDamagedExit, lotRefusalExit, lotUsageExit } from '../lib/store/lot-exits.ts'
import { nextCommandsOf } from '../lib/store/lot-next.ts'
import {
	readCheckedLotState,
	readLotStateInput,
	registryOfLotFolder,
} from '../lib/store/lot-records.ts'
import { lotState } from '../lib/store/lot-state.ts'
import { noLotRefusal, requiredLotOf } from '../lib/store/resolve-lot.ts'
import { LOT_LINK_SEGMENTS, RUNNERS } from '../lib/store/store.constants.ts'
import { STATUS_FLAGS, STATUS_MAX_LINES, STATUS_USAGE_REASONS } from './lot-status.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { StoreEntry } from '../lib/handover/handover.types.ts'
import type {
	LinkCheck,
	LotIdentity,
	LotStateInput,
	LotStateReport,
	WorktreeCheck,
} from '../lib/store/store.types.ts'
import type { LotStatusJson } from './lot-status.types.ts'

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
 * were read with. Reads the worktree and its link only.
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
	const { next, also } = nextCommandsOf({ input, report })
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
		effort: identity.effort,
		simulated: identity.simulated,
		scenario: identity.scenario,
		checks: checksOf({ identity, lotFolder }),
		notes: otherFolderNotes(params),
		next,
		also,
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
 * The text form of a status, five lines at most: the state line, the position, the open questions, the checks
 * when not all present, next and also.
 */
export function lotStatusLines(status: LotStatusJson): string[] {
	const { station } = status.position ?? {}
	const position = status.position
		? `step ${status.position.step} of ${status.position.of}${station ? `, ${station}` : ''}${status.position.round === null ? '' : `, round ${status.position.round}`}`
		: undefined
	const [first] = status.questions
	const missing = checksText(status.checks)
	const rest = [
		first ? `questions: ${status.questions.length} open, ${first.id}: ${first.text}` : undefined,
		missing ? `checks: ${missing}` : undefined,
		status.next === null ? undefined : `next: ${status.next}`,
		status.also.length > 0 ? `also: ${status.also.join(' | ')}` : undefined,
	].filter((line): line is string => line !== undefined)
	const state = `${status.lot} ${status.state} since ${status.since}${status.limit ? ' (limit: run again)' : ''}`
	// the position is the line given up when every other one is needed
	const withPosition = position && rest.length + 2 <= STATUS_MAX_LINES ? [position] : []
	return [state, ...withPosition, ...rest]
}

/** The checks that are not `present`, as `worktree missing, link dangling`; empty when all are. */
function checksText(checks: LotStatusJson['checks']): string {
	if (checks.worktree === 'missing') return 'worktree missing'
	if (checks.link === null || checks.link === 'present') return ''
	return `link ${checks.link}`
}
