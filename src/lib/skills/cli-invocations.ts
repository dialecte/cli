/**
 * Verifies the cli invocations a skill page cites against the command map of the cli: read only in code (inline
 * spans and fences of any language, generated blocks left out), each invocation's command, verb and flags must
 * be ones the map holds; an old renamed form names its new one.
 */
import { closestNames } from '../closest-names.ts'
import { VERB_SHAPE_PATTERN } from '../command-map/command-map.constants.ts'
import { HELP_ASKING_FLAGS, HELP_FLAG, JSON_FLAG } from '../parse-invocation.constants.ts'
import {
	CITED_FLAG_PATTERN,
	CLI_WORDS,
	CLOSEST_LIMIT,
	COMMENT_START,
	DOUBLE_OPERATORS,
	END_OF_OPTIONS,
	GROUP_CLOSERS,
	GROUP_OPENERS,
	INVOCATION_MESSAGES,
	LINE_CONTINUATION_PATTERN,
	LIST_SEPARATOR,
	NPX_OPTIONS_WITH_VALUE,
	NPX_WORD,
	ENVIRONMENT_ASSIGNMENT_PATTERN,
	SUBSHELL_CLOSE,
	SUBSHELL_OPEN,
	FLAG_START,
	LONG_FLAG_PREFIX_PATTERN,
	NOT_LINE_BREAK_PATTERN,
	WHITESPACE_PATTERN,
	PLACEHOLDER_MARK,
	PROMPT_WORD,
	QUOTES,
	SINGLE_OPERATORS,
} from './cli-invocations.constants.ts'
import { GENERATED_BLOCK_PATTERN } from './generated-blocks.constants.ts'
import { ANY_FENCE_PATTERN, INLINE_CODE_PATTERN } from './skill-file.constants.ts'

import type { CommandSurface } from '../command-map/command-map.types.ts'
import type {
	CheckCliInvocationsParams,
	CodePiece,
	CodeToken,
	CodeWord,
	InvocationContext,
	PendingWord,
} from './cli-invocations.types.ts'
import type { SkillFinding } from './skill-file.types.ts'

/** One finding per invocation of code spans and fences that the cli's surface does not accept, by page line. */
export function checkCliInvocations(params: CheckCliInvocationsParams): SkillFinding[] {
	return citedInvocationsOf(params.markdown)
		.flatMap((words) =>
			checkInvocation({
				file: params.file,
				words,
				surface: params.surface,
				ignored: params.ignored,
			}),
		)
		.sort((left, right) => (left.line ?? 0) - (right.line ?? 0))
}

/**
 * The words after `dialecte` of every cli invocation a page cites in code, generated blocks left out: what the
 * check reads, and whether a page cites any.
 */
export function citedInvocationsOf(markdown: string): CodeWord[][] {
	return codeGroupsOf(blankGeneratedBlocks(markdown.replace(/\r\n/g, '\n'))).flatMap((group) =>
		invocationsOf(tokensOf(group)),
	)
}

/** The page with every generated block's text removed and its line breaks kept: line numbers stay true. */
function blankGeneratedBlocks(markdown: string): string {
	return markdown.replace(GENERATED_BLOCK_PATTERN, (block) => onlyLineBreaks(block))
}

function onlyLineBreaks(text: string): string {
	return text.replace(NOT_LINE_BREAK_PATTERN, '')
}

/** The code of the page: each fenced line with its continuations, then each inline code span of the prose. */
function codeGroupsOf(markdown: string): CodePiece[][] {
	const fenced = [...markdown.matchAll(ANY_FENCE_PATTERN)].flatMap((fence) =>
		fencedGroupsOf({ fence: fence[0], firstLine: lineAt({ markdown, index: fence.index }) }),
	)
	const prose = markdown.replace(ANY_FENCE_PATTERN, (fence) => onlyLineBreaks(fence))
	const inline = prose
		.split('\n')
		.flatMap((text, index) =>
			[...text.matchAll(INLINE_CODE_PATTERN)].map((span) => [{ text: span[1], line: index + 1 }]),
		)
	return [...fenced, ...inline]
}

