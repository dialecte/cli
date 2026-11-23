/** `lot describe`: the change request a lot's records render, through the repository's one template. */
import { STATION_VERDICTS } from '../events/station-event.constants.ts'
import { VERIFY_VERDICT } from '../review-rounds/review-record.constants.ts'
import { SEVERITY_SPELLINGS } from '../review-rounds/review-rounds.constants.ts'
import { ORCHESTRATOR_SIGNER } from '../store/signer-rules.constants.ts'

import type { GateRecordMode } from '../gate-records/gate-records.types.ts'
import type { CaseStatus } from '../tdd/tdd.types.ts'

/** How the template paths a refusal names are joined. */
export const TEMPLATE_PATHS_JOIN = ' or '

/** A template line the renderer fills: `<!-- dialecte:<part> -->` alone on its line. */
export const PART_MARKER_PATTERN = /^<!-- dialecte:([a-z]+) -->$/

/** Any template comment of the renderer (the header note included): never in a rendered body. */
export const RENDERER_COMMENT_PATTERN = /^<!-- dialecte[: ].*-->$/

/** The part whose template text a person owns once the change request exists: kept from the current body. */
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
	'depends',
	'issue',
	'checklist',
]

/** A changelog fragment of the package (`changes/<name>.md`, a no-entry note included). */
export const FRAGMENT_PATTERN = /^changes\/[^/]+\.md$/

/** git's status letter of a path the lot's commits add. */
export const ADDED_STATUS = 'A'

/** The index a lot's name starts with (`<index>-<repository>-<branch>`). */
export const LOT_INDEX_OF_NAME = /^(\d+)-/

/** The gate or contrib step that builds the documentation. */
export const DOCS_STEP = 'docs'

/** Why a template is not the renderer's: `{part}` the marker. */
export const TEMPLATE_FAULTS = {
	missing: 'missing marker <!-- dialecte:{part} -->',
	twice: 'marker {part} twice',
	afterKept: 'marker {part} after kept',
} as const

/** The body an earlier `lot land` wrote before the template rendered it: nobody's text, replaced whole. */
export const PLACEHOLDER_BODY_PATTERN =
	/^Lot \S+\. The full suite runs on CI; the merge queue lands it\.(?:\n\nIts other commit lots:(?:\n- .+)+)?$/

/** A part whose record is missing: never a guess. */
export const NOT_RECORDED = 'not recorded'

export const BODY_LINES = {
	otherMessages: 'Also in this commit:',
	noEntry: 'No changelog entry: {reason}',
	issue: 'Closes #{issue}',
	dependsOn: '#{number}',
	noIssue: 'none named',
	tddCases: 'tdd: {count} ({statuses}) on {head}',
	tddStale: 'tdd: stale, taken on {head}, not the tree this {changeRequestNoun} lands',
	gateTests:
		'gate ({mode}): {passed} of {total} tests passed, {failed} failed, {skipped} skipped, in {files} files on {head}',
	gateStale: 'gate ({mode}): stale, taken on {head}, not the tree this {changeRequestNoun} lands',
	findingsHeader: '| Finding | Round | Severity | File | State |',
	findingsRule: '| --- | --- | --- | --- | --- |',
	noFindings: 'No finding.',
	fixedIn: 'fixed in round {round}',
	verdictsHeader: 'Verdicts:',
	design: 'Design: {state}{by}',
	designBy: ' by {kind}',
	risk: 'risk class {riskClass} · effort {effort}',
	noOverlaps: 'none',
	noGate: 'gate: not recorded, CI is the proof',
	unindexedLot: 'another lot',
	overlap: '- {index}: {reason}',
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

/** Who gave a verdict, as the body names them: by kind, never a person's name. */
export const REVIEWER_KINDS = {
	verify: 'verify',
	orchestrator: ORCHESTRATOR_SIGNER,
	person: 'person',
} as const

/** The tree the body's quality judges: the committed head, uncommitted work ignored. */
export const HEAD_TREE = { kind: 'revision', revision: 'HEAD' } as const

/** The record each piece of free text comes from, as a refusal names it. */
export const PIECE_RECORDS = {
	message: 'brief.json lots[{index}].message',
	summary: 'brief.json summary',
	stepTitle: 'brief.json steps[{index}].title',
	behaviour: 'brief.json steps[{index}].behaviours[{behaviour}]',
	overlap: 'overlaps.jsonl',
	review: 'review.jsonl',
	tests: 'tests.json',
} as const

/** The label of a path no public body holds (a link, or a path the lot's tree does not hold). */
export const PRIVATE_PATH_LABEL = 'path outside the tree or a link'

/** A link: a scheme or `www.`; never a path of the tree. */
export const LINK_PATTERN = /^[a-z][a-z0-9+.-]*:\/\/|^www\./i

/** What separates the tokens of a text, as its paths are looked up. */
export const TOKEN_SEPARATOR_PATTERN = /\s+/

/** A line end of a text another system wrote (`\r\n`): read as `\n`. */
export const CRLF_PATTERN = /\r\n/g

/** A path that leaves the tree: absolute, home, drive, or climbing out through `..`. */
export const OUTSIDE_TREE_PATTERN = /^(?:\/|~\/|[a-z]:[\\/])|(?:^|\/)\.\.(?:\/|$)/i

/** A whitespace-delimited token, stripped of the punctuation around it, as a path is looked up. */
export const TOKEN_TRIM_PATTERN = /^[`'"([{<]+|[`'")\]}>.,;:!?]+$/g

export const CHANGE_REQUEST_LINES = {
	unreadBase: 'the base {base} cannot be read here: fetch it, or name a base this repository holds',
	titleVersion:
		'the title "{title}" does not name {version}, the version this lot sets: correct lots[0].message with dialecte lot brief {lot} --from <brief.json> --by <who> --reason <why>',
	noTemplateFile:
		"the lot's head holds no {templates}: copy the cli's template into the repository",
	worktreeGone: 'the worktree {worktree} is gone: nothing rendered',
	noTemplate:
		"{template} is not the renderer's template ({fault}): copy the cli's template into the repository",
	refused:
		'the {changeRequestNoun} text holds a {label}{word} in {record}: rewrite that record, nothing sent',
	unreadBrief: '{brief}: {reason}: nothing sent',
	unchecked: 'the {changeRequestNoun} text is not checked: {reason}: nothing sent',
	keptMissing:
		"the {changeRequestNoun} body holds text the render would drop (no '{heading}' heading): move it under that heading or clear it, nothing sent",
	recordValue: '{record} holds a {field} its writer never writes: fix that record, nothing sent',
} as const

/** The gate record modes a `tests.json` gate part holds: any other value is no gate's. */
export const RECORD_GATE_MODES = [
	'fast',
	'full',
	'release',
	'hook',
	'hook-gate',
	'contrib',
] as const satisfies readonly GateRecordMode[]

/** The case statuses a `tests.json` tdd part counts: any other key is no tdd's. */
export const RECORD_CASE_STATUSES = [
	'red',
	'green',
	'unchanged',
	'accepted',
	'revised',
	'missing receipt',
	'test edited after red',
] as const satisfies readonly CaseStatus[]

/** The severities a finding row holds: the option forms `lot finding` takes (`should-fix`, never `should fix`). */
export const ROW_SEVERITIES: readonly string[] = Object.keys(SEVERITY_SPELLINGS).filter(
	(severity) => !severity.includes(' '),
)

/** The verdicts a verdict row holds: a review station's vocabulary, and `lot verify`'s. */
export const ROW_VERDICTS: readonly string[] = [...STATION_VERDICTS, VERIFY_VERDICT]
