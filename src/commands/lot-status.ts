/**
 * `dialecte lot status <id> [--json]`: the lot's state derived from the records; reads files only, writes nothing,
 * starts no process (nothing this module reaches imports a child process).
 */
import { lstatSync, readlinkSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { renderLotUsage } from '../lib/command-map/render-help.ts'
import { isFolder, realPathOf } from '../lib/file-system.ts'
import { readStoreEntries } from '../lib/handover/handover-store-read.ts'
import { HANDOVER_STORE_FOLDER } from '../lib/handover/handover.constants.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { nextCommandsOf } from '../lib/store/lot-next.ts'
import { readLotStateInput } from '../lib/store/lot-records.ts'
import { lotState } from '../lib/store/lot-state.ts'
import { requireLot } from '../lib/store/resolve-lot.ts'
import { LOT_LINK_SEGMENTS, RUNNERS } from '../lib/store/store.constants.ts'
import { STATUS_FLAGS, STATUS_MAX_LINES } from './lot-status.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type {
	LinkCheck,
	LotStateInput,
	LotStateReport,
	WorktreeCheck,
} from '../lib/store/store.types.ts'
import type { LotStatusJson } from './lot-status.types.ts'

export function lotStatus(params: {
	cwd: string
	/** The words after the verb: `<id>` and the options. */
	argv: string[]
}): CommandResult {
	const read = readArguments({ argv: params.argv, valueOptions: [], flags: STATUS_FLAGS })
	if (typeof read === 'string' || read.words.length !== 1)
		return { exitCode: 2, output: renderLotUsage() }
	const required = requireLot({ argument: read.words[0], cwd: params.cwd, mode: 'read' })
	if ('exitCode' in required) return required
	const lotFolder = required.lot
	const registry = join(dirname(dirname(lotFolder)), HANDOVER_STORE_FOLDER)
	const input = readLotStateInput({ lotFolder, registry })
	if (!input) return { exitCode: 2, output: `no lot ${read.words[0]}` }
	const status = statusOf({ input, lotFolder, registry })
	return {
		exitCode: 0,
		output: read.flags.has('json') ? JSON.stringify(status, null, 2) : statusText(status),
	}
}

/** The status JSON of a lot (33S section 7, D17). */
function statusOf(params: {
	input: LotStateInput
	lotFolder: string
	registry: string
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
		checks: checksOf({ worktree: identity.worktree, lotFolder }),
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

/** The worktree and its link as they are on disk; null for a simulated lot (no worktree). */
function checksOf(params: { worktree: string | null; lotFolder: string }): LotStatusJson['checks'] {
	if (params.worktree === null) return { worktree: null, link: null, wouldRefuse: [] }
	const worktree: WorktreeCheck = isFolder(params.worktree) ? 'present' : 'missing'
	return {
		worktree,
		link: linkCheckOf({
			link: join(params.worktree, ...LOT_LINK_SEGMENTS),
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
	registry: string
}): string[] {
	const { identity } = params.input
	if (identity.worktree === null) return []
	const worktree = realPathOf(identity.worktree)
	return readStoreEntries(params.registry)
		.filter(
			(entry) =>
				entry.branch === identity.branch &&
				realPathOf(entry.worktree) === worktree &&
				realPathOf(entry.folder) !== params.lotFolder,
		)
		.map(
			(entry) =>
				`the hand-over ${entry.name} holds this lot's worktree and branch in ${entry.folder}: the lot sees no hand-over until one is written with --out ${identity.name}`,
		)
}

/** The text form: the state line, the position, the open questions, the checks when not all present, next. */
function statusText(status: LotStatusJson): string {
	const position = status.position
		? `step ${status.position.step} of ${status.position.of}${status.position.station ? `, ${status.position.station}` : ''}${status.position.round === null ? '' : `, round ${status.position.round}`}`
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
	return [state, ...withPosition, ...rest].join('\n')
}

/** The checks that are not `present`, as `worktree missing, link dangling`; empty when all are. */
function checksText(checks: LotStatusJson['checks']): string {
	if (checks.worktree === 'missing') return 'worktree missing'
	if (checks.link === null || checks.link === 'present') return ''
	return `link ${checks.link}`
}