/** The 1-based page line of an offset. */
function lineAt(params: { markdown: string; index: number }): number {
	return params.markdown.slice(0, params.index).split('\n').length
}

/** The lines inside a fence, a line ending in a backslash grouped with the next one. */
function fencedGroupsOf(params: { fence: string; firstLine: number }): CodePiece[][] {
	const lines = params.fence.split('\n').slice(1, -1)
	const groups: CodePiece[][] = []
	let continued: CodePiece[] | undefined
	lines.forEach((text, index) => {
		const continues = LINE_CONTINUATION_PATTERN.test(text)
		const piece = {
			text: text.replace(LINE_CONTINUATION_PATTERN, ''),
			line: params.firstLine + 1 + index,
		}
		const group = continued ?? []
		if (!continued) groups.push(group)
		group.push(piece)
		continued = continues ? group : undefined
	})
	return groups
}

/**
 * The words and operators of a group of code: a quoted string is one word; `&&`, `||`, `;`, `|`, `&`, a
 * backtick, `(` and `)` are operators except inside `<...>`, `[...]` or a flag group `(--a | --b)`; a `#`
 * starting a word comments out the rest of its line.
 */
function tokensOf(group: CodePiece[]): CodeToken[] {
	const tokens: CodeToken[] = []
	let depth = 0
	for (const piece of group) {
		const { text, line } = piece
		const pending: PendingWord = { text: '', quoted: false }
		for (let index = 0; index < text.length; index++) {
			const character = text[index]
			if (QUOTES.has(character)) {
				const closing = text.indexOf(character, index + 1)
				const end = closing === -1 ? text.length : closing + 1
				pending.text += text.slice(index, end)
				pending.quoted = true
				index = end - 1
				continue
			}
			if (WHITESPACE_PATTERN.test(character)) {
				flushWord({ tokens, pending, line })
				continue
			}
			if (depth === 0 && !pending.text && character === COMMENT_START) {
				tokens.push({ kind: 'operator', text: character, line })
				break
			}
			if (opensGroup({ text, index })) {
				depth++
				pending.text += character
				continue
			}
			if (depth > 0 && (GROUP_CLOSERS.has(character) || character === SUBSHELL_CLOSE)) {
				depth--
				pending.text += character
				continue
			}
			const operator = depth === 0 ? operatorAt({ text, index }) : undefined
			if (operator) {
				flushWord({ tokens, pending, line })
				tokens.push({ kind: 'operator', text: operator, line })
				index += operator.length - 1
				continue
			}
			pending.text += character
		}
		flushWord({ tokens, pending, line })
	}
	return tokens
}

/** Whether the character at an offset opens a placeholder or a group: `<`, `[`, or a `(` right before a flag. */
function opensGroup(params: { text: string; index: number }): boolean {
	const character = params.text[params.index]
	if (GROUP_OPENERS.has(character)) return true
	return character === SUBSHELL_OPEN && params.text[params.index + 1] === FLAG_START
}

/** Ends the word being read, if any: pushed as a token, the pending word emptied. */
function flushWord(params: { tokens: CodeToken[]; pending: PendingWord; line: number }): void {
	const { tokens, pending, line } = params
	if (pending.text) tokens.push({ kind: 'word', text: pending.text, line, quoted: pending.quoted })
	pending.text = ''
	pending.quoted = false
}

/** The shell operator starting at an offset of the text, if any. */
function operatorAt(params: { text: string; index: number }): string | undefined {
	const pair = params.text.slice(params.index, params.index + 2)
	if (DOUBLE_OPERATORS.has(pair)) return pair
	const single = params.text[params.index]
	return SINGLE_OPERATORS.has(single) ? single : undefined
}

/**
 * The words after `dialecte` (or `@dialecte/cli`) of every invocation: one per run of words between
 * operators that starts with it, after a prompt and `npx` with its options; nothing after a bare `--`.
 */
