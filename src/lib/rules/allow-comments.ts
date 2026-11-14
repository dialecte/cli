import {
	ALLOW_COMMENT_PATTERN,
	ALLOW_KEYWORD,
	ALLOW_PROBLEMS,
	ALLOW_REASON_MIN_LENGTH,
	FUNCTION_WIDE_RULES,
	INVALID_ALLOW_MESSAGE,
	UNUSED_ALLOW_MESSAGE,
	UNUSED_ALLOW_WHERE,
} from './allow-comments.constants.ts'
import { ALLOWABLE_RULES } from './check-code-rules.constants.ts'
import { compareFindings } from './findings-order.ts'

import ts from 'typescript'

import type { AllowComment, AllowedCounts } from './allow-comments.types.ts'
import type { RuleFinding, RuleName } from './check-code-rules.types.ts'

/**
 * The opt-out comments of a module's text, read from its comments only (never from a string literal), on the syntax
 * tree given (else one parsed here); none at once when the text never names the keyword.
 */
export function readAllowComments(params: {
	text: string
	sourceFile?: ts.SourceFile
}): AllowComment[] {
	const { text } = params
	if (!text.includes(ALLOW_KEYWORD)) return []
	const sourceFile =
		params.sourceFile ?? ts.createSourceFile('module.ts', text, ts.ScriptTarget.Latest, true)
	return commentRangesOf({ sourceFile }).flatMap((range) =>
		allowCommentsOfRange({ sourceFile, range }),
	)
}

/**
 * The findings left once the opt-outs have silenced what they cover, with an `invalid-allow` error for each
 * malformed opt-out and an `unused-allow` warning for each that covers nothing (a rule that did not run, as `ranRules`
 * tells, is never judged unused), and how many findings each rule had silenced.
 */
export function applyAllowComments(params: {
	file: string
	text: string
	findings: readonly RuleFinding[]
	ranRules?: ReadonlySet<RuleName>
	/** The syntax tree of `text` the rules already built: read again, not parsed again. */
	sourceFile?: ts.SourceFile
}): { findings: RuleFinding[]; allowed: AllowedCounts } {
	const { file, text } = params
	const ranRules: ReadonlySet<string> | undefined = params.ranRules
	const comments = readAllowComments({
		text,
		...(params.sourceFile !== undefined && { sourceFile: params.sourceFile }),
	})
	const valid = comments.filter((comment) => comment.problem === undefined)
	const used = new Map<AllowComment, Set<string>>(valid.map((comment) => [comment, new Set()]))
	const allowed: AllowedCounts = {}
	const kept: RuleFinding[] = []
	for (const finding of params.findings) {
		const covering = valid.filter((comment) => covers({ comment, finding }))
		for (const comment of covering) used.get(comment)?.add(finding.rule)
		if (covering.length === 0) kept.push(finding)
		else allowed[finding.rule] = (allowed[finding.rule] ?? 0) + 1
	}
	const invalid = comments.flatMap((comment) =>
		comment.problem === undefined
			? []
			: [
					commentFinding({
						file,
						comment,
						rule: 'invalid-allow',
						severity: 'error',
						message: INVALID_ALLOW_MESSAGE.replace('{problem}', comment.problem),
					}),
				],
	)
	const unused = valid.flatMap((comment) => {
		const names = comment.rules.filter(
			(rule) => !used.get(comment)?.has(rule) && (ranRules === undefined || ranRules.has(rule)),
		)
		if (names.length === 0) return []
		return [
			commentFinding({
				file,
				comment,
				rule: 'unused-allow',
				severity: 'warning',
				message: UNUSED_ALLOW_MESSAGE.replace('{names}', quotedList(names)).replace(
					'{where}',
					names.some((name) => FUNCTION_WIDE_RULES.some((rule) => rule === name))
						? UNUSED_ALLOW_WHERE.function
						: UNUSED_ALLOW_WHERE.line,
				),
			}),
		]
	})
	return { findings: [...kept, ...invalid, ...unused].sort(compareFindings), allowed }
}

/**
 * Whether a well-formed opt-out silences the finding: its rule named, on the finding's line or the one before it; for
 * a function-wide rule, also anywhere in the comments right before the function (above or inside its doc comment).
 */
