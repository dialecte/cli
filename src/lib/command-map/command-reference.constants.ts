/** The folder of the command reference, from the package root: one page per listed command and an index. */
export const REFERENCE_FOLDER = 'doc/commands'

/** The index page of the reference, in its folder. */
export const REFERENCE_INDEX_FILE = 'index.md'

/** The extension of a reference page. */
export const PAGE_EXTENSION = '.md'

/** The package's oxfmt config, from its root: the pages are formatted as the package formats its files. */
export const REFERENCE_FORMAT_CONFIG = '.oxfmtrc.json'

/** The prefix of the folder the check formats the expected pages in. */
export const TEMPORARY_FOLDER_PREFIX = 'dialecte-reference-check-'

/** The characters markdown reads as formatting, escaped in a summary. */
export const MARKDOWN_SPECIAL_CHARACTERS = /[\\`*_[\]|]/g

/** The flag of the entry that checks the pages instead of writing them. */
export const CHECK_FLAG = '--check'

/** The title of the index page. */
export const REFERENCE_INDEX_TITLE = 'dialecte commands'

/** The line that opens a page's generated block. */
export const BLOCK_START =
	'<!-- dialecte-reference: generated from the command map by npm run doc:generate; edit the map, not this block -->'

/** The line that closes a page's generated block. */
export const BLOCK_END = '<!-- /dialecte-reference -->'

/** The heading of the renamed forms in the index. */
export const RENAMED_HEADING = '## Renamed in 1.0'

/** What the check and the generator print: `{path}` a page, `{count}` a number of pages. */
export const REFERENCE_LINES = {
	stale: '{path}: stale - run npm run doc:generate',
	missing: '{path}: missing - run npm run doc:generate',
	extra: '{path}: no listed command of that name - remove it or add the command to the map',
	fresh: 'doc/commands: {count} pages match the command map',
	written: 'doc/commands: {count} pages written from the command map',
} as const
