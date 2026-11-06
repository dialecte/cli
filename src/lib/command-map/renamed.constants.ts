/**
 * The commands renamed in 1.0: the one place that cites their old forms, and the one table of the review
 * rounds' verbs. Each old form answers with its new name (exit 2, nothing run) until 2.0.
 */
import type { RenamedForm } from './command-map.types.ts'

/**
 * Every old form with the `lot` verb that replaced it, in the order the help names them. The `lot` verb is
 * also what the verb prints first (`lot <verb>: ...`); the old verb is the word `runRecord` and `runReview`
 * still read.
 */
export const RENAMED_FORMS = [
	{ command: 'record', verb: 'review', lotVerb: 'finding' },
	{ command: 'record', verb: 'decision', lotVerb: 'decide' },
	{ command: 'record', verb: 'snapshot', lotVerb: 'snapshot' },
	{ command: 'record', verb: 'choice', lotVerb: 'choice' },
	{ command: 'record', verb: 'standard', lotVerb: 'standard' },
	{ command: 'review', verb: 'delta', lotVerb: 'delta' },
	{ command: 'recap', lotVerb: 'recap' },
] as const satisfies readonly RenamedForm[]

/** The first line a renamed form answers: `{old}`, `{new}` its words after `dialecte`. */
export const RENAMED_LINE = 'renamed: dialecte {old} is now dialecte {new}'

/** The first line a renamed command answers when no old verb of it was named: `{command}`. */
export const RENAMED_COMMAND_LINE =
	'renamed: dialecte {command} is now under dialecte lot (an old form answers this until 2.0):'

/** A word the shell reads as itself, written bare in the new command; a leading `=` is expanded by zsh. */
export const SHELL_SAFE_WORD_PATTERN = /^[\w@%+:,./-][\w@%+=:,./-]*$/

/** The exit code of every renamed answer: refused, nothing run. */
export const RENAMED_EXIT_CODE = 2
