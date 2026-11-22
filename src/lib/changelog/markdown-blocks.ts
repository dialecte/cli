/**
 * The one reader of markdown block structure for the changelog modules: a CommonMark parser's block tokens, read with
 * their line ranges so every block is sliced from the author's own lines and the parser's output is never written.
 */
import {
	COMMENT_CLOSE,
	COMMENT_OPEN,
	COMMENT_SELF_CLOSING_PATTERN,
	COMMENT_START_PATTERN,
	LINE_BREAK_PATTERN,
	MARKDOWN_PRESET,
	MOVABLE_BULLET_MARKUP,
	NEUTRALISED_COMMENT_OPEN,
	SENTINEL_HEADING,
} from './changelog.constants.ts'
import { refusedHtmlOf } from './html-scan.ts'

import markdownIt from 'markdown-it'

import type { MarkdownBlocks, MarkdownToken, UnclosedBlock } from './changelog.types.ts'
import type { MarkdownIt } from 'markdown-it'

/**
 * The CommonMark blocks of `text`: its lines (split as the parser splits them), the block tokens of a parse copy where
 * every comment block that never closes is neutralised (a backslash before its `<!--`, so it hides nothing from a
 * reader that goes on; the text itself never changes), the line of the first HTML block, at any level, whose last
 * `<!--` has no `-->` after it (a rendered page hides everything after it), and the kind of a block that runs to the
 * end of the text (an unclosed fence, an HTML block only its own close ends, or a nesting deeper than the parser reads).
 * With none of these, a block or item (what a release moves: each item of a top-level `- ` list, every other top-level
 * block) holding raw HTML other than whole comments and balanced bare inert tags is `open-html`, `openHtml` the
 * refused piece of the first such unit in text order. `scanHtml: false` (a reader that never refuses) skips that scan.
 *
 * @intent read a changelog text's block structure as CommonMark does
 * @internal
 */
export function readMarkdownBlocks(params: { text: string; scanHtml?: boolean }): MarkdownBlocks {
	const parser = createParser()
	const lines = params.text.split(LINE_BREAK_PATTERN)
	const original = tokensOf({ parser, lines })
	const neutral = neutralised({ parser, lines, tokens: original })
	const unclosedComment = original.find(holdsUnclosedComment)?.map?.[0]
	const unclosedBlock = unclosedBlockOf({ parser, lines: neutral.lines })
	const openHtml =
		params.scanHtml !== false && unclosedComment === undefined && unclosedBlock === undefined
			? firstRefusedHtml({ tokens: original })
			: undefined
	return {
		lines,
		tokens: neutral.tokens,
		unclosedComment,
		unclosedBlock: unclosedBlock ?? (openHtml === undefined ? undefined : 'open-html'),
		openHtml,
		maxNesting: parser.options.maxNesting ?? 0,
	}
}

/**
 * Whether a top-level token opens the one list a release cuts into items: a `- ` bullet list.
 *
 * @intent tell the list whose items a changelog release moves one by one
 * @internal
 */
export function isMovableList(params: { token: MarkdownToken }): boolean {
	return params.token.type === 'bullet_list_open' && params.token.markup === MOVABLE_BULLET_MARKUP
}

/** The refused raw HTML of the first unit in text order whose pieces are not inert. */
function firstRefusedHtml(params: { tokens: readonly MarkdownToken[] }): string | undefined {
	for (const pieces of unitPiecesOf(params)) {
		const refused = refusedHtmlOf({ pieces })
		if (refused !== undefined) return refused
	}
	return undefined
}

/**
 * The raw HTML pieces of each unit a release moves, in token order: a level-0 token that does not close starts a unit,
 * and inside a movable list each level-1 item does.
 */
function unitPiecesOf(params: { tokens: readonly MarkdownToken[] }): string[][] {
	const units: string[][] = []
	let movable = false
	for (const token of params.tokens) {
		if (token.level === 0 && token.nesting !== -1) {
			movable = isMovableList({ token })
			units.push([])
		} else if (movable && token.level === 1 && token.type === 'list_item_open') units.push([])
		units.at(-1)?.push(...token.html)
	}
	return units
}

