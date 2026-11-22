/** Changelog fragments (`changes/<name>.md`) and the release fold into `CHANGELOG.md`. */

/** The folder each lot writes its changelog fragment in, at the package root. */
export const FRAGMENTS_FOLDER = 'changes'

/** The changelog every release writes, at the package root. */
export const CHANGELOG_FILE = 'CHANGELOG.md'

/** A fragment's extension: only these files of the folder are fragments (a `.gitkeep` is not). */
export const FRAGMENT_EXTENSION = '.md'

/** A no-entry note's extension: `changes/<name>.none.md` says why a visible change has no changelog entry. */
export const NO_ENTRY_EXTENSION = '.none.md'

/**
 * The changed files that ask for a fragment in every package: a visible change edits them (the README, the pages under
 * `doc/`). A package adds its own (`dialecte.changelog.asking`). An entry ending with `/` is a folder: every file under
 * it asks.
 */
export const FRAGMENT_ASKING_FILES: readonly string[] = ['README.md', 'doc/']

/** The package.json field a package lists its own fragment-asking files in. */
export const FRAGMENT_ASKING_FIELD = 'dialecte.changelog.asking'

/** The package.json field that holds `asking`: an object when given. */
export const FRAGMENT_CHANGELOG_FIELD = 'dialecte.changelog'

/** A path git never names a changed file by: `./`, `../` or `.` segments, `//`, a backslash, a glob. */
export const NOT_A_GIT_PATH_PATTERN = /(^|\/)\.{1,2}(\/|$)|\/\/|\\|[*?[\]{}]/

/** The check of a change: `{file}` the first changed file asking for a fragment. */
export const FRAGMENT_CHECK_LINES = {
	missing:
		'{file} changed with no changelog fragment: write changes/<lot>.md, or changes/<lot>.none.md saying why no entry',
	noFolder: 'no changes/ folder: the package keeps no changelog fragments',
	fragment: 'a changelog fragment: {files}',
	note: 'no changelog entry: {reason}',
	nothingAsked: 'no README, doc/ or listed file changed: no fragment asked',
	badChangelog: '{field} in package.json is not an object: write { "asking": [<paths>] }',
	badAskingList: '{field} in package.json is not a list of paths',
	badAskingEntries:
		'{field} in package.json holds {entries}: git names a changed file by a path relative to the package with / separators - no leading ./ or /, no ../, ./ or // inside, no backslash, no spaces around, no glob',
	release: 'a release (CHANGELOG.md edited): its version section answers the change',
	problem: '{file}: {problem}',
	unreadable: 'the change since {base} cannot be read: {reason}',
	noBase: 'no base to read the change against: nothing judged',
} as const

/** The changelog's sections, in the order a release writes them (Keep a Changelog). */
export const CHANGELOG_SECTIONS = [
	'Added',
	'Changed',
	'Deprecated',
	'Removed',
	'Fixed',
	'Security',
] as const

/** A section heading line: `### <name>`. */
export const SECTION_HEADING_PATTERN = /^### (.+?)\s*$/

/** The heading the entries of the next release stand under, as a release writes it. */
export const UNRELEASED_HEADING = '## [Unreleased]'

/** The Unreleased heading as changelogs write it: `## [Unreleased]`, `## Unreleased`, `## UNRELEASED`. */
export const UNRELEASED_HEADING_PATTERN = /^## \[?unreleased\]?\s*$/i

/** Any version heading: `## [<version>]`, with its date or not. */
export const VERSION_HEADING_PATTERN = /^## \[/

/** A version heading's bracketed token: `0.13.2` in `## [0.13.2] - 2026-11-10`, `60` in `## [60]`. */
export const VERSION_KEY_PATTERN = /^## \[([^\]]+)\]/

/** A link reference definition (`[0.7.0]: https://...`): the block at a changelog's end. */
export const LINK_REFERENCE_PATTERN = /^\[[^\]]+\]:\s/

