/** Endings dropped from a word, in order, with the shortest stem each leaves. */
export const STEM_SUFFIXES: readonly { ending: string; minimumStem: number }[] = [
	// a verb form keeps a stem of four letters: `copying` → `copy`, but `naming` stays (never `nam`, the noun)
	{ ending: 'ing', minimumStem: 4 },
	{ ending: 'ed', minimumStem: 4 },
	{ ending: 'es', minimumStem: 3 },
	{ ending: 's', minimumStem: 2 },
]

/** Words that say nothing about a need: dropped from the need and from what it is compared to. */
export const STOP_WORDS: ReadonlySet<string> = new Set([
	'a',
	'all',
	'an',
	'and',
	'as',
	'at',
	'be',
	'by',
	'do',
	'element',
	'for',
	'get',
	'from',
	'how',
	'i',
	'in',
	'into',
	'is',
	'it',
	'its',
	'me',
	'my',
	'need',
	'of',
	'on',
	'or',
	'the',
	'to',
	'that',
	'this',
	'we',
	'what',
	'which',
	'with',
])

/** The package that ships the engine: on a tie, a dialecte's business verb comes before it. */
export const CORE_PACKAGE_NAME = '@dialecte/core'
