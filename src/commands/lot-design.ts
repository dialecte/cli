/**
 * `dialecte lot design <id> [--from <file> | --from-plan | --approve --by <who> [--reason <text>] | --waive --by <who>
 * --reason <text>] [--json]` (DESIGN-GATE section 2): a lot's design recorded by its content's sha256 (a copy kept in
 * the lot folder), approved or waived from the main checkout for the need it was given against, and its standing
 * printed. Each write refreshes `review.jsonl`. It refuses nothing of the lot's other verbs.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, resolve, sep } from 'node:path'

import { renderLotUsage } from '../lib/command-map/render-help.ts'
import { resultOf } from '../lib/command-result.ts'
import { lotGitDeclaredHighOf } from '../lib/design/base-declared.ts'
import { designNextOf, designStatusJson, designStatusLine } from '../lib/design/design-line.ts'
import {
	appendDesignLine,
	designHashOf,
	hasDesignCopy,
	readDesignLines,
	sourceHashOf,
	writeDesignCopy,
} from '../lib/design/design-records.ts'
import {
	lotDesignNeedOf,
	lotDesignStandingOf,
	lotPlanEntryOf,
} from '../lib/design/design-standing.ts'
import {
	DESIGN_LINE_SCHEMA,
	DESIGN_NEXT_PREFIX,
	DESIGN_SHOWN_HASH_LENGTH,
} from '../lib/design/design.constants.ts'
import { realPathOf } from '../lib/file-system.ts'
import { fillMessage } from '../lib/knowledge/standard/fill-message.ts'
import { jsonOf } from '../lib/print/print.ts'
import { forbiddenWordRefusal, isOneLine } from '../lib/review-rounds/option-checks.ts'
import { refreshReviewRecord } from '../lib/review-rounds/review-record.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { scratchReadRoots } from '../lib/scratch/scratch-roots.ts'
import { readIdentity } from '../lib/store/identity.ts'
import { lotRefusalExit } from '../lib/store/lot-exits.ts'
import {
	commonFolderOfLotFolder,
	readCheckedLotState,
	registryOfLotFolder,
} from '../lib/store/lot-records.ts'
import { lotState } from '../lib/store/lot-state.ts'
import { PUBLIC_TEXT_REFUSAL } from '../lib/store/public-text.constants.ts'
import { folderPlanEntryIds, publicTextLabel } from '../lib/store/public-text.ts'
import { lotOfWorktree, requiredLotOf } from '../lib/store/resolve-lot.ts'
import { APPROVABLE_STATES, ORCHESTRATOR_APPROVER } from './lot-approve.constants.ts'
import {
	DESIGN_FLAGS,
	SYSTEM_TEMPORARY_ROOTS,
	DESIGN_VALUE_OPTIONS,
	DESIGN_VERB,
	LOT_DESIGN_LINES,
} from './lot-design.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type {
	DesignLine,
	DesignNeed,
	DesignRecordedLine,
	DesignStanding,
} from '../lib/design/design.types.ts'
import type { DesignLotPlace, DesignRequest } from './lot-design.types.ts'

export function runLotDesign(params: {
	cwd: string
	argv: string[]
	now?: Date
	/** The shared temporary folders a design is refused in; default `SYSTEM_TEMPORARY_ROOTS`. */
	sharedTemporaryRoots?: readonly string[]
}): CommandResult {
	const read = readArguments({
		argv: params.argv,
		valueOptions: DESIGN_VALUE_OPTIONS,
		flags: DESIGN_FLAGS,
	})
	if (typeof read === 'string' || read.words.length !== 1) return usage()
	const request = requestOf({ values: read.values, flags: read.flags })
	if (request === undefined) return usage()
	const place = placeOf({ cwd: params.cwd, id: read.words[0], json: read.flags.has('json') })
	if ('exitCode' in place) return place
	if (request.kind === 'show') return showStanding({ place, json: read.flags.has('json') })
	if (!APPROVABLE_STATES.includes(place.state))
		return lineOf({
			exitCode: 1,
			line: fillMessage({
				template: LOT_DESIGN_LINES.notAtWork,
				values: { lot: place.lot, state: place.state },
			}),
		})
	const at = (params.now ?? new Date()).toISOString()
	if (request.kind === 'record')
		return recordDesign({
			place,
			cwd: params.cwd,
			file: request.file,
			at,
			sharedTemporaryRoots: params.sharedTemporaryRoots ?? SYSTEM_TEMPORARY_ROOTS,
		})
	const refusal =
		byRefusal({ place, by: request.by, reason: request.reason }) ??
		ownWorktreeRefusal({ place, cwd: params.cwd, verb: request.kind })
	if (refusal !== undefined) return lineOf({ exitCode: 2, line: refusal })
	return request.kind === 'approve'
		? approveDesign({ place, by: request.by, reason: request.reason, at })
		: waiveDesign({ place, by: request.by, reason: request.reason, at })
}

