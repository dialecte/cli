/**
 * `dialecte lot design <id> [--from <file> | --from-plan | --approve --by <who> [--reason <text>] [--verdict <file>]... |
 * --waive --by <who> --reason <text>] [--json]` (DESIGN-GATE section 2): a lot's design recorded by its content's
 * sha256 (a copy kept in the lot folder), approved from the main checkout on a saved review that passes exactly that
 * content, or waived, for the need it was given against, and its standing printed. Each write refreshes `review.jsonl`.
 * It refuses nothing of the lot's other verbs.
 */
import { basename, dirname, resolve } from 'node:path'

import { renderLotUsage } from '../lib/command-map/render-help.ts'
import { resultOf } from '../lib/command-result.ts'
import { lotGitDeclaredHighOf } from '../lib/design/base-declared.ts'
import { designFileContentOf, isDesignFileRefusal } from '../lib/design/design-file.ts'
import { designNextOf, designStatusJson, designStatusLine } from '../lib/design/design-line.ts'
import {
	appendDesignLine,
	designHashOf,
	hasDesignCopy,
	readDesignLines,
	sourceHashOf,
	writeDesignCopy,
	designLineFits,
	writeReviewCopy,
} from '../lib/design/design-records.ts'
import {
	lotDesignNeedOf,
	lotDesignStandingOf,
	lotPlanEntryOf,
} from '../lib/design/design-standing.ts'
import { designReviewsOf } from '../lib/design/design-verdicts.ts'
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
import { requiredLotOf } from '../lib/store/resolve-lot.ts'
import { ownWorktreeRefusal, recordedByOf } from '../lib/store/signer-rules.ts'
import { APPROVABLE_STATES } from './lot-approve.constants.ts'
import {
	DESIGN_FILE_REFUSAL_LINES,
	DESIGN_FLAGS,
	DESIGN_REPEATABLE_OPTIONS,
	SYSTEM_TEMPORARY_ROOTS,
	DESIGN_VALUE_OPTIONS,
	DESIGN_VERB,
	LOT_DESIGN_LINES,
	REVIEW_FILE_REFUSAL_LINES,
	REVIEW_NAME_SEPARATOR,
} from './lot-design.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type {
	DesignApprovedLine,
	DesignFileRefusal,
	DesignFileRefusalKind,
	DesignLine,
	DesignNeed,
	DesignRecordedLine,
	DesignReviews,
	DesignStanding,
	VerdictFile,
	VerdictStanding,
} from '../lib/design/design.types.ts'
import type {
	DesignFileRoots,
	DesignLotPlace,
	DesignRequest,
	DesignShowJson,
	DesignVerdictJson,
} from './lot-design.types.ts'

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
		repeatable: DESIGN_REPEATABLE_OPTIONS,
		flags: DESIGN_FLAGS,
	})
	if (typeof read === 'string' || read.words.length !== 1) return usage()
	const request = requestOf({
		values: read.values,
		flags: read.flags,
		verdicts: read.lists.get('verdict') ?? [],
	})
	if (request === undefined) return usage()
	const place = placeOf({ cwd: params.cwd, id: read.words[0], json: read.flags.has('json') })
	if ('exitCode' in place) return place
	const roots: DesignFileRoots = {
		cwd: params.cwd,
		sharedTemporaryRoots: params.sharedTemporaryRoots ?? SYSTEM_TEMPORARY_ROOTS,
	}
	if (request.kind === 'show') return showStanding({ place, roots, json: read.flags.has('json') })
	if (!APPROVABLE_STATES.includes(place.state))
		return lineOf({
			exitCode: 1,
			line: fillMessage({
				template: LOT_DESIGN_LINES.notAtWork,
				values: { lot: place.lot, state: place.state },
			}),
		})
	const at = (params.now ?? new Date()).toISOString()
	if (request.kind === 'record') return recordDesign({ place, roots, file: request.file, at })
	const refusal =
		byRefusal({ place, by: request.by, reason: request.reason }) ??
		ownWorktreeRefusal({
			lotFolder: place.lotFolder,
			cwd: params.cwd,
			command: fillMessage({
				template: LOT_DESIGN_LINES.ownWorktreeCommand,
				values: { verb: request.kind },
			}),
		})
	if (refusal !== undefined) return lineOf({ exitCode: 2, line: refusal })
	return request.kind === 'approve'
		? approveDesign({
				place,
				roots,
				by: request.by,
				reason: request.reason,
				verdicts: request.verdicts,
				at,
			})
		: waiveDesign({ place, roots, by: request.by, reason: request.reason, at })
}

