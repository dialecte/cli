/** Whether a block or item's raw HTML is inert: whole comments and balanced bare tags of the inert elements only. */
import {
	ASCII_CAPITAL_PATTERN,
	BARE_TAG_PATTERN,
	COMMENT_BANG_CLOSE,
	COMMENT_CLOSE,
	COMMENT_OPEN,
	COMMENT_SELF_CLOSING_PATTERN,
	INERT_HTML_ELEMENTS,
	INERT_VOID_HTML_ELEMENTS,
} from './changelog.constants.ts'

import type { OpenTag, PieceRead } from './changelog.types.ts'

/**
 * The first piece of a unit's raw HTML that is no whole comment and no balanced bare inert tag, read left to right;
 * undefined when the unit is inert. Each piece is read alone: every `<` in it starts a whole comment (`<!-->`,
 * `<!--->`, or `<!--` to its first `-->`, holding no `--!>`) or a bare tag of an inert element (no attribute; a void
 * may end `/>`, never be closed). The first problem met wins: the construct from its `<` to the first `>` after it
 * (to the piece's end when none), a close that does not match the innermost open tag, else the first tag still open.
 *
 * @intent tell which raw HTML of a changelog block a release refuses
 * @internal
 */
export function refusedHtmlOf(params: { pieces: readonly string[] }): string | undefined {
	let open: readonly OpenTag[] = []
	for (const piece of params.pieces) {
		const read = readPiece({ piece, open })
		if ('refused' in read) return read.refused
		open = read.open
	}
	return open[0]?.text
}

/** One piece read on top of the tags still open before it: the tags open after it, or the first refused text. */
function readPiece(params: { piece: string; open: readonly OpenTag[] }): PieceRead {
	const { piece } = params
	let open = params.open
	for (let at = piece.indexOf('<'); at !== -1;) {
		const rest = piece.slice(at)
		const comment = wholeCommentLength({ rest })
		if (comment !== undefined) {
			at = piece.indexOf('<', at + comment)
			continue
		}
		const tag = BARE_TAG_PATTERN.exec(rest)
		const name = tag === null ? undefined : asciiLowerCase({ text: tag[2] ?? '' })
		if (tag === null || name === undefined) return { refused: constructOf({ rest }) }
		const closing = tag[1] === '/'
		const selfClosed = tag[3] === '/'
		const text = tag[0]
		if (isVoid({ name })) {
			if (closing) return { refused: text }
		} else if (!isInert({ name }) || selfClosed) return { refused: text }
		else if (closing) {
			if (open.at(-1)?.name !== name) return { refused: text }
			open = open.slice(0, -1)
		} else open = [...open, { name, text }]
		at = piece.indexOf('<', at + text.length)
	}
	return { open }
}

/** The length of the whole comment `rest` opens with; undefined when it opens with none. */
function wholeCommentLength(params: { rest: string }): number | undefined {
	const { rest } = params
	if (!rest.startsWith(COMMENT_OPEN)) return undefined
	const abrupt = COMMENT_SELF_CLOSING_PATTERN.exec(rest)
	if (abrupt) return abrupt[0].length
	const close = rest.indexOf(COMMENT_CLOSE, COMMENT_OPEN.length)
	if (close === -1) return undefined
	const bang = rest.indexOf(COMMENT_BANG_CLOSE, COMMENT_OPEN.length)
	if (bang !== -1 && bang < close) return undefined
	return close + COMMENT_CLOSE.length
}

/** The construct `rest` opens with: up to and with the first `>`, else all of it. */
function constructOf(params: { rest: string }): string {
	const end = params.rest.indexOf('>')
	return end === -1 ? params.rest : params.rest.slice(0, end + 1)
}

/** `text` with only its ASCII capitals lowered: a name never matches through a non-ASCII case fold. */
function asciiLowerCase(params: { text: string }): string {
	return params.text.replace(ASCII_CAPITAL_PATTERN, (capital) =>
		String.fromCharCode(capital.charCodeAt(0) + 32),
	)
}

/** Whether `name` (lowered) is an inert void element: never closed, `/>` allowed. */
function isVoid(params: { name: string }): boolean {
	return INERT_VOID_HTML_ELEMENTS.some((name) => name === params.name)
}

/** Whether `name` (lowered) is an inert element with a close: its tags must balance in their block or item. */
function isInert(params: { name: string }): boolean {
	return INERT_HTML_ELEMENTS.some((name) => name === params.name)
}