/** The one request the options make; undefined for none that fits (two at once, a missing or blank value). */
function requestOf(params: {
	values: Map<string, string>
	flags: Set<string>
}): DesignRequest | undefined {
	const { values, flags } = params
	const from = values.get('from')
	const by = values.get('by')
	const reason = values.get('reason')
	const asked = [
		from !== undefined,
		flags.has('from-plan'),
		flags.has('approve'),
		flags.has('waive'),
	]
	if (asked.filter(Boolean).length > 1) return undefined
	if (reason !== undefined && !isOneLine(reason)) return undefined
	if (flags.has('approve'))
		return isOneLine(by)
			? { kind: 'approve', by, ...(reason !== undefined && { reason }) }
			: undefined
	if (flags.has('waive'))
		return isOneLine(by) && reason !== undefined ? { kind: 'waive', by, reason } : undefined
	if (by !== undefined || reason !== undefined) return undefined
	if (from !== undefined) return from.trim() === '' ? undefined : { kind: 'record', file: from }
	if (flags.has('from-plan')) return { kind: 'record', file: undefined }
	return { kind: 'show' }
}

/** The lot `id` names, with its state and repository; the refusal of an id naming none or a damaged lot. */
function placeOf(params: {
	cwd: string
	id: string
	json: boolean
}): DesignLotPlace | CommandResult {
	const required = requiredLotOf({ argument: params.id, cwd: params.cwd, mode: 'write' })
	if (!('lot' in required)) return lotRefusalExit({ lines: required.lines, json: params.json })
	const lotFolder = required.lot
	const checked = readCheckedLotState({ lotFolder, registry: registryOfLotFolder(lotFolder) })
	const identity = readIdentity({ lotFolder })
	if (checked === undefined || !('input' in checked) || identity === undefined)
		return lotRefusalExit({
			lines: [
				fillMessage({ template: LOT_DESIGN_LINES.damaged, values: { lot: basename(lotFolder) } }),
			],
			json: params.json,
		})
	return {
		lot: basename(lotFolder),
		lotFolder,
		state: lotState(checked.input).state,
		repository: identity.repository,
	}
}

/** The standing's lines: the status line, then what to run next when the lot cannot go on; or its JSON. */
function showStanding(params: { place: DesignLotPlace; json: boolean }): CommandResult {
	const standing = gitStandingOf(params.place)
	if (params.json) return { exitCode: 0, output: jsonOf(designStatusJson(standing)) }
	const { note } = lotGitDeclaredHighOf({ lotFolder: params.place.lotFolder })
	return resultOf({
		exitCode: 0,
		lines: [
			...standingLines({ standing, lot: params.place.lot }),
			...(note === undefined ? [] : [note]),
		],
	})
}

/** The file (or, without one, the plan entry's spec) recorded: its line, its copy, the review record refreshed. */
function recordDesign(params: {
	place: DesignLotPlace
	cwd: string
	file: string | undefined
	at: string
	sharedTemporaryRoots: readonly string[]
}): CommandResult {
	const { place } = params
	const source =
		params.file === undefined ? planSpecOf(place) : { file: resolve(params.cwd, params.file) }
	if ('exitCode' in source) return source
	const content = designContentOf({
		file: source.file,
		cwd: params.cwd,
		sharedTemporaryRoots: params.sharedTemporaryRoots,
	})
	if ('exitCode' in content) return content
	const hash = designHashOf(content.bytes)
	try {
		writeDesignCopy({ lotFolder: place.lotFolder, hash, text: content.text })
		appendDesignLine({
			lotFolder: place.lotFolder,
			line: {
				schema: DESIGN_LINE_SCHEMA,
				kind: 'recorded',
				at: params.at,
				file: content.file,
				hash,
				from: params.file === undefined ? 'plan' : 'file',
			},
		})
	} catch (error) {
		return failed(error)
	}
	return written({
		place,
		line: fillMessage({
			template: LOT_DESIGN_LINES.recorded,
			values: { lot: place.lot, file: content.file, hash: hash.slice(0, DESIGN_SHOWN_HASH_LENGTH) },
		}),
	})
}