/** A code fence line: headings inside a fence are text. */
export const CODE_FENCE_PATTERN = /^\s*(`{3,}|~{3,})/

/** A version a release names: `x.y.z`, a pre-release suffix allowed. */
export const RELEASE_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

/** A release date: `YYYY-MM-DD`. */
export const RELEASE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** What is wrong with a fragment; `{heading}` and `{section}` filled. */
export const FRAGMENT_PROBLEMS = {
	unknownHeading: `heading "### {heading}" is no section: ${CHANGELOG_SECTIONS.join(', ')}`,
	looseText: 'text before the first section heading',
	emptySection: 'section {section} holds no text',
	noSection: 'holds no section',
	repeatedSection: 'section {section} appears twice',
	emptyNote: 'a no-entry note holds no reason',
	unclosedComment: 'an HTML comment opens and never closes',
} as const

/** Why a release fold is refused; `{version}` filled. */
export const FOLD_REFUSALS = {
	released: `${CHANGELOG_FILE} already holds version {version}`,
	nothing: 'nothing to release: no fragment and no Unreleased entry',
	unreleased: 'the Unreleased part of CHANGELOG.md: {problem}',
	noChangelog: `no ${CHANGELOG_FILE} in the package`,
	leftover:
		'{file} could not be deleted ({reason}): delete it before the next release, its entries are released',
} as const

/**
 * The released-changelog findings and notes: `{version}` the section's version, `{base}` the base named (the base
 * branch, or a short commit id), `{what}` the lines added, removed or reordered, `{value}` a release base given.
 */
export const RELEASED_CHANGELOG_LINES = {
	changed:
		'[{version}] differs from {base}: {what} (a released section stays as released: restore it, and write new entries under [Unreleased] or in changes/<lot>.md)',
	removed: "[{version}] removed from {base}'s release (restore it)",
	duplicated: '[{version}] appears twice (keep one)',
	added: '{count} line added',
	addedMany: '{count} lines added',
	removedLine: '{count} line removed',
	removedLines: '{count} lines removed',
	reordered: 'lines reordered',
	notJudged: 'released-changelog: no base branch, not judged',
	unknownBase: 'DIALECTE_RELEASE_BASE is no full commit id this repository holds: {value}',
} as const

/** The blob id a release changelog reading writes for a `CHANGELOG.md` a revision does not hold. */
export const NO_BLOB = 'none'

/** Between the notes of one changelog row (the released sections', the fragment's). */
export const CHANGELOG_NOTE_SEPARATOR = '; '

/** A CRLF line end: a changelog is read with LF line ends. */
export const CRLF_PATTERN = /\r\n/g

/** A top-level bullet item's first line: the only list item a release moves. */
export const BULLET_ITEM_PATTERN = /^- /

/** A bullet item opening with a breaking marker: a bold `Breaking` (any case), or the plain `Breaking:` form. */
export const BREAKING_ITEM_PATTERN = /^- (?:\*\*Breaking\b|Breaking(?: \([^)]*\))?:)/i

/** A line opening an HTML comment block (CommonMark: at most three spaces before it); up to its close, one block. */
export const HTML_COMMENT_OPEN_PATTERN = /^ {0,3}<!--/

/** The length of `<!--`, the opener the pattern ends with. */
export const HTML_COMMENT_OPEN_LENGTH = 4

/** The open state of a comment in the line reader, apart from a fence's marker. */
export const COMMENT_STATE = 'comment'

/** What closes an HTML comment. */
export const HTML_COMMENT_CLOSE = '-->'

/** Where the close is looked for on the opening line, past the opener's `<!`: `<!-->` already closes the comment. */
export const HTML_COMMENT_CLOSE_FROM = 2

/** A column-0 line that ends a list item instead of continuing it lazily: a fence, an ATX heading, a quote, a rule. */
export const ITEM_INTERRUPT_PATTERN = /^(?:```|~~~|#{1,6}(?:\s|$)|>|(?:-{3,}|\*{3,}|_{3,})\s*$)/
