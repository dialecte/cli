import {
	COMMENT_CLOSE,
	COMMENT_OPEN,
	COMMENT_SELF_CLOSING_PATTERN,
	COMMENT_START_PATTERN,
	LINE_BREAK_PATTERN,
	MARKDOWN_PARSER,
	NEUTRALISED_COMMENT_OPEN,
	SENTINEL_HEADING,
} from './changelog.constants.ts'

/**
 * The one reader of markdown block structure for the changelog modules: a CommonMark parser's block tokens, read with
 * their line ranges so every block is sliced from the author's own lines and the parser's output is never written.
 */
import type { MarkdownBlocks, MarkdownToken, UnclosedBlock } from './changelog.types.ts'

/**
 * The CommonMark blocks of `text`: its lines (split as the parser splits them), the block tokens of a parse copy where
 * every comment block that never closes is neutralised (a backslash before its `<!--`, so it hides nothing from a
 * reader that goes on; the text itself never changes), the line of the first HTML block, at any level, whose last
 * `<!--` has no `-->` after it (a rendered page hides everything after it), and the kind of a block that runs to the
 * end of the text (an unclosed fence, or an HTML block only its own close ends).
 *
 * @intent read a changelog text's block structure as CommonMark does
 * @internal
 */
export function readMarkdownBlocks(params: { text: string }): MarkdownBlocks {
	const lines = params.text.split(LINE_BREAK_PATTERN)
	const original = tokensOf({ lines })
	const neutral = neutralised({ lines, tokens: original })
	return {
		lines,
		tokens: neutral.tokens,
		unclosedComment: original.find(holdsUnclosedComment)?.map?.[0],
		unclosedBlock: unclosedBlockOf({ lines: neutral.lines }),
	}
}

/** The block tokens of `lines` joined with line feeds, as the readers use them. */
function tokensOf(params: { lines: readonly string[] }): MarkdownToken[] {
	return MARKDOWN_PARSER.parse(params.lines.join('\n'), {}).map(
		function tokenOf(token): MarkdownToken {
			return {
				type: token.type,
				level: token.level,
				nesting: token.nesting,
				markup: token.markup,
				map: token.map === null ? null : [token.map[0], token.map[1]],
				content: token.content,
			}
		},
	)
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

// dialecte-allow duplicate-read: a markdown token predicate, unrelated to review findings
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
function neutralised(params: { lines: readonly string[]; tokens: MarkdownToken[] }): {
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
		tokens = tokensOf({ lines })
	}
	return { lines, tokens }
}

// dialecte-allow duplicate-read: CommonMark blocks a parser leaves open, not the skills' generated-block markers
/**
 * The kind of a block that runs to the end of `lines`: they are parsed with a line break, an empty line and a sentinel
 * heading appended; when the sentinel is no top-level heading, the last top-level block swallowed it.
 */
function unclosedBlockOf(params: { lines: readonly string[] }): UnclosedBlock | undefined {
	const body = params.lines.at(-1) === '' ? params.lines.slice(0, -1) : [...params.lines]
	const tokens = tokensOf({ lines: [...body, '', SENTINEL_HEADING] })
	const sentinel = body.length + 1
	const read = tokens.some(
		(token) => token.type === 'heading_open' && token.level === 0 && token.map?.[0] === sentinel,
	)
	if (read) return undefined
	const last = tokens
		.filter((token) => token.level === 0 && token.nesting !== -1 && token.map)
		.at(-1)
	return last?.type === 'fence' ? 'fence' : 'html'
}
