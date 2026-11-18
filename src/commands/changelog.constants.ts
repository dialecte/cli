/** `dialecte changelog`: its verbs, usage and lines. */

export const CHANGELOG_VERBS = ['check', 'release'] as const

export const CHANGELOG_USAGE =
	'usage: dialecte changelog check [--base <revision>] | dialecte changelog release <x.y.z> [--date YYYY-MM-DD]'

/** The lines it prints; `{count}`, `{fragments}`, `{version}`, `{date}`, `{file}`, `{problem}`, `{value}` filled. */
export const CHANGELOG_LINES = {
	readable: 'changelog: {fragments}, every one readable',
	problem: 'changelog: {file}: {problem}',
	refused: 'changelog: {problem}',
	released: 'changelog: {version} - {date} written in CHANGELOG.md, {fragments} folded and deleted',
	unknownBase: '--base {value} names no commit of this repository',
} as const