function covers(params: { comment: AllowComment; finding: RuleFinding }): boolean {
	const { comment, finding } = params
	if (!comment.rules.includes(finding.rule)) return false
	if (comment.afterCode) return comment.line === finding.line
	if (comment.line === finding.line || comment.line + 1 === finding.line) return true
	return (
		FUNCTION_WIDE_RULES.includes(finding.rule) &&
		finding.functionLine !== undefined &&
		comment.nextCodeLine === finding.functionLine
	)
}

/** Every comment of the module once: the trivia before and after each token. */
function commentRangesOf(params: { sourceFile: ts.SourceFile }): ts.CommentRange[] {
	const { sourceFile } = params
	const text = sourceFile.getFullText()
	const ranges = new Map<number, ts.CommentRange>()
	function collect(node: ts.Node): void {
		for (const range of [
			...(ts.getLeadingCommentRanges(text, node.getFullStart()) ?? []),
			...(ts.getTrailingCommentRanges(text, node.getFullStart()) ?? []),
			...(ts.getTrailingCommentRanges(text, node.getEnd()) ?? []),
		])
			ranges.set(range.pos, range)
		for (const child of node.getChildren(sourceFile)) collect(child)
	}
	collect(sourceFile)
	return [...ranges.values()].sort((left, right) => left.pos - right.pos)
}

/** The opt-outs of one comment: each of its lines whose text starts with the keyword. */
function allowCommentsOfRange(params: {
	sourceFile: ts.SourceFile
	range: ts.CommentRange
}): AllowComment[] {
	const { sourceFile, range } = params
	const text = sourceFile.getFullText()
	const start = sourceFile.getLineAndCharacterOfPosition(range.pos)
	const lineStart = sourceFile.getPositionOfLineAndCharacter(start.line, 0)
	const afterCode = text.slice(lineStart, range.pos).trim() !== ''
	const nextCodeLine = nextCodeLineOf({ sourceFile, position: range.end })
	const body =
		range.kind === ts.SyntaxKind.SingleLineCommentTrivia
			? text.slice(range.pos + 2, range.end)
			: text.slice(range.pos + 2, range.end - 2)
	return body.split('\n').flatMap((line, index) => {
		const match = ALLOW_COMMENT_PATTERN.exec(line.replace(/^\s*\*?\s*/, '').trimEnd())
		if (!match) return []
		return [
			{
				line: start.line + 1 + index,
				afterCode: index === 0 && afterCode,
				nextCodeLine,
				...partsOf(match.groups?.rest ?? ''),
			},
		]
	})
}

/** The 1-based line of the first token after the comments and blanks from `position` on. */
function nextCodeLineOf(params: { sourceFile: ts.SourceFile; position: number }): number {
	const { sourceFile } = params
	const text = sourceFile.getFullText()
	const comments = ts.getLeadingCommentRanges(text, params.position) ?? []
	const blanks = /\s*/y
	blanks.lastIndex = comments.at(-1)?.end ?? params.position
	blanks.exec(text)
	return sourceFile.getLineAndCharacterOfPosition(blanks.lastIndex).line + 1
}

/** The rules, reason and problem of what follows the keyword. */
function partsOf(rest: string): Pick<AllowComment, 'rules' | 'reason' | 'problem'> {
	const colon = rest.indexOf(':')
	if (colon === -1) return { rules: [], reason: '', problem: ALLOW_PROBLEMS.noColon }
	const rules = rest
		.slice(0, colon)
		.split(',')
		.map((name) => name.trim())
	const reason = rest.slice(colon + 1).trim()
	if (rules.some((name) => name === '')) return { rules, reason, problem: ALLOW_PROBLEMS.noRule }
	const allowable: readonly string[] = ALLOWABLE_RULES
	const refused = rules.filter((name) => !allowable.includes(name))
	if (refused.length)
		return {
			rules,
			reason,
			problem: ALLOW_PROBLEMS.notAllowable.replace('{names}', quotedList(refused)),
		}
	if (reason.length < ALLOW_REASON_MIN_LENGTH)
		return { rules, reason, problem: ALLOW_PROBLEMS.shortReason }
	return { rules, reason, problem: undefined }
}

/** A finding at the opt-out's line, first column. */
function commentFinding(params: {
	file: string
	comment: AllowComment
	rule: RuleName
	severity: RuleFinding['severity']
	message: string
}): RuleFinding {
	const { file, comment, rule, severity, message } = params
	return { file, line: comment.line, column: 1, rule, severity, message }
}

/** `a`, `b` as `` `a`, `b` ``. */
function quotedList(names: readonly string[]): string {
	return names.map((name) => `\`${name}\``).join(', ')
}
