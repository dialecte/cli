/**
 * Whether a test case is new or changed since the base: its file is new; or the test call that defines it
 * is not in the base file as it is now; or a title of its name is written as a string in the file now and
 * was not at the base (a row added to a table, a renamed describe). A title the file computes (`%s`, a
 * template) is judged by its call alone. Without a location, any change to the file counts.
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

/** The title is a string literal of the text: `'title'`, `"title"` or `` `title` ``. */
export function isWrittenAsString(params: { text: string; title: string }): boolean {
	const escaped = params.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	return new RegExp(`(['"\`])${escaped}\\1`).test(params.text)
}