function invocationsOf(tokens: CodeToken[]): CodeWord[][] {
	const runs: CodeWord[][] = [[]]
	for (const token of tokens)
		if (token.kind === 'operator') runs.push([])
		else runs[runs.length - 1].push(token)
	return runs.flatMap((words) => {
		let index = words[0]?.text === PROMPT_WORD ? 1 : 0
		while (words[index] && ENVIRONMENT_ASSIGNMENT_PATTERN.test(words[index].text)) index++
		if (words[index]?.text === NPX_WORD) {
			index++
			while (words[index]?.text.startsWith(FLAG_START))
				index += NPX_OPTIONS_WITH_VALUE.has(words[index].text) ? 2 : 1
		}
		const start = words[index]
		if (!start || start.quoted || !CLI_WORDS.has(start.text)) return []
		const after = words.slice(index + 1)
		const end = after.findIndex((word) => !word.quoted && word.text === END_OF_OPTIONS)
		return [end === -1 ? after : after.slice(0, end)]
	})
}

/** The findings of one invocation: its command, then its verb, then each of its flags. */
function checkInvocation(context: InvocationContext): SkillFinding[] {
	const [first] = context.words
	if (!first || first.quoted || first.text.includes(PLACEHOLDER_MARK)) return []
	if (first.text.startsWith(FLAG_START)) return checkGlobalFlags(context)
	const command = context.surface.commands.find((candidate) => candidate.name === first.text)
	if (command) return checkCommand({ context, command })
	if (context.ignored.has(first.text)) return []
	return [renamedFinding(context) ?? unknownCommandFinding(context)]
}

/** The flags of an invocation without a command: only the help, and with it the help as JSON. */
function checkGlobalFlags(context: InvocationContext): SkillFinding[] {
	const accepted = helpFlagsAccepted(context.words)
	return citedFlagsOf(context.words)
		.filter(({ name }) => !accepted.includes(name))
		.filter(({ name, word }) => !isIgnored({ context, words: [name, word.text] }))
		.map(({ name, word }) =>
			findingAt({
				context,
				word,
				message:
					INVOCATION_MESSAGES.unknownGlobalFlag.replace('{cited}', name).replace('{word}', name) +
					closestFlagText({ name, form: '', flags: accepted, listed: 'globalFlagsListed' }),
			}),
		)
}

/** The help flags an invocation may carry: `--help`, and `--json` once the help is asked. */
function helpFlagsAccepted(words: CodeWord[]): string[] {
	const helpAsked = words.some((word) => !word.quoted && HELP_ASKING_FLAGS.includes(word.text))
	return helpAsked ? [HELP_FLAG, JSON_FLAG] : [HELP_FLAG]
}

/** The verb of a command that has verbs, then every flag against the command's own. */
function checkCommand(params: {
	context: InvocationContext
	command: CommandSurface
}): SkillFinding[] {
	const { context, command } = params
	const second = context.words[1]
	let verb: string | undefined
	if (
		command.verbs.length > 0 &&
		second &&
		!second.quoted &&
		VERB_SHAPE_PATTERN.test(second.text)
	) {
		if (command.verbs.includes(second.text)) verb = second.text
		else if (!context.ignored.has(second.text))
			return [unknownVerbFinding({ context, command, word: second })]
	}
	const accepted = new Set([...command.flags, ...helpFlagsAccepted(context.words)])
	const form = verb ? `${command.name} ${verb}` : command.name
	return citedFlagsOf(context.words.slice(1))
		.filter(({ name }) => !accepted.has(name))
		.filter(({ name, word }) => !isIgnored({ context, words: [name, word.text] }))
		.map(({ name, word }) =>
			findingAt({
				context,
				word,
				message:
					INVOCATION_MESSAGES.unknownFlag
						.replace('{cited}', `${form} ${name}`)
						.replace('{form}', form)
						.replace('{word}', name) +
					closestFlagText({ name, form: `${form} `, flags: command.flags, listed: 'flagsListed' }),
			}),
		)
}

/**
 * The `--` words of an invocation, each with the flag it cites; placeholders and quoted strings left out, a
 * flag whose value is quoted (`--at="a b"`) read by its name.
 */
