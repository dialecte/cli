/**
 * The forms of a path or a link no public text holds: a link (`https://`, `www.`), a path from the root, the home or
 * a parent (`/etc`, `~/x`, `../x`, `./x`, `(/etc)`), a drive path (`C:\x`), a path of three segments (`a/b/c`) or
 * ending in a file name (`a/b.md`), a file and its line (`a.ts:12`, `Makefile:12`). `read/write`, `I/O`, `2/3`,
 * `v1.2`, `e.g.` and `3:30` are none.
 */
export const PATH_OR_LINK_PATTERN = new RegExp(
	[
		'[a-z][a-z0-9+.-]*:\\/\\/',
		'\\bwww\\.\\w',
		'(?:^|[\\s(\\[{"\'`])(?:\\.{1,2}\\/|~\\/|\\/\\w)',
		'\\b[a-z]:\\\\',
		'[\\w.-]+\\/[\\w.-]+\\/[\\w.-]+',
		'\\w\\/[\\w-]+\\.[a-z][a-z0-9]{0,4}\\b',
		'\\b[\\w-]+\\.[a-z][a-z0-9]{0,4}:\\d',
		'\\b[a-z]+file:\\d',
	].join('|'),
	'i',
)

/** The label of a path or a link, as a refusal names it (`holds a path or a link`). */
export const PATH_OR_LINK_LABEL = 'path or a link'

/** A lot verb's option holding what a public record never holds: `{label}` the rule's label, never the text. */
export const PUBLIC_TEXT_REFUSAL = 'lot {verb}: {option} holds a {label}: nothing written'
