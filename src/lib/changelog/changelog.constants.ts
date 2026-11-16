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
 * The changed files that ask for a fragment: a visible change edits them (the help, the README and the command
 * pages). An entry ending with `/` is a folder: every file under it asks.
 */
export const FRAGMENT_ASKING_FILES: readonly string[] = [
	'README.md',
	'doc/commands/',
	'src/lib/command-map/command-map.constants.ts',
]

/** The check of a change: `{file}` the first changed file asking for a fragment. */
export const FRAGMENT_CHECK_LINES = {
	missing:
		'{file} changed with no changelog fragment: write changes/<lot>.md, or changes/<lot>.none.md saying why no entry',
	noFolder: 'no changes/ folder: the package keeps no changelog fragments',
	fragment: 'a changelog fragment: {files}',
	note: 'no changelog entry: {reason}',
	nothingAsked: 'no README or help change: no fragment asked',
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

/** A link reference definition (`[0.7.0]: https://...`): the block at a changelog's end. */
export const LINK_REFERENCE_PATTERN = /^\[[^\]]+\]:\s/

/** A code fence line: headings inside a fence are text. */
export const CODE_FENCE_PATTERN = /^\s*(```|~~~)/

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
