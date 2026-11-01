/**
 * Whether a test case is new or changed since the base: its file is new; or the test call that defines it
 * is not in the base file as it is now; or a title of its name is written as a string in the file now and
 * was not at the base (a row added to a table, a renamed describe). A title the file computes (`%s`, a
 * template) is judged by its call alone. Without a location, any change to the file counts. And whether a
 * case is provably one of the base, whatever its call now: what a `revised` entry may declare without a red.
 */
import { CASE_NAME_SEPARATOR } from './tdd.constants.ts'
import { listTestCalls, testCallTextAt } from './test-source.ts'

import type { ChangedTestFile, SourceLocation, TestCall } from './tdd.types.ts'

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
 * The base provably holds the case: its file exists at the base, and no title of its name written as a
 * string now is missing from it (no row added, no describe renamed). When its own title (the last of its
 * name) is the literal title of an `it` / `test` call at the base or now, the base holds a test call naming
 * the case (that title, a describe path naming its other titles) and the file now holds no more of them:
 * a test moved to another describe, or a second one of that title, is not proof. Otherwise (a table row, a
 * computed title) its own title is written as a string at the base and no more times now (a new test
 * reusing a title of the base elsewhere makes every case of that title unprovable). A title the file
 * computes and the base does not write is not proof.
 */
export function isCaseOfBase(params: { file: ChangedTestFile; name: string }): boolean {
	const { text, baseText } = params.file
	if (baseText === undefined) return false
	const titles = params.name.split(CASE_NAME_SEPARATOR)
	if (!holdsOwnTitle({ file: params.file.file, text, baseText, titles })) return false
	return !titles.some(
		(title) => isWrittenAsString({ text, title }) && !isWrittenAsString({ text: baseText, title }),
	)
}

/**
 * The base holds the case's own title, no more times now than there: as test calls naming the case when
 * the title is a literal test title at the base or now, else as string literals.
 */
function holdsOwnTitle(params: {
	file: string
	text: string
	baseText: string
	titles: readonly string[]
}): boolean {
	const { file, text, baseText, titles } = params
	const ownTitle = titles.at(-1) ?? ''
	const baseCalls = listTestCalls({ text: baseText, file })
	const calls = listTestCalls({ text, file })
	const isTestTitle = [...baseCalls, ...calls].some((call) => !call.each && call.title === ownTitle)
	if (isTestTitle) {
		const namingAtBase = baseCalls.filter((call) => namesCase({ call, titles })).length
		const namingNow = calls.filter((call) => namesCase({ call, titles })).length
		return namingAtBase > 0 && namingNow <= namingAtBase
	}
	const writtenAtBase = countWrittenAsString({ text: baseText, title: ownTitle })
	return writtenAtBase > 0 && countWrittenAsString({ text, title: ownTitle }) <= writtenAtBase
}

/**
 * The test call names the case: its literal title is the case's own (an `.each` title is a format), and
 * each describe around it names the matching title of the case (a computed describe title matches any).
 */
function namesCase(params: { call: TestCall; titles: readonly string[] }): boolean {
	const { call, titles } = params
	if (call.each || call.title !== titles.at(-1)) return false
	if (call.describePath.length !== titles.length - 1) return false
	return call.describePath.every((title, index) => title === undefined || title === titles[index])
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
