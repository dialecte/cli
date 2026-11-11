import type { CliProcessRun } from './forged-cli-run.types.ts'

/** What a command is given that holds the forged value, and what its row asserts. */
export type PrintRow = {
	/** The words after the command's name (the verb first, for a verb's row): a forged argument that reaches a refusal or a usage line at once. */
	argv: readonly string[]
	/** Whether that refusal quotes the forged value: its escaped form must then show in what is printed. */
	quotes: boolean
	/** Why the refusal quotes nothing; stated by every row with `quotes: false`. */
	reason?: string
	/** The same invocation as JSON, for a row whose usage line has `--json` and whose refusal answers JSON: the parsed text must hold the forged value as written. */
	json?: readonly string[]
	/** Why there is no JSON form although the usage line has `--json`. */
	noJson?: string
	/** The row runs in a scratch repository of its own (its invocation may write there). */
	isolated?: boolean
	/** The row's cli gets `DIALECTE_STANDARD` naming a scratch root of its own that holds one decoy standard: the host's standards folder is never read and the forged `--standard` value is quoted as unknown. */
	emptyStandard?: boolean
}

/** A row beside the derived ones: a print of the cli itself, run with its complete argument list and environment. */
export type FixedRow = PrintRow & {
	title: string
	env?: Readonly<Record<string, string>>
}

/** One row the table derives from the command map: its key, the command, its verb when it has one, whether its usage line has `--json`. */
export type RowKey = {
	key: string
	name: string
	verb: string | undefined
	hasJson: boolean
}

/** What one scheduled run needs: the key it reports under, the row, the cli's arguments and environment. */
export type ScheduledRow = {
	key: string
	row: PrintRow
	argv: readonly string[]
	jsonArgv: readonly string[] | undefined
	env: Readonly<Record<string, string>> | undefined
}

/** One row's runs: its text form, and its JSON form when the row has one. */
export type RowRuns = {
	key: string
	row: PrintRow
	text: CliProcessRun
	json: CliProcessRun | undefined
}

/** What the table found, every field empty when each command prints safely. */
export type PrintTableReport = {
	/** Rows (a command, or a verb of a command) of the map with no row. */
	missingRows: string[]
	/** Rows naming nothing of the map. */
	staleRows: string[]
	/** Rows with `quotes: false` that state no reason. */
	missingReasons: string[]
	/** Rows whose usage line has `--json` and that hold neither a JSON form nor a reason for none. */
	jsonUnaccounted: string[]
	/** Rows whose process was killed at its time bound. */
	timedOut: string[]
	/** Each row with the faults of its text: raw unsafe characters and forged lines. */
	faults: Record<string, string[]>
	/** Rows that quote the forged value but whose text does not show its escaped form. */
	notShown: string[]
	/** Each row whose JSON is no JSON or does not hold the forged value as written, with why. */
	jsonFaults: Record<string, string>
}
