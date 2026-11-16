/**
 * The forms of a path or a link no public text holds: a link (`https://`, `www.`), a path from the root, the home or
 * a parent (`/etc`, `~/x`, `../x`, `./x`, `(/etc)`), a drive path (`C:\x`, `C:/x`), a dot-folder path (`.dialecte/x`), a path of three segments (`a/b/c`) or
 * ending in a file name (`a/b.md`), a file and its line (`a.ts:12`, `Makefile:12`, `README:3`). `read/write`, `I/O`,
 * `2/3`, `v1.2`, `e.g.`, `3:30` and `profile:3` are none.
 */
export const PATH_OR_LINK_PATTERN = new RegExp(
	[
		'[a-z][a-z0-9+.-]*:\\/\\/',
		'\\bwww\\.\\w',
		'(?:^|[\\s(\\[{"\'`])(?:\\.{1,2}\\/|~\\/|\\/\\w|\\.\\w[\\w.-]*\\/)',
		'\\b[a-z]:[\\\\/]',
		'[\\w.-]+\\/[\\w.-]+\\/[\\w.-]+',
		'\\w\\/[\\w-]+\\.[a-z][a-z0-9]{0,4}\\b',
		'\\b[\\w-]+\\.[a-z][a-z0-9]{0,4}:\\d',
		'\\b(?:make|docker|jenkins|gem|rake|vagrant|brew|proc)file:\\d',
		'\\b(?:readme|license|changelog|contributing):\\d',
	].join('|'),
	'i',
)

/** The label of a path or a link, as a refusal names it (`holds a path or a link`). */
export const PATH_OR_LINK_LABEL = 'path or a link'

/** A lot verb's option holding what a public record never holds: `{label}` the rule's label, never the text. */
export const PUBLIC_TEXT_REFUSAL = 'lot {verb}: {option} holds a {label}: nothing written'

/** A word of a text, as plan entry ids are matched against it: letters, digits, `_` and inner `-` or `.`. */
export const WORD_PATTERN = /[A-Za-z0-9_]+(?:[-.][A-Za-z0-9_]+)*/g

/** Where a word splits into the parts a plan entry id is also matched against (`ci2a-lot`: `ci2a`, `lot`). */
export const WORD_PART_SEPARATOR = '-'

/** The label of a plan entry id, as a refusal names it (`holds a plan entry id`). */
export const PLAN_ENTRY_ID_LABEL = 'plan entry id'

/** A verb that could not read the lists its public-text check needs: `{reason}` why; nothing written. */
export const PUBLIC_TEXT_UNCHECKED_REFUSAL =
	'lot {verb}: {option} not checked: {reason}: nothing written'