function citedFlagsOf(words: CodeWord[]): Array<{ name: string; word: CodeWord }> {
	return words.flatMap((word) => {
		const unquoted = word.quoted ? word.text.slice(0, firstQuoteOf(word.text)) : word.text
		if (unquoted.includes(PLACEHOLDER_MARK)) return []
		const name = CITED_FLAG_PATTERN.exec(unquoted)?.[1]
		return name ? [{ name, word }] : []
	})
}

/** The offset of a word's first quote. */
function firstQuoteOf(text: string): number {
	return [...text].findIndex((character) => QUOTES.has(character))
}

/** The closest flag as a full form, or the flags listed when none is close. */
function closestFlagText(params: {
	name: string
	form: string
	flags: readonly string[]
	listed: 'flagsListed' | 'globalFlagsListed'
}): string {
	const closest = closestOf({
		word: withoutDashes(params.name),
		candidates: params.flags.map(withoutDashes),
	})
	if (closest !== undefined)
		return INVOCATION_MESSAGES.closest.replace('{form}', `${params.form}--${closest}`)
	return INVOCATION_MESSAGES[params.listed].replace('{list}', params.flags.join(LIST_SEPARATOR))
}

function withoutDashes(flag: string): string {
	return flag.replace(LONG_FLAG_PREFIX_PATTERN, '')
}

function unknownVerbFinding(params: {
	context: InvocationContext
	command: CommandSurface
	word: CodeWord
}): SkillFinding {
	const { context, command, word } = params
	const closest = closestOf({ word: word.text, candidates: command.verbs })
	return findingAt({
		context,
		word,
		message:
			INVOCATION_MESSAGES.unknownVerb
				.replace('{cited}', `${command.name} ${word.text}`)
				.replace('{command}', command.name)
				.replace('{word}', word.text) +
			(closest !== undefined
				? INVOCATION_MESSAGES.closest.replace('{form}', `${command.name} ${closest}`)
				: INVOCATION_MESSAGES.verbsListed.replace('{list}', command.verbs.join(LIST_SEPARATOR))),
	})
}

/** An old renamed form: the new form it names, or every form that replaced its command; undefined when it is none. */
function renamedFinding(context: InvocationContext): SkillFinding | undefined {
	const [first, second] = context.words
	const forms = context.surface.renamed.filter((form) => form.old.split(' ')[0] === first.text)
	if (forms.length === 0) return undefined
	const named = forms.find((form) => {
		const oldVerb = form.old.split(' ')[1]
		return oldVerb === undefined || (!second?.quoted && oldVerb === second?.text)
	})
	const sentences = (named ? [named] : forms).map((form) =>
		INVOCATION_MESSAGES.renamedForm.replace('{old}', form.old).replace('{new}', form.new),
	)
	return findingAt({
		context,
		word: first,
		message: named
			? sentences.join(LIST_SEPARATOR)
			: INVOCATION_MESSAGES.renamedCommand
					.replace('{cited}', first.text)
					.replace('{forms}', sentences.join(LIST_SEPARATOR)),
	})
}

function unknownCommandFinding(context: InvocationContext): SkillFinding {
	const [first] = context.words
	const closest = closestOf({
		word: first.text,
		candidates: context.surface.commands.map((command) => command.name),
	})
	return findingAt({
		context,
		word: first,
		message:
			INVOCATION_MESSAGES.unknownCommand
				.replace('{cited}', first.text)
				.replace('{word}', first.text) +
			(closest !== undefined
				? INVOCATION_MESSAGES.closest.replace('{form}', closest)
				: INVOCATION_MESSAGES.commandsListed),
	})
}

function closestOf(params: { word: string; candidates: readonly string[] }): string | undefined {
	return closestNames({ name: params.word, candidates: params.candidates, limit: CLOSEST_LIMIT })[0]
}

/** Whether the page's ignore directive names one of the words. */
function isIgnored(params: { context: InvocationContext; words: string[] }): boolean {
	return params.words.some((word) => params.context.ignored.has(word))
}

function findingAt(params: {
	context: InvocationContext
	word: CodeWord
	message: string
}): SkillFinding {
	return {
		file: params.context.file,
		severity: 'error',
		line: params.word.line,
		message: params.message,
	}
}
