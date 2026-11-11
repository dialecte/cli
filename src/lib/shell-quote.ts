import { SHELL_PLAIN_WORD } from './shell-quote.constants.ts'

/** One shell word, whatever it holds. */
export function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`
}

/** `value` as one shell word: as it reads when the shell takes it unquoted, else quoted. */
export function shellWord(value: string): string {
	return SHELL_PLAIN_WORD.test(value) ? value : shellQuote(value)
}
