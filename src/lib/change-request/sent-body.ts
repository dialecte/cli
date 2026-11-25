/**
 * What the cli sent above a change request's kept heading, and the render that refuses to drop anything else: the lines a
 * render owns (`aboveKeptLines`), their hashes in the lot's append-only sent record (`sentRowsOf`, `sentSetOf`), and
 * `renderChangeRequest`, the renderer with the person's part carried and every line it would drop refused. Pure.
 */
import { createHash } from 'node:crypto'

import { readMarkdownBlocks } from '../changelog/markdown-blocks.ts'
import { EVENT_LINE_LIMIT } from '../events/events.constants.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { headingKeyOf } from '../store/brief-sections.ts'
import { TASK_MARKER_PATTERN } from '../store/brief.constants.ts'
import {
	CHANGE_REQUEST_LINES,
	ATX_HEADING_PATTERN,
	PLACEHOLDER_BODY_PATTERN,
	RENDERER_COMMENT_PATTERN,
	SENT_HASH_LENGTH,
	SENT_LINES_NAMED,
	SETEXT_LEVELS,
	UNCLOSED_BLOCK_LINE,
	UNTICKED_TASK_MARKER,
} from './change-request.constants.ts'
import {
	composeChangeRequest,
	keptAnchorOf,
	keptPartOf,
	linesOf,
} from './compose-change-request.ts'

import type { HostNouns } from '../host/host.types.ts'
import type { ChangeRequestSources, ChangeRequestText, SentRow } from './change-request.types.ts'

/** The lines of `body` a render owns: above its kept heading, ends trimmed, blank and renderer lines out, boxes unticked. */
export function aboveKeptLines(params: { template: string; body: string }): string[] {
	return regionAboveKept(params)
		.map((line) => line.trimEnd())
		.filter((line) => line.trim() !== '' && !RENDERER_COMMENT_PATTERN.test(line.trim()))
		.map((line) => line.replace(TASK_MARKER_PATTERN, UNTICKED_TASK_MARKER))
}

// dialecte-allow duplicate-read: the mutation judge's hashLine trims both ends; a sent line keeps its indentation
/** The hash a sent line is recorded by: sha256, its first 16 hex characters. */
export function lineHashOf(line: string): string {
	return createHash('sha256').update(line).digest('hex').slice(0, SENT_HASH_LENGTH)
}

/**
 * The rows that record `lines` sent to `changeRequest` at `at`: their hashes, unique, in line order, as many rows as keep
 * each JSON line under the store's line limit; one row with no hash for no line (the record then exists).
 */
export function sentRowsOf(params: {
	changeRequest: number
	at: string
	lines: readonly string[]
}): SentRow[] {
	const hashes = [...new Set(params.lines.map(lineHashOf))]
	const empty: SentRow = {
		schema: 1,
		changeRequest: params.changeRequest,
		at: params.at,
		lines: [],
	}
	// a hash takes its quotes and a comma; the line its end
	const room = EVENT_LINE_LIMIT - Buffer.byteLength(`${JSON.stringify(empty)}\n`)
	const perRow = Math.max(1, Math.floor(room / (SENT_HASH_LENGTH + 3)))
	const count = Math.max(1, Math.ceil(hashes.length / perRow))
	return Array.from({ length: count }, (_, index) => ({
		...empty,
		lines: hashes.slice(index * perRow, (index + 1) * perRow),
	}))
}

/** Every line hash the rows record for `changeRequest`; undefined when none names it. */
export function sentSetOf(params: {
	rows: readonly SentRow[]
	changeRequest: number
}): ReadonlySet<string> | undefined {
	const own = params.rows.filter((row) => row.changeRequest === params.changeRequest)
	return own.length === 0 ? undefined : new Set(own.flatMap((row) => row.lines))
}

// dialecte-allow duplicate-read: it renders, never reads: the host reads of the change request are the callers'
/**
 * The lot's change request rendered over its `current` body: the person's part carried, and the refusal of a body
 * holding above its kept heading a line neither `sent` (the record's set) nor in the new body; with no record, of a
 * hand heading or an unclosed block there.
 *
 * @intent never render a change request body that drops a line a person wrote
 * @internal
 */
