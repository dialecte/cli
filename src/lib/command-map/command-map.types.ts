import type { COMMANDS } from '../../cli.constants.ts'
import type { RENAMED_FORMS } from './renamed.constants.ts'

/** The families the help groups the commands in, in the order it prints them. */
export type CommandFamily =
	| 'Discover'
	| 'Use'
	| 'Grow'
	| 'Check'
	| 'Hand over'
	| 'Workspace'
	| 'Maintain'

/** What the help says of one command. */
export type CommandEntry = {
	family: CommandFamily
	summary: string
	/** One line per verb and flag shape. */
	usage: string[]
	/** The exit codes that differ from the default (0 answer or green, 1 nothing found or a failed check, 2 usage or refused), one line each. */
	exitCodes: string[]
	example: string
	/** What the usage lines do, one short line each, printed under them. */
	notes?: string[]
}

/** The commands that answer only that they were renamed: no family, no help line. */
export type RenamedCommandName = 'record' | 'review' | 'recap'

/** The commands the help lists: every registered command but the renamed ones. */
export type ListedCommandName = Exclude<keyof typeof COMMANDS, RenamedCommandName>

/** What the map holds for a renamed command: the form that replaced it. */
export type RenamedEntry = { renamedTo: string }

/** The declared map: one entry per command of `COMMANDS`, a renamed one carrying only `renamedTo`. */
export type CommandMap = Record<ListedCommandName, CommandEntry> &
	Record<RenamedCommandName, RenamedEntry>

/** What the map says a command accepts, derived from its usage lines. */
export type CommandSurface = {
	name: string
	/** The bare words after the command name (`lot` -> finding, decide...), in first-seen order. */
	verbs: string[]
	/** Every `--name` of its usage lines (the zero-config flags expanded), unique, in first-seen order. */
	flags: string[]
}

/** One old form of a renamed command with its new one, words after `dialecte`. */
export type RenamedWords = { old: string; new: string }

/** One command of `dialecte --help --json`: its entry, its name and what it accepts. */
export type HelpJsonCommand = CommandEntry & { name: string; verbs: string[]; flags: string[] }

/** What `dialecte --help --json` prints. */
export type HelpJson = {
	commands: HelpJsonCommand[]
	renamed: RenamedWords[]
}

/** One old form of a renamed command: its words, and the `lot` verb that replaced it. */
export type RenamedForm = {
	command: RenamedCommandName
	/** The old verb, or undefined when the command had none. */
	verb?: string
	/** The verb of `lot` that replaced it. */
	lotVerb: string
}

/** One row of the declared table of the renamed forms, with its literal words. */
export type DeclaredRenamedForm = (typeof RENAMED_FORMS)[number]

/** The review rounds' verbs of `lot`, from the table of the renamed forms. */
export type ReviewRoundVerb = DeclaredRenamedForm['lotVerb']

/** The review rounds' verbs `runRecord` runs. */
export type RecordVerb = Extract<DeclaredRenamedForm, { command: 'record' }>['lotVerb']

/** What `dialecte <renamed command> --help --json` prints: each old form with its new one, words after `dialecte`. */
export type RenamedJson = { renamed: RenamedWords[] }