/** The one request the options make; undefined for none that fits (two at once, a missing or blank value). */
function requestOf(params: {
	values: Map<string, string>
	flags: Set<string>
	verdicts: string[]
}): DesignRequest | undefined {
	const { values, flags, verdicts } = params
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
	if (verdicts.some(isBlank)) return undefined
	if (flags.has('approve'))
		return isOneLine(by)
			? { kind: 'approve', by, ...(reason !== undefined && { reason }), verdicts }
			: undefined
	if (verdicts.length > 0) return undefined
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

/**
 * The standing's lines: the status line, the verdict lines while the design is not approved, then what to run next when
 * the lot cannot go on; or its JSON, the reviews' verdict in it.
 */
function showStanding(params: {
	place: DesignLotPlace
	roots: DesignFileRoots
	json: boolean
}): CommandResult {
	const standing = gitStandingOf(params.place)
	const reviews = shownReviewsOf({ place: params.place, standing, roots: params.roots })
	if (params.json) {
		const json: DesignShowJson = {
			...designStatusJson(standing),
			verdict: reviews === undefined ? null : verdictJsonOf(reviews.standing),
		}
		return { exitCode: 0, output: jsonOf(json) }
	}
	const { note } = lotGitDeclaredHighOf({ lotFolder: params.place.lotFolder })
	return resultOf({
		exitCode: 0,
		lines: [
			...standingLines({ standing, lot: params.place.lot, reviews }),
			...(note === undefined ? [] : [note]),
		],
	})
}

/** The file (or, without one, the plan entry's spec) recorded: its line, its copy, the review record refreshed. */
function recordDesign(params: {
	place: DesignLotPlace
	roots: DesignFileRoots
	file: string | undefined
	at: string
}): CommandResult {
	const { place, roots } = params
	const source =
		params.file === undefined ? planSpecOf(place) : { file: resolve(roots.cwd, params.file) }
	if ('exitCode' in source) return source
	const content = designFileContentOf({ file: source.file, ...roots })
	if (isDesignFileRefusal(content))
		return lineOf({
			exitCode: 2,
			line: fileRefusalLine({ refusal: content, templates: DESIGN_FILE_REFUSAL_LINES }),
		})
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
		roots,
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

/** A design or review file's refusal as the line its kind names says it. */
function fileRefusalLine(params: {
	refusal: DesignFileRefusal
	templates: Record<DesignFileRefusalKind, string>
}): string {
	return fillMessage({
		template: params.templates[params.refusal.refused],
		values: { file: params.refusal.file },
	})
}

/**
 * An approval of the last recorded content for the current need, resting on the saved reviews that pass exactly that
 * content (FIX-design-needs-critic D3); refused with nothing recorded, a changed source, or reviews that do not pass it.
 * Each review is read once: its copy is written from the bytes checked, then the line.
 */
function approveDesign(params: {
	place: DesignLotPlace
	roots: DesignFileRoots
	by: string
	reason: string | undefined
	verdicts: readonly string[]
	at: string
}): CommandResult {
	const { place, roots } = params
	const recordedLines = readDesignLines({ lotFolder: place.lotFolder }).filter(isRecorded)
	const last = recordedLines.at(-1)
	if (last === undefined)
		return lineOf({
			exitCode: 2,
			line: fillMessage({ template: LOT_DESIGN_LINES.nothingRecorded, values: { lot: place.lot } }),
		})
	const recordedRefusal = sourceRefusalOf({ place, last })
	if (recordedRefusal !== undefined) return lineOf({ exitCode: 2, line: recordedRefusal })
	const reviews = reviewsOf({
		last,
		recordedLines,
		named: params.verdicts.map(function resolved(file) {
			return resolve(roots.cwd, file)
		}),
		roots,
	})
	const refusals = approvalRefusalsOf({ reviews, last, lot: place.lot })
	if (refusals.length > 0) return resultOf({ exitCode: 2, lines: refusals })
	const by = recordedByOf({ by: params.by })
	const line = approvedLineOf({ place, last, reviews, by, reason: params.reason, at: params.at })
	if (!designLineFits({ line }))
		return lineOf({
			exitCode: 2,
			line: fillMessage({
				template: LOT_DESIGN_LINES.reviewTooMany,
				values: { count: String(reviews.standing.ready.length) },
			}),
		})
	try {
		for (const file of reviews.standing.ready)
			writeReviewCopy({ lotFolder: place.lotFolder, hash: file.hash, text: file.text })
		appendDesignLine({ lotFolder: place.lotFolder, line })
	} catch (error) {
		return failed(error)
	}
	return written({
		place,
		roots,
		line: fillMessage({
			template: LOT_DESIGN_LINES.approved,
			values: { lot: place.lot, by, hash: last.hash.slice(0, DESIGN_SHOWN_HASH_LENGTH) },
		}),
	})
}

/** Why the recorded source cannot be approved: it and its copy both gone, or it changed since; undefined when it can. */
function sourceRefusalOf(params: {
	place: DesignLotPlace
	last: DesignRecordedLine
}): string | undefined {
	const { place, last } = params
	const now = sourceHashOf(last.file)
	// a source gone is no refusal while the stored copy holds the text approved; with the copy gone too, nothing does
	if (now === undefined && !hasDesignCopy({ lotFolder: place.lotFolder, hash: last.hash }))
		return fillMessage({
			template: LOT_DESIGN_LINES.goneWithCopy,
			values: { file: last.file, lot: place.lot },
		})
	if (now !== undefined && now !== last.hash)
		return fillMessage({
			template: LOT_DESIGN_LINES.changedSinceRecorded,
			values: { file: last.file, lot: place.lot },
		})
	return undefined
}

/** The approved line of the last recorded content for the current need, with the reviews passing it. */
function approvedLineOf(params: {
	place: DesignLotPlace
	last: DesignRecordedLine
	reviews: DesignReviews
	by: string
	reason: string | undefined
	at: string
}): DesignApprovedLine {
	return {
		schema: DESIGN_LINE_SCHEMA,
		kind: 'approved',
		at: params.at,
		by: params.by,
		...(params.reason !== undefined && { reason: params.reason }),
		hash: params.last.hash,
		need: gitNeedOf(params.place).reasons,
		reviews: params.reviews.standing.ready.map(function reviewOf(file) {
			return { name: file.name, hash: file.hash }
		}),
	}
}

/** The saved reviews of the last recorded content: its folder's and the `named` ones, against the earlier hashes. */
function reviewsOf(params: {
	last: DesignRecordedLine
	recordedLines: readonly DesignRecordedLine[]
	named: readonly string[]
	roots: DesignFileRoots
}): DesignReviews {
	const { last } = params
	return designReviewsOf({
		folder: dirname(last.file),
		recorded: last.file,
		recordedHash: last.hash,
		earlier: [
			...new Set(
				params.recordedLines.map(hashOf).filter(function isEarlier(hash) {
					return hash !== last.hash
				}),
			),
		],
		named: params.named,
		...params.roots,
	})
}

/**
 * Every reason the reviews do not let the approval through, at once: each named file refused, naming another hash or
 * naming it without a verdict; each review naming it that does not pass it; or, with none passing it, the folder gone
 * when it is, else the missing line and its hints.
 */
function approvalRefusalsOf(params: {
	reviews: DesignReviews
	last: DesignRecordedLine
	lot: string
}): string[] {
	const { reviews, last, lot } = params
	const hash = last.hash.slice(0, DESIGN_SHOWN_HASH_LENGTH)
	const named = [
		...reviews.refusals.map(function refusedLine(refusal) {
			return fileRefusalLine({ refusal, templates: REVIEW_FILE_REFUSAL_LINES })
		}),
		...reviews.namesOther.map(function otherLine(file) {
			return fillMessage({
				template: LOT_DESIGN_LINES.reviewNamesOther,
				values: { file, hash, lot },
			})
		}),
		...reviews.namedNoVerdict.map(function noVerdictLine(file) {
			return fillMessage({ template: LOT_DESIGN_LINES.reviewNoVerdict, values: { file, hash } })
		}),
	]
	const folder = dirname(last.file)
	const { standing } = reviews
	if (standing.state === 'ready') return named
	if (standing.state === 'blocked')
		return [
			...named,
			...standing.blocking.map(function blockingLine(file) {
				return fillMessage({
					template: blockingTemplateOf({
						file,
						templates: {
							disagree: LOT_DESIGN_LINES.reviewDisagree,
							'open-fence': LOT_DESIGN_LINES.reviewOpenFence,
							other: LOT_DESIGN_LINES.reviewBlocking,
						},
					}),
					values: { name: file.name, verdict: file.read.verdict?.written ?? '', hash, lot },
				})
			}),
		]
	if (reviews.folder === 'gone')
		return [
			...named,
			fillMessage({ template: LOT_DESIGN_LINES.reviewFolderGone, values: { folder } }),
		]
	return [
		...named,
		fillMessage({ template: LOT_DESIGN_LINES.reviewMissing, values: { hash, lot, folder } }),
		...hintLines({ standing, hash }),
	]
}

/** The hints after a missing verdict: each READY review of an earlier revision, each review naming it without a verdict. */
function hintLines(params: { standing: VerdictStanding; hash: string }): string[] {
	const { standing, hash } = params
	return [
		...standing.earlierReady.map(function earlierLine(entry) {
			return fillMessage({
				template: LOT_DESIGN_LINES.hintEarlierReady,
				values: {
					name: entry.name,
					earlier: entry.hash.slice(0, DESIGN_SHOWN_HASH_LENGTH),
					hash,
				},
			})
		}),
		...standing.noVerdict.map(function noVerdictLine(name) {
			return fillMessage({ template: LOT_DESIGN_LINES.hintNoVerdict, values: { name, hash } })
		}),
	]
}

/** The reviews a standing shows: those of the last recorded content, read from its folder, while it is not approved. */
function shownReviewsOf(params: {
	place: DesignLotPlace
	standing: DesignStanding
	roots: DesignFileRoots
}): DesignReviews | undefined {
	if (params.standing.state !== 'unapproved') return undefined
	const recordedLines = readDesignLines({ lotFolder: params.place.lotFolder }).filter(isRecorded)
	const last = recordedLines.at(-1)
	if (last === undefined) return undefined
	return reviewsOf({ last, recordedLines, named: [], roots: params.roots })
}

/** The verdict lines of a standing's reviews: READY in its files, missing with its hints, or each file blocking. */
function verdictLinesOf(params: { reviews: DesignReviews; standing: DesignStanding }): string[] {
	const { reviews } = params
	const file = params.standing.file ?? ''
	const hash = (params.standing.hash ?? '').slice(0, DESIGN_SHOWN_HASH_LENGTH)
	const folder = dirname(file)
	const verdicts = reviews.standing
	if (verdicts.state === 'ready')
		return [
			fillMessage({
				template: LOT_DESIGN_LINES.verdictReady,
				values: { names: verdicts.ready.map(nameOfReview).join(REVIEW_NAME_SEPARATOR) },
			}),
		]
	if (verdicts.state === 'blocked')
		return verdicts.blocking.map(function blockingLine(review) {
			return fillMessage({
				template: blockingTemplateOf({
					file: review,
					templates: {
						disagree: LOT_DESIGN_LINES.verdictDisagree,
						'open-fence': LOT_DESIGN_LINES.verdictOpenFence,
						other: LOT_DESIGN_LINES.verdictBlocking,
					},
				}),
				values: { verdict: review.read.verdict?.written ?? '', name: review.name },
			})
		})
	if (reviews.folder === 'gone')
		return [fillMessage({ template: LOT_DESIGN_LINES.verdictFolderGone, values: { folder } })]
	return [
		fillMessage({ template: LOT_DESIGN_LINES.verdictMissing, values: { folder, hash } }),
		...hintLines({ standing: verdicts, hash }),
	]
}

/** The template of a review that does not pass: its own for lines that disagree or an open fence, else the one naming the verdict. */
function blockingTemplateOf(params: {
	file: VerdictFile
	templates: { disagree: string; 'open-fence': string; other: string }
}): string {
	const cause = params.file.read.verdict?.cause
	return cause === 'disagree' || cause === 'open-fence'
		? params.templates[cause]
		: params.templates.other
}

/** The reviews' verdict as `--json` gives it: the state and the files that decide it. */
function verdictJsonOf(standing: VerdictStanding): DesignVerdictJson {
	const files = standing.state === 'ready' ? standing.ready : standing.blocking
	return { state: standing.state, files: files.map(nameOfReview) }
}

function nameOfReview(review: { name: string }): string {
	return review.name
}

function hashOf(line: DesignRecordedLine): string {
	return line.hash
}

function isBlank(value: string): boolean {
	return value.trim() === ''
}

/** A waiver of the current need; refused when the lot needs no design and has none recorded (D6). */
function waiveDesign(params: {
	place: DesignLotPlace
	roots: DesignFileRoots
	by: string
	reason: string
	at: string
}): CommandResult {
	const { place } = params
	const need = gitNeedOf(place)
	const recorded = readDesignLines({ lotFolder: place.lotFolder }).some(isRecorded)
	if (!need.required && !recorded)
		return lineOf({
			exitCode: 2,
			line: fillMessage({ template: LOT_DESIGN_LINES.notRequired, values: { lot: place.lot } }),
		})
	const by = recordedByOf({ by: params.by })
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
		roots: params.roots,
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

/** A write's answer: its line, the standing after it, and the review record's warning when it could not be written. */
function written(params: {
	place: DesignLotPlace
	roots: DesignFileRoots
	line: string
}): CommandResult {
	const { place } = params
	const warning = refreshReviewRecord({ folder: place.lotFolder })
	const standing = gitStandingOf(place)
	const reviews = shownReviewsOf({ place, standing, roots: params.roots })
	return resultOf({
		exitCode: 0,
		lines: [
			params.line,
			...standingLines({ standing, lot: place.lot, reviews }),
			...(warning === undefined ? [] : [warning]),
		],
	})
}

/** The status line, the verdict lines when reviews are shown, then the next line when the design does not let the lot go on. */
function standingLines(params: {
	standing: DesignStanding
	lot: string
	reviews: DesignReviews | undefined
}): string[] {
	const next = designNextOf(params)
	return [
		designStatusLine(params.standing),
		...(params.reviews === undefined
			? []
			: verdictLinesOf({ reviews: params.reviews, standing: params.standing })),
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