export function renderChangeRequest(params: {
	template: string
	sources: ChangeRequestSources
	nouns: HostNouns
	current: string | undefined
	sent: ReadonlySet<string> | undefined
}): ChangeRequestText | { refusal: string } {
	const { template, current } = params
	const kept =
		current === undefined
			? { kept: undefined }
			: keptPartOf({ template, body: current, nouns: params.nouns })
	if ('refusal' in kept) return kept
	const text = composeChangeRequest({ ...params, kept: kept.kept })
	if ('refusal' in text || current === undefined) return text
	const dropped =
		params.sent === undefined
			? headingsDropped({ template, current, next: text.body })
			: linesDropped({ template, current, next: text.body, sent: params.sent })
	if (dropped.length === 0) return text
	return { refusal: handEditedLine({ template, dropped, nouns: params.nouns }) }
}

/** The lines of `current` above its kept heading that are neither sent nor in the new body, once each, in order. */
function linesDropped(params: {
	template: string
	current: string
	next: string
	sent: ReadonlySet<string>
}): string[] {
	const owned = new Set(aboveKeptLines({ template: params.template, body: params.next }))
	const lines = aboveKeptLines({ template: params.template, body: params.current }).filter(
		(line) => !params.sent.has(lineHashOf(line)) && !owned.has(line),
	)
	return [...new Set(lines)]
}

/**
 * With no record: the headings of `current` above its kept heading, at most the template's part level, whose text is
 * neither a template heading's nor a heading's of the new body there; the whole region when a block there never closes
 * (the reader cannot see past it).
 */
function headingsDropped(params: { template: string; current: string; next: string }): string[] {
	const region = regionAboveKept({ template: params.template, body: params.current })
	const blocks = readMarkdownBlocks({ text: region.join('\n'), scanHtml: false })
	if (blocks.unclosedComment !== undefined || blocks.unclosedBlock !== undefined)
		return [UNCLOSED_BLOCK_LINE]
	const partLevel = templateLevel(params.template)
	const known = new Set([
		...headingsOf(linesOf(params.template).join('\n')).map((heading) => heading.key),
		...headingsOf(regionAboveKept({ template: params.template, body: params.next }).join('\n')).map(
			(heading) => heading.key,
		),
	])
	return headingsOf(region.join('\n'))
		.filter((heading) => heading.level <= partLevel && !known.has(heading.key))
		.map((heading) => heading.line)
}

/** The headings of a markdown text as CommonMark reads them (ATX and setext, none in a fence): level, key, first line. */
function headingsOf(text: string): { level: number; key: string; line: string }[] {
	const blocks = readMarkdownBlocks({ text, scanHtml: false })
	return blocks.tokens.flatMap(function headingOf(token, index) {
		if (token.type !== 'heading_open' || token.map === null) return []
		const level = SETEXT_LEVELS[token.markup] ?? token.markup.length
		const content = blocks.tokens[index + 1]?.content ?? ''
		return [{ level, key: headingKeyOf(content), line: blocks.lines[token.map[0]] ?? content }]
	})
}

/** The level of the template's first heading line: its parts' level. */
function templateLevel(template: string): number {
	const first = linesOf(template)
		.map((line) => ATX_HEADING_PATTERN.exec(line.trim())?.[1])
		.find((marks) => marks !== undefined)
	return first?.length ?? Number.POSITIVE_INFINITY
}

/**
 * The lines of `body` before the kept part's anchor (its last occurrence, as `keptTextOf` finds it); none for a body
 * the render replaces whole (empty, or the placeholder an earlier landing wrote); the whole body without an anchor.
 */
function regionAboveKept(params: { template: string; body: string }): string[] {
	const lines = linesOf(params.body)
	const trimmed = lines.join('\n').trim()
	if (trimmed === '' || PLACEHOLDER_BODY_PATTERN.test(trimmed)) return []
	const anchor = keptAnchorOf(params.template)
	const at = anchor === undefined ? -1 : lines.lastIndexOf(anchor)
	return at === -1 ? lines : lines.slice(0, at)
}

/** The refusal of a body holding `dropped` above its kept heading. */
function handEditedLine(params: {
	template: string
	dropped: readonly string[]
	nouns: HostNouns
}): string {
	const heading = keptAnchorOf(params.template) ?? ''
	const one = params.dropped.length === 1
	return fillMessage({
		template: one ? CHANGE_REQUEST_LINES.handEditedOne : CHANGE_REQUEST_LINES.handEditedMany,
		values: {
			...params.nouns,
			count: String(params.dropped.length),
			heading,
			lines: params.dropped
				.slice(0, SENT_LINES_NAMED)
				.map((line) => `'${line.trim()}'`)
				.join(', '),
		},
	})
}