/** The parser: CommonMark's block rules with html blocks on; only its `parse` is used. */
function createParser(): MarkdownIt {
	return markdownIt(MARKDOWN_PRESET)
}

/** The block tokens of `lines` joined with line feeds, as the readers use them. */
function tokensOf(params: { parser: MarkdownIt; lines: readonly string[] }): MarkdownToken[] {
	return params.parser
		.parse(params.lines.join('\n'), {})
		.map(function tokenOf(token): MarkdownToken {
			return {
				type: token.type,
				level: token.level,
				nesting: token.nesting,
				markup: token.markup,
				map: token.map === null ? null : [token.map[0], token.map[1]],
				content: token.content,
				html:
					token.type === 'html_block'
						? [token.content]
						: (token.children ?? [])
								.filter((child) => child.type === 'html_inline')
								.map((child) => child.content),
			}
		})
}

/** An HTML block whose last `<!--` has no `-->` after it (`<!-->` and `<!--->` close themselves). */
function holdsUnclosedComment(token: MarkdownToken): boolean {
	if (token.type !== 'html_block') return false
	const opened = token.content.lastIndexOf(COMMENT_OPEN)
	if (opened === -1) return false
	const rest = token.content.slice(opened)
	return (
		!COMMENT_SELF_CLOSING_PATTERN.test(rest) && !rest.includes(COMMENT_CLOSE, COMMENT_OPEN.length)
	)
}

/** A comment block that starts with `<!--` and holds no `-->`: the one the parse copy neutralises. */
function isOpenCommentBlock(token: MarkdownToken): boolean {
	return (
		token.type === 'html_block' &&
		COMMENT_START_PATTERN.test(token.content) &&
		!COMMENT_SELF_CLOSING_PATTERN.test(token.content.trimStart()) &&
		!token.content.includes(COMMENT_CLOSE)
	)
}

/**
 * The parse copy's lines and tokens: each open comment block's first `<!--` gets a backslash, then the copy is parsed
 * again, until none is left (one round per opener).
 */
function neutralised(params: {
	parser: MarkdownIt
	lines: readonly string[]
	tokens: MarkdownToken[]
}): {
	lines: string[]
	tokens: MarkdownToken[]
} {
	const lines = [...params.lines]
	let tokens = params.tokens
	for (
		let open = tokens.find(isOpenCommentBlock);
		open !== undefined;
		open = tokens.find(isOpenCommentBlock)
	) {
		const at = open.map?.[0] ?? 0
		lines[at] = (lines[at] ?? '').replace(COMMENT_OPEN, NEUTRALISED_COMMENT_OPEN)
		tokens = tokensOf({ parser: params.parser, lines })
	}
	return { lines, tokens }
}

/**
 * The kind of a block that runs to the end of `lines`: they are parsed with a line break, an empty line and a sentinel
 * heading appended; when the sentinel is no top-level heading, the last top-level block swallowed it, or the text
 * nests deeper than the parser reads.
 */
function unclosedBlockOf(params: {
	parser: MarkdownIt
	lines: readonly string[]
}): UnclosedBlock | undefined {
	const body = params.lines.at(-1) === '' ? params.lines.slice(0, -1) : [...params.lines]
	const tokens = tokensOf({ parser: params.parser, lines: [...body, '', SENTINEL_HEADING] })
	const sentinel = body.length + 1
	const read = tokens.some(
		(token) => token.type === 'heading_open' && token.level === 0 && token.map?.[0] === sentinel,
	)
	if (read) return undefined
	const last = tokens
		.filter((token) => token.level === 0 && token.nesting !== -1 && token.map)
		.at(-1)
	// a fence or an HTML block swallowed the sentinel; anything else stopped at the parser's nesting limit
	if (last?.type === 'fence') return 'fence'
	return last?.type === 'html_block' ? 'html' : 'nesting'
}
