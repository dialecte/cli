/** `lot pr`: the pull request a lot's records render, through the repository's one template. */

/** Where every dialecte repository keeps its pull request template. */
export const TEMPLATE_PATH = '.github/pull_request_template.md'

/** A template line the renderer fills: `<!-- dialecte:<part> -->` alone on its line. */
export const PART_MARKER_PATTERN = /^<!-- dialecte:([a-z]+) -->$/

/** Any template comment of the renderer (the header note included): never in a rendered body. */
export const RENDERER_COMMENT_PATTERN = /^<!-- dialecte[: ].*-->$/

/** The part whose template text a person owns once the pull request exists: kept from the current body. */
export const KEPT_PART = 'kept'

/** The parts the renderer fills; a template without all of them is no template of the renderer. */
export const FILLED_PARTS: readonly string[] = [
	'summary',
	'behaviours',
	'changelog',
	'tests',
	'review',
	'risk',
	'overlaps',
	'issue',
	'checklist',
]

/** A changelog fragment of the package (`changes/<name>.md`, a no-entry note included). */
export const FRAGMENT_PATTERN = /^changes\/[^/]+\.md$/

/** git's status letter of a path the lot's commits add. */
export const ADDED_STATUS = 'A'

/** The gate or contrib step that builds the documentation. */
export const DOCS_STEP = 'docs'

/** Why a template is not the renderer's: `{part}` the marker. */
export const TEMPLATE_FAULTS = {
	missing: 'missing marker {part}',
	twice: 'marker {part} twice',
	afterKept: 'marker {part} after kept',
} as const

/** A part whose record is missing: never a guess. */
export const NOT_RECORDED = 'not recorded'

export const BODY_LINES = {
	otherMessages: 'Also in this commit:',
	noEntry: 'No changelog entry: {reason}',
	issue: 'Closes #{issue}',
	noIssue: 'none named',
	tddCases: 'tdd: {count} ({statuses}) on {head}',
	tddStale: 'tdd: stale, taken on {head}, not the tree this pull request lands',
	gateTests:
		'gate ({mode}): {passed} of {total} tests passed, {failed} failed, {skipped} skipped, in {files} files on {head}',
	gateStale: 'gate ({mode}): stale, taken on {head}, not the tree this pull request lands',
	findingsHeader: '| Finding | Round | Severity | File | State |',
	findingsRule: '| --- | --- | --- | --- | --- |',
	noFindings: 'No finding.',
	fixedIn: 'fixed in round {round}',
	verdictsHeader: 'Verdicts:',
	risk: 'risk class {riskClass} · effort {effort}',
	noOverlaps: 'none',
	overlap: '- {lot}: {reason}',
} as const

/** The author's checklist, each box ticked from a record or left for the reviewer. */
export const CHECKLIST_LINES = {
	tests:
		'Tests: every case of the change answered by tdd on this tree (green, accepted, revised or unchanged), no gate failure recorded on it',
	changelog: 'Changelog: a fragment, or a no-entry note with its reason',
	docs: "Documentation: the gate's docs step passed",
	version: 'Version: bumped only by a release lot',
} as const

/** The tdd statuses a finished change may hold: every other one leaves the tests box for the reviewer. */
export const DONE_CASE_STATUSES: readonly string[] = ['green', 'accepted', 'revised', 'unchanged']

/** The record each piece of free text comes from, as a refusal names it. */
export const PIECE_RECORDS = {
	message: 'brief.json lots[{index}].message',
	summary: 'brief.json summary',
	stepTitle: 'brief.json steps[{index}].title',
	behaviour: 'brief.json steps[{index}].behaviours[{behaviour}]',
	changelog: '{file}',
	overlap: 'overlaps.jsonl',
} as const

/** The label of a path no public body holds (a link, or a path the lot's tree does not hold). */
export const PRIVATE_PATH_LABEL = 'path outside the tree or a link'

/** A link: a scheme or `www.`; never a path of the tree. */
export const LINK_PATTERN = /^[a-z][a-z0-9+.-]*:\/\/|^www\./i

/** What separates the tokens of a text, as its paths are looked up. */
export const TOKEN_SEPARATOR_PATTERN = /\s+/

/** A line end of a text another system wrote (`\r\n`): read as `\n`. */
export const CRLF_PATTERN = /\r\n/g

/** A whitespace-delimited token, stripped of the punctuation around it, as a path is looked up. */
export const TOKEN_TRIM_PATTERN = /^[`'"([{<]+|[`'")\]}>.,;:!?]+$/g

export const PULL_REQUEST_LINES = {
	noTemplateFile: "the lot's head holds no {template}: copy the cli's template into the repository",
	worktreeGone: 'the worktree {worktree} is gone: nothing rendered',
	noTemplate:
		"{template} is not the renderer's template ({fault}): copy the cli's template into the repository",
	refused:
		'the pull request text holds a {label}{word} in {record}: rewrite that record, nothing sent',
	unreadBrief: '{brief}: {reason}: nothing sent',
	unchecked: 'the pull request text is not checked: {reason}: nothing sent',
} as const
