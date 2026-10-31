/**
 * Whether a test case is new or changed since the base: its file is new; or the test call that defines it
 * is not in the base file as it is now; or a title of its name is written as a string in the file now and
 * was not at the base (a row added to a table, a renamed describe). A title the file computes (`%s`, a
 * template) is judged by its call alone. Without a location, any change to the file counts. And whether a
 * case is provably one of the base, whatever its call now: what a `revised` entry may declare without a red.
 */
import { CASE_NAME_SEPARATOR } from './tdd.constants.ts'
import { testCallTextAt } from './test-source.ts'

import type { ChangedTestFile, SourceLocation } from './tdd.types.ts'

export function isCaseOfChange(params: {
	file: ChangedTestFile
	name: string
	location: SourceLocation | undefined
}): boolean {
	const { text, baseText } = params.file
	if (baseText === undefined) return true
	if (!params.location) return text !== baseText
	const call = testCallTextAt({ text, file: params.file.file, location: params.location })
	if (call === undefined || !baseText.includes(call)) return true
	return params.name
		.split(CASE_NAME_SEPARATOR)
		.some(
			(title) =>
				isWrittenAsString({ text, title }) && !isWrittenAsString({ text: baseText, title }),
		)
}

/**
 * The base provably holds the case: its file exists at the base, its own title (the last of its name) is
 * written as a string there and no more times now than there (a new test reusing a title of the base
 * elsewhere makes every case of that title unprovable), and no title of its name written as a string now
 * is missing from it (no row added, no describe renamed). A title the file computes and the base does not
 * write is not proof.
 */
export function isCaseOfBase(params: { file: ChangedTestFile; name: string }): boolean {
	const { text, baseText } = params.file
	if (baseText === undefined) return false
	const titles = params.name.split(CASE_NAME_SEPARATOR)
	const ownTitle = titles.at(-1) ?? ''
	const writtenAtBase = countWrittenAsString({ text: baseText, title: ownTitle })
	if (writtenAtBase === 0 || countWrittenAsString({ text, title: ownTitle }) > writtenAtBase)
		return false
	return !titles.some(
		(title) => isWrittenAsString({ text, title }) && !isWrittenAsString({ text: baseText, title }),
	)
}

/** The title is a string literal of the text: `'title'`, `"title"` or `` `title` ``. */
export function isWrittenAsString(params: { text: string; title: string }): boolean {
	return countWrittenAsString(params) > 0
}

/** How many string literals of the text are the title. */
function countWrittenAsString(params: { text: string; title: string }): number {
	const escaped = params.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	return params.text.match(new RegExp(`(['"\`])${escaped}\\1`, 'g'))?.length ?? 0
}
