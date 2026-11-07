import type { CommandSurface, RenamedWords } from '../command-map/command-map.types.ts'

/** What a cli accepts: its commands with their verbs and flags, and its renamed forms. */
export type CliSurface = {
	commands: CommandSurface[]
	renamed: RenamedWords[]
}

/** The answer of `readCliSurface`: the surface, or why the invocations cannot be checked. */
export type CliSurfaceAnswer = { surface: CliSurface } | { unavailable: string }

export type CheckCliInvocationsParams = {
	/** Path shown in findings. */
	file: string
	markdown: string
	surface: CliSurface
	/** The tokens of the page's `<!-- dialecte-skills ignore: ... -->`. */
	ignored: ReadonlySet<string>
}

/** A piece of code read for invocations: one inline code span, or one fenced line (with its continuations). */
export type CodePiece = { text: string; line: number }

/** A word of a piece of code, at its page line; a quoted word is never checked. */
export type CodeWord = { kind: 'word'; text: string; line: number; quoted: boolean }

/** A shell operator or a comment start: it ends the invocation before it. */
export type CodeOperator = { kind: 'operator'; text: string; line: number }

export type CodeToken = CodeWord | CodeOperator

/** What one invocation is checked with: its words after `dialecte`, the page's surface and ignore tokens. */
export type InvocationContext = {
	file: string
	words: CodeWord[]
	surface: CliSurface
	ignored: ReadonlySet<string>
}

/** The word the tokenizer is reading: its characters so far, and whether it holds a quoted string. */
export type PendingWord = { text: string; quoted: boolean }
