import type { QualityTree } from './quality.types.ts'

/** A body with fewer tokens cannot tell two functions apart: such a function is never matched by its body alone. */
export const MOVED_BODY_MIN_TOKENS = 20

/** How many attributes of one element two functions share before one reads like the other (a named set counts as this many). */
export const DUPLICATE_READ_MIN_ATTRIBUTES = 3

/** How a named set shows among the shared attributes: `@<name>`. */
export const NAMED_SET_KEY = '@{name}'

/** How many existing functions `api find` lists for an added one before its words are compared. */
export const DUPLICATE_FIND_LIMIT = 5

/** How many distinct words of an added function's name and summary an existing one must hold to read as the same need. */
export const DUPLICATE_FIND_MIN_WORDS = 2

/**
 * Words a function name holds whatever it does, never counted toward `DUPLICATE_FIND_MIN_WORDS`: the generic verbs
 * and the nouns every reader of files names (measured on this repository: `isSourceFilePath` and `listSourceFiles`,
 * `namesRoute` and `routeName`, `readQualityRecord` and `readRecord` shared only these besides one word).
 */
export const DUPLICATE_FIND_STOP_WORDS: readonly string[] = [
	'build',
	'check',
	'create',
	'file',
	'find',
	'has',
	'list',
	'make',
	'name',
	'parse',
	'path',
	'read',
	'run',
	'write',
]

/** The package an index of the existing source functions is named for in `api find`. */
export const EXISTING_SOURCE_PACKAGE = 'existing source'

/** A file of declared types: a change of one of its types is a change of the signatures naming it. */
export const TYPES_FILE_PATTERN = /\.types\.ts$/

/** The profile whose packages keep their doc pages in step with their public API. */
export const CONTRIBUTOR_PROFILE = 'contributor'

/** What separates the segments of a public route (`doc.query.info.of`). */
export const ROUTE_SEPARATOR = '.'

/** How many last segments of a route a page names it by: one alone (`of`) names too much. */
export const ROUTE_NAMING_SEGMENTS = 2

/** A doc page of a package: a Markdown file under `doc/`, or the README. */
export const DOC_PAGE_PATTERN = /^(?:doc\/.+\.md|README\.md)$/

/** A file whose aliases the resolvers read in the tree: a tsconfig, a Vite config. */
export const ALIAS_CONFIG_PATTERN = /(?:^|\/)(?:tsconfig[^/]*\.json|vite\.config\.[cm]?[jt]s)$/

/** The tree side of a `rules` run: the worktree, uncommitted work included. */
export const WORKTREE: QualityTree = { kind: 'worktree' }

/** Why a commit's base-aware findings were not judged: a read of it that failed. */
export const QUALITY_READ_FAILURES = {
	diff: 'the diff from {base} cannot be read',
	list: 'the files of {revision} cannot be listed',
	text: '{path} not read at {revision}',
} as const

/** The record of the last base-aware run on the change, in the worktree's git folder. */
export const QUALITY_RECORD_FILE = 'dialecte-quality.json'

/** The schema of `dialecte-quality.json`. */
export const QUALITY_RECORD_SCHEMA = 2

/** The findings of the base-aware rules, as `rules` prints them. */
export const QUALITY_MESSAGES = {
	duplicateRead: '`{name}` reads like `{existing}` ({at}): reuse it or say why',
	sharedExport: '`{name}` ({folder}) is used by {importers}: {changes}',
	docs: 'public `{route}` {change}: touch the doc page naming it ({pages}) or say why',
	noPage: 'no page names it yet',
} as const

/** The line saying where the base-aware rules stand: run since a base, or not run in a clone outside any lot. */
/** The notes a run adds under its quality line: a removed entry a page still names, an unknown public API, aliases changed. */
export const QUALITY_NOTES = {
	removed: 'public API: {route} removed: still named by {pages}',
	unknown: '! public API unknown ({why})',
	aliases: "aliases changed: base edges read with the tree's",
} as const

export const QUALITY_LINES = {
	since: 'quality: since {short} ({source})',
	noLot: 'quality: not run (no lot)',
} as const

/** The name of the card's `quality` row and section. */
export const QUALITY_CARD_NAME = 'quality'

/** How many findings of one kind the card's `quality` section lists before saying how many more. */
export const QUALITY_CARD_MAX_LINES = 10

/** The words of the card's `quality` row and section; `{short}` the record's base, `{count}` a number. */
export const QUALITY_CARD_TEXTS = {
	duplicates: 'duplicate read',
	sharedExports: 'shared export',
	changed: '{counted} changed',
	docs: 'public export',
	withoutDocs: '{counted} without docs: {routes}',
	allowed: '{count} allowed',
	nothing: 'nothing found',
	flag: '(since {short}, --base)',
	otherTree: 'record of another tree (dialecte rules)',
	listsOtherTree: 'lists: record of another tree (dialecte rules)',
	docsNever: 'docs: never run on this tree',
	docsOtherTree: 'docs: record of another tree',
	docsNotJudged: 'docs: not judged ({why})',
	more: '… {count} more (dialecte rules --base {short} --json)',
	place: '{place}  ',
} as const

/** The words of the change request body's quality lines, in the risk part; `{short}` the base, `{why}` a reason. */
export const QUALITY_BODY_TEXTS = {
	judged: 'Quality: {counts} (since {short})',
	notJudged: 'Quality: not judged ({why})',
	docsCount: '{counted} without docs',
	finding: '- {mark}{place}{message}',
	place: '{place} ',
	failed: '✗ ',
	noPackage: 'no package.json',
	unparsedPackage: 'package.json does not parse',
	noBase: 'base {base}: no such commit',
} as const

/** Where a quality line of the change request body comes from, as a refusal names it: the file holding it, or the notes. */
export const QUALITY_PIECE_NOTES = 'the quality notes'
