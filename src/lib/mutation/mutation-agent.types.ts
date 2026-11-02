import type { MUTANTS_VERBS } from './mutation.constants.ts'
import type { LedgerState, MutationFamily } from './mutation.types.ts'
import type { NodePath } from '@babel/traverse'

/** What a survivor's packet is built from: the ledger item, and the run entry that last reported it. */
export type PacketInput = {
	key: string
	line: number
	mutation: string
	lineHash: string
	/** `file:line:col-line:col`, columns from 0. */
	range?: string
	/** `<test file>#<test name>`, sorted. */
	tests?: readonly string[]
	/** The covering tests the run already left out of `tests`. */
	testsMore?: number
}

export type PacketSurvivor = {
	key: string
	line: number
	mutation: string
	range?: string
	/** The line's text now differs from the one the run reported (`hashLine` of the current line is not `lineHash`), or the file is gone. */
	lineChanged: boolean
	window: { lines: { line: number; text: string; mutated: boolean }[]; more: number }
	tests: string[]
	testsMore: number
	familyGuess: MutationFamily
	guessReason: string
	commands: { record: string; schedule: string }
}

export type JudgePacket = {
	file: string
	survivors: PacketSurvivor[]
	/** The pending survivors of the file the caps left out. */
	more: number
	/** One family for every survivor of the file: `dialecte mutants record --file <file> --family <family> --reason "<why no output can change>"`. */
	recordFile: string
}

export type ClassifyParams = {
	/** Package-relative. */
	file: string
	/** The file's current text; undefined when the file is gone. */
	source: string | undefined
	/** `"<Mutator>: <original> -> <replacement>"`. */
	mutation: string
	line: number
	/** `file:line:col-line:col`, columns from 0. */
	range?: string
}

export type FamilyGuess = { familyGuess: MutationFamily; guessReason: string }

export type RecordedItem = {
	key: string
	file: string
	line: number
	from: LedgerState
	to: LedgerState
}

export type RecordResult =
	| { ok: true; family: MutationFamily; items: RecordedItem[] }
	| { ok: false; reason: string }

export type DropResult = { ok: true } | { ok: false; reason: string }

/** What a `mutants` verb printing JSON adds after `{ "verb", "ok": true }`. */
export type VerbJsonFields = Readonly<Record<string, unknown>>

/** The arguments of `dialecte mutants record`. */
export type RecordArguments = {
	keys: string[]
	/** The value of each value option given, by name (`file`, `family`, `reason`). */
	values: Map<string, string>
	flags: Set<string>
}

/** A verb's options: those that take a value and the flags, by name (without `--`). */
export type VerbOptions = { values: readonly string[]; flags: readonly string[] }

/** A node of the syntax tree @babel/parser builds. */
export type SyntaxNode = NodePath['node']

/** A span of a source, as offsets: the start inclusive, the end exclusive. */
export type Span = { start: number; end: number }

/** A verb that prints one JSON object with `--json`: every `mutants` verb but `run`. */
export type MutantsJsonVerb = Exclude<(typeof MUTANTS_VERBS)[number], 'run'>
