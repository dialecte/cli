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

/** The heading the entries of the next release stand under, as a release writes it. */
export const UNRELEASED_HEADING = '## [Unreleased]'

/** A link reference definition (`[0.7.0]: https://...`): the block at a changelog's end. */
export const LINK_REFERENCE_PATTERN = /^\[[^\]]+\]:\s/

/** A version a release names: `x.y.z`, a pre-release suffix allowed. */
export const RELEASE_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

/** A release date: `YYYY-MM-DD`. */
export const RELEASE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * The elements a changelog block or item may hold as bare tags (no attribute): text-level elements that act on nothing
 * outside themselves, and `details` / `summary`, whose hidden part stays inside them.
 */
export const INERT_HTML_ELEMENTS = [
	'b',
	'i',
	'u',
	's',
	'em',
	'strong',
	'small',
	'mark',
	'del',
	'ins',
	'sub',
	'sup',
	'code',
	'kbd',
	'samp',
	'var',
	'details',
	'summary',
] as const

/** The void elements a changelog block or item may hold: no close, `<br/>` allowed. */
export const INERT_VOID_HTML_ELEMENTS = ['br', 'wbr'] as const

/** What is wrong with a fragment; `{heading}`, `{section}`, `{levels}` and `{piece}` filled. */
export const FRAGMENT_PROBLEMS = {
	unknownHeading: `heading "### {heading}" is no section: ${CHANGELOG_SECTIONS.join(', ')}`,
	looseText: 'text before the first section heading',
	emptySection: 'section {section} holds no text',
	noSection: 'holds no section',
	repeatedSection: 'section {section} appears twice',
	emptyNote: 'a no-entry note holds no reason',
	unclosedComment: 'an HTML comment opens and never closes',
	unclosedFence: 'a code fence opens and never closes',
	unclosedHtml: 'an HTML block opens and never closes',
	tooDeep: 'it nests deeper than the {levels} levels the markdown reader reads',
	openHtml: `HTML \`{piece}\` is not a whole comment or a balanced bare tag of its block or item (${[...INERT_HTML_ELEMENTS, ...INERT_VOID_HTML_ELEMENTS].map((name) => `<${name}>`).join(', ')}); put code in backticks`,
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

/** A bullet item opening with a breaking marker: a bold `Breaking` (any case), or the plain `Breaking:` form. */
export const BREAKING_ITEM_PATTERN = /^- (?:\*\*Breaking\b|Breaking(?: \([^)]*\))?:)/i

/** The line ends a markdown parser splits a text on: CRLF, a lone CR, LF. */
export const LINE_BREAK_PATTERN = /\r\n?|\n/

/** An HTML comment's opener. */
export const COMMENT_OPEN = '<!--'

/** An HTML comment's close. */
export const COMMENT_CLOSE = '-->'

/** A comment that closes on its own opener: `<!-->` and `<!--->`. */
export const COMMENT_SELF_CLOSING_PATTERN = /^<!---?>/

/** An HTML block that starts with a comment opener. */
export const COMMENT_START_PATTERN = /^\s*<!--/

/** A comment opener read as text in the parse copy: a backslash escapes it. */
export const NEUTRALISED_COMMENT_OPEN = '\\<!--'

/** The heading appended to a parse copy to find a block that runs to the end of the text. */
export const SENTINEL_HEADING = '# end of text'

/** A version heading's markup as the parser reports it: a level-2 ATX heading. */
export const VERSION_HEADING_MARKUP = '##'

/** A section heading's markup as the parser reports it: a level-3 ATX heading. */
export const SECTION_HEADING_MARKUP = '###'

/** The bullet marker of the only list a release cuts into items. */
export const MOVABLE_BULLET_MARKUP = '-'

/** An Unreleased heading's text, as changelogs write it: `[Unreleased]`, `Unreleased`, `UNRELEASED`. */
export const UNRELEASED_TITLE_PATTERN = /^\[?unreleased\]?$/i

/** A version heading's text opens with a bracketed token: `[0.13.2] - 2026-11-10`, `[60]`. */
export const VERSION_TITLE_PATTERN = /^\[/

/** A version heading's bracketed token: `0.13.2` in `[0.13.2] - 2026-11-10`. */
export const VERSION_TITLE_KEY_PATTERN = /^\[([^\]]+)\]/

/** The CommonMark preset the changelog readers parse with: its block rules, html blocks on. */
export const MARKDOWN_PRESET = 'commonmark'

/** The bare tag a changelog block may hold: `<name>`, `</name>` or a void's `<name/>`, white space before `>`. */
export const BARE_TAG_PATTERN = /^<(\/?)([A-Za-z][A-Za-z0-9]*)[\t\n\f\r ]*(\/?)>/

/** A comment end a browser reads that a whole comment never holds. */
export const COMMENT_BANG_CLOSE = '--!>'

/** The longest refused HTML piece a problem shows, the cut's `…` counted. */
export const SHOWN_HTML_LENGTH = 60