/** The plan entry's spec when no other `lot` or `fix` entry of its block names it; the refusal otherwise. */
function planSpecOf(place: DesignLotPlace): { file: string } | CommandResult {
	const held = lotPlanEntryOf({ lotFolder: place.lotFolder })
	const spec = held?.entry.spec
	if (held === undefined || spec === undefined)
		return lineOf({
			exitCode: 2,
			line: fillMessage({ template: LOT_DESIGN_LINES.noPlanSpec, values: { lot: place.lot } }),
		})
	if (held.sharing > 1)
		return lineOf({
			exitCode: 2,
			line: fillMessage({
				template: LOT_DESIGN_LINES.sharedSpec,
				values: { file: realPathOf(spec), count: String(held.sharing), lot: place.lot },
			}),
		})
	return { file: spec }
}

/**
 * The file's real path, bytes and text; refused when it cannot be read, is empty, is not UTF-8 text, or lies in a
 * scratch or temporary folder (wiped there, and nobody else reads it).
 */
function designContentOf(params: {
	file: string
	cwd: string
	sharedTemporaryRoots: readonly string[]
}): { file: string; bytes: Buffer; text: string } | CommandResult {
	const { file, cwd, sharedTemporaryRoots } = params
	if (!existsSync(file) || !statSync(file).isFile())
		return fileRefusal({ template: LOT_DESIGN_LINES.unreadable, file })
	const real = realPathOf(file)
	if (isInScratch({ file: real, cwd, sharedTemporaryRoots }))
		return fileRefusal({ template: LOT_DESIGN_LINES.inScratch, file })
	const bytes = readFileSync(real)
	if (bytes.length === 0) return fileRefusal({ template: LOT_DESIGN_LINES.empty, file: real })
	try {
		return { file: real, bytes, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
	} catch {
		return fileRefusal({ template: LOT_DESIGN_LINES.notText, file: real })
	}
}

/**
 * Whether the file lies under the cli's scratch roots, the system's temporary folder (`scratchReadRoots`) or the
 * system's shared temporary folders (`/tmp`, `/private/tmp`, each by its real path): wiped there, and nobody else
 * reads it. A file outside every git work tree is no refusal: plans live there.
 */
function isInScratch(params: {
	file: string
	cwd: string
	sharedTemporaryRoots: readonly string[]
}): boolean {
	const roots = [...scratchReadRoots({ cwd: params.cwd }), ...params.sharedTemporaryRoots]
	return roots.some(function holdsFile(root) {
		const real = realPathOf(root)
		return params.file === real || params.file.startsWith(`${real}${sep}`)
	})
}

/** A refusal naming the file (exit 2). */
function fileRefusal(params: { template: string; file: string }): CommandResult {
	return lineOf({
		exitCode: 2,
		line: fillMessage({ template: params.template, values: { file: params.file } }),
	})
}

/** An approval of the last recorded content for the current need; refused with nothing recorded or a changed source. */
function approveDesign(params: {
	place: DesignLotPlace
	by: string
	reason: string | undefined
	at: string
}): CommandResult {
	const { place } = params
	const last = readDesignLines({ lotFolder: place.lotFolder }).filter(isRecorded).at(-1)
	if (last === undefined)
		return lineOf({
			exitCode: 2,
			line: fillMessage({ template: LOT_DESIGN_LINES.nothingRecorded, values: { lot: place.lot } }),
		})
	const now = sourceHashOf(last.file)
	// a source gone is no refusal while the stored copy holds the text approved; with the copy gone too, nothing does
	if (now === undefined && !hasDesignCopy({ lotFolder: place.lotFolder, hash: last.hash }))
		return lineOf({
			exitCode: 2,
			line: fillMessage({
				template: LOT_DESIGN_LINES.goneWithCopy,
				values: { file: last.file, lot: place.lot },
			}),
		})
	if (now !== undefined && now !== last.hash)
		return lineOf({
			exitCode: 2,
			line: fillMessage({
				template: LOT_DESIGN_LINES.changedSinceRecorded,
				values: { file: last.file, lot: place.lot },
			}),
		})
	const by = recordedByOf(params.by)
	try {
		appendDesignLine({
			lotFolder: place.lotFolder,
			line: {
				schema: DESIGN_LINE_SCHEMA,
				kind: 'approved',
				at: params.at,
				by,
				...(params.reason !== undefined && { reason: params.reason }),
				hash: last.hash,
				need: gitNeedOf(place).reasons,
			},
		})
	} catch (error) {
		return failed(error)
	}
	return written({
		place,
		line: fillMessage({
			template: LOT_DESIGN_LINES.approved,
			values: { lot: place.lot, by, hash: last.hash.slice(0, DESIGN_SHOWN_HASH_LENGTH) },
		}),
	})
}

/** A waiver of the current need; refused when the lot needs no design. */
function waiveDesign(params: {
	place: DesignLotPlace
	by: string
	reason: string
	at: string
}): CommandResult {
	const { place } = params
	const need = gitNeedOf(place)
	if (!need.required)
		return lineOf({
			exitCode: 2,
			line: fillMessage({ template: LOT_DESIGN_LINES.notRequired, values: { lot: place.lot } }),
		})
	const by = recordedByOf(params.by)
	try {
		appendDesignLine({
			lotFolder: place.lotFolder,
			line: {
				schema: DESIGN_LINE_SCHEMA,
				kind: 'waived',
				at: params.at,
				by,
				reason: params.reason,
				need: need.reasons,
			},
		})
	} catch (error) {
		return failed(error)
	}
	return written({
		place,
		line: fillMessage({ template: LOT_DESIGN_LINES.waived, values: { lot: place.lot, by } }),
	})
}

/**
 * The refusal of a `--by` or `--reason` holding a forbidden word, or of a `--by` holding what a public record never
 * holds (it reaches `review.jsonl` by kind, and the card); undefined when none.
 */
function byRefusal(params: {
	place: DesignLotPlace
	by: string
	reason: string | undefined
}): string | undefined {
	const { place, by } = params
	const words = forbiddenWordRefusal({
		root: commonFolderOfLotFolder(place.lotFolder),
		verb: DESIGN_VERB,
		options: [
			{ option: '--by', text: by },
			...(params.reason === undefined ? [] : [{ option: '--reason', text: params.reason }]),
		],
	})
	if (words !== undefined) return words
	const label = publicTextLabel({
		text: by,
		root: place.repository,
		ids: folderPlanEntryIds({ folder: place.lotFolder }),
	})
	return label === undefined
		? undefined
		: fillMessage({
				template: PUBLIC_TEXT_REFUSAL,
				values: { verb: DESIGN_VERB, option: '--by', label },
			})
}

/** The refusal of an approval or a waiver from the lot's own worktree (or its review throwaway); undefined elsewhere. */
function ownWorktreeRefusal(params: {
	place: DesignLotPlace
	cwd: string
	verb: 'approve' | 'waive'
}): string | undefined {
	const here = lotOfWorktree({ cwd: params.cwd })
	if (here === undefined || realPathOf(here) !== realPathOf(params.place.lotFolder))
		return undefined
	return fillMessage({ template: LOT_DESIGN_LINES.ownWorktree, values: { verb: params.verb } })
}

/** The lot's design standing, held to the shared areas a refusing verb reads: its base's through git. */
function gitStandingOf(place: DesignLotPlace): DesignStanding {
	return lotDesignStandingOf({
		lotFolder: place.lotFolder,
		declaredHigh: lotGitDeclaredHighOf({ lotFolder: place.lotFolder }).globs,
	})
}

/** The lot's need, held to the shared areas a refusing verb reads: its base's through git. */
function gitNeedOf(place: DesignLotPlace): DesignNeed {
	return lotDesignNeedOf({
		lotFolder: place.lotFolder,
		declaredHigh: lotGitDeclaredHighOf({ lotFolder: place.lotFolder }).globs,
	})
}

function isRecorded(line: DesignLine): line is DesignRecordedLine {
	return line.kind === 'recorded'
}

/** The orchestrator in any casing is recorded as the one word every view names. */
function recordedByOf(by: string): string {
	return by.toLowerCase() === ORCHESTRATOR_APPROVER ? ORCHESTRATOR_APPROVER : by
}

/** A write's answer: its line, the standing after it, and the review record's warning when it could not be written. */
function written(params: { place: DesignLotPlace; line: string }): CommandResult {
	const { place } = params
	const warning = refreshReviewRecord({ folder: place.lotFolder })
	const standing = gitStandingOf(place)
	return resultOf({
		exitCode: 0,
		lines: [
			params.line,
			...standingLines({ standing, lot: place.lot }),
			...(warning === undefined ? [] : [warning]),
		],
	})
}

/** The status line, then the next line when the design does not let the lot go on. */
function standingLines(params: { standing: DesignStanding; lot: string }): string[] {
	const next = designNextOf(params)
	return [
		designStatusLine(params.standing),
		...(next === undefined ? [] : [`${DESIGN_NEXT_PREFIX}${next}`]),
	]
}

function failed(error: unknown): CommandResult {
	return lineOf({
		exitCode: 1,
		line: fillMessage({
			template: LOT_DESIGN_LINES.failed,
			values: { reason: (error as Error).message },
		}),
	})
}

function usage(): CommandResult {
	return { exitCode: 2, output: renderLotUsage() }
}

function lineOf(params: { exitCode: number; line: string }): CommandResult {
	return resultOf({ exitCode: params.exitCode, lines: [params.line] })
}
