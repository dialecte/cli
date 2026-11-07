/** What a command renamed in 1.0 answers: its new name and the full new command, or every form that replaced it. */
import { LOT_COMMAND } from '../review-rounds/review-rounds.constants.ts'
import { shellQuote } from '../shell-quote.ts'
import { COMMAND_MAP, SECTION_INDENT, USAGE_PREFIX } from './command-map.constants.ts'
import {
	RENAMED_COMMAND_LINE,
	RENAMED_FORMS,
	RENAMED_LINE,
	SHELL_SAFE_WORD_PATTERN,
} from './renamed.constants.ts'

import type {
	DeclaredRenamedForm,
	RenamedCommandName,
	RenamedJson,
	RenamedWords,
} from './command-map.types.ts'

/**
 * The answer to an old form: `renamed: dialecte <old words> is now dialecte <new words>`, then the new command
 * with the same arguments (its usage line when there are none); without an old verb it names, every form that
 * replaced the command.
 */
export function answerRenamed(params: { command: RenamedCommandName; argv: string[] }): string {
	const named = namedForm(params)
	if (!named)
		return [
			RENAMED_COMMAND_LINE.replace('{command}', params.command),
			...formsOf(params.command).map(
				(form) =>
					`${SECTION_INDENT}${USAGE_PREFIX}${oldWordsOf(form)} → ${USAGE_PREFIX}${newWordsOf(form)}`,
			),
		].join('\n')
	const { form, words } = named
	const newWords = newWordsOf(form)
	const command = words.length
		? [`${USAGE_PREFIX}${newWords}`, ...words.map(shellWord)].join(' ')
		: (COMMAND_MAP.lot.usage.find((line) => line.startsWith(`${USAGE_PREFIX}${newWords}`)) ??
			`${USAGE_PREFIX}${newWords}`)
	return [
		RENAMED_LINE.replace('{old}', oldWordsOf(form)).replace('{new}', newWords),
		`${SECTION_INDENT}${command}`,
	].join('\n')
}

/** `dialecte <renamed command> [verb] --help --json`: the old forms it names with their new ones, words after `dialecte`. */
export function renamedJson(params: { command: RenamedCommandName; argv: string[] }): string {
	const named = namedForm(params)
	const forms = named ? [named.form] : formsOf(params.command)
	const json: RenamedJson = {
		renamed: forms.map(renamedWordsOf),
	}
	return JSON.stringify(json, null, 2)
}

/** Every old form with its new one, words after `dialecte`, in the table's order. */
export function allRenamedWords(): RenamedWords[] {
	return RENAMED_FORMS.map(renamedWordsOf)
}

/** One old form with its new one, words after `dialecte`. */
function renamedWordsOf(form: DeclaredRenamedForm): RenamedWords {
	return { old: oldWordsOf(form), new: newWordsOf(form) }
}

/** Whether a registered name is one of the commands renamed in 1.0. */
export function isRenamedCommand(name: string): name is RenamedCommandName {
	return RENAMED_FORMS.some((form) => form.command === name)
}

/** The renamed forms of a command, in the table's order. */
function formsOf(command: RenamedCommandName): DeclaredRenamedForm[] {
	return RENAMED_FORMS.filter((form) => form.command === command)
}

/** The old form the words name, with the words after it; undefined when they name no old verb of the command. */
function namedForm(params: {
	command: RenamedCommandName
	argv: string[]
}): { form: DeclaredRenamedForm; words: string[] } | undefined {
	const [verb, ...rest] = params.argv
	const form = formsOf(params.command).find(
		(candidate) => !('verb' in candidate) || candidate.verb === verb,
	)
	if (!form) return undefined
	return { form, words: 'verb' in form ? rest : params.argv }
}

/** The old words of a form after `dialecte`. */
function oldWordsOf(form: DeclaredRenamedForm): string {
	return 'verb' in form ? `${form.command} ${form.verb}` : form.command
}

/** The new words of a form after `dialecte`. */
function newWordsOf(form: DeclaredRenamedForm): string {
	return `${LOT_COMMAND} ${form.lotVerb}`
}

/** A word as the shell needs it: bare when it reads as itself, quoted otherwise. */
function shellWord(word: string): string {
	return SHELL_SAFE_WORD_PATTERN.test(word) ? word : shellQuote(word)
}
