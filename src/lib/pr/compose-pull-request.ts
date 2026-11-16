/**
 * The pure half of `lot pr`: a lot's pull request text composed from its read records through the repository's one
 * template. No file, git or host read here (`pull-request-sources.ts` gathers). The body is the lot's final state:
 * each part from the record as it stands, "not recorded" for a record missing, never a guess.
 */
import { counted } from '../counted.ts'
import { SHORT_SHA_LENGTH } from '../gate-records/gate-records.constants.ts'
import {
	BODY_LINES,
	CHECKLIST_LINES,
	DONE_CASE_STATUSES,
	FILLED_PARTS,
	KEPT_PART,
	NOT_RECORDED,
	PART_MARKER_PATTERN,
	RENDERER_COMMENT_PATTERN,
} from './pull-request.constants.ts'

import type { FindingRow, ReviewerOf, VerdictRow } from '../review-rounds/review-record.types.ts'
import type { TestsRecordGate, TestsRecordTdd } from '../tdd/tests-record.types.ts'
import type { PullRequestSources, PullRequestText } from './pull-request.types.ts'

/** The title and body of the lot, or the refusal of a template that is not the renderer's. */
export function composePullRequest(params: {
	template: string
	sources: PullRequestSources
	/** A person's part of the current body (`keptTextOf`); the template's own when undefined. */
	kept: string | undefined
}): PullRequestText | { refusal: string } {
	const missing = missingMarkerOf(params.template)
	if (missing !== undefined) return { refusal: `missing marker ${missing}` }
	const lines = params.template.replace(/\r\n/g, '\n').split('\n')
	const markers = lines.map(markerOf)
	const keptAt = markers.indexOf(KEPT_PART)
	const kept =
		params.kept ??
		lines
			.slice(keptAt + 1)
			.join('\n')
			.trim()
	const rendered = lines.slice(0, keptAt).flatMap(function renderLine(line, index) {
		const part = markers[index]
		if (part !== undefined) return partLines({ part, sources: params.sources })
		return RENDERER_COMMENT_PATTERN.test(line) ? [] : [line]
	})
	return {
		title: params.sources.messages[0] ?? '',
		body: [rendered.join('\n').trim(), kept].join('\n\n').trim(),
	}
}

/** The first part the template does not mark (in the renderer's order); undefined when it marks them all. */
export function missingMarkerOf(template: string): string | undefined {
	const markers = template.replace(/\r\n/g, '\n').split('\n').map(markerOf)
	return [...FILLED_PARTS, KEPT_PART].find((part) => !markers.includes(part))
}

/** The person's part of the current `body`: from the kept part's first line on; undefined when the body has none. */
export function keptTextOf(params: { template: string; body: string }): string | undefined {
	const lines = params.template.replace(/\r\n/g, '\n').split('\n')
	const keptAt = lines.map(markerOf).indexOf(KEPT_PART)
	const first = lines.slice(keptAt + 1).find((line) => line.trim() !== '')
	if (keptAt === -1 || first === undefined) return undefined
	const body = params.body.replace(/\r\n/g, '\n').split('\n')
	const at = body.indexOf(first)
	return at === -1 ? undefined : body.slice(at).join('\n').trim()
}

/** The part a template line marks; undefined for any other line. */
function markerOf(line: string): string | undefined {
	return PART_MARKER_PATTERN.exec(line.trim())?.[1]
}

/** The lines of one filled part. */
function partLines(params: { part: string; sources: PullRequestSources }): string[] {
	const { sources } = params
	switch (params.part) {
		case 'summary':
			return summaryLines(sources)
		case 'behaviours':
			return behaviourLines(sources)
		case 'changelog':
			return changelogLines(sources)
		case 'tests':
			return testsLines(sources)
		case 'review':
			return reviewLines(sources)
		case 'risk':
			return [
				BODY_LINES.risk
					.replace('{riskClass}', sources.riskClass ?? NOT_RECORDED)
					.replace('{effort}', sources.effort ?? NOT_RECORDED),
			]
		case 'issue':
			return [
				sources.issue === undefined
					? BODY_LINES.noIssue
					: BODY_LINES.issue.replace('{issue}', String(sources.issue)),
			]
		default:
			return checklistLines(sources)
	}
}

/** The summary, then the brief's other commit messages: one squash commit holds them all. */
function summaryLines(sources: PullRequestSources): string[] {
	const others = sources.messages.slice(1)
	return [
		sources.summary ?? NOT_RECORDED,
		...(others.length === 0
			? []
			: ['', BODY_LINES.otherMessages, ...others.map((message) => `- ${message}`)]),
	]
}

/** Each step's title in bold, then its behaviours; never its spec. */
function behaviourLines(sources: PullRequestSources): string[] {
	if (sources.steps === undefined || sources.steps.length === 0) return [NOT_RECORDED]
	return sources.steps
		.flatMap(function stepLines(step) {
			return ['', `**${step.title}**`, '', ...step.behaviours.map((behaviour) => `- ${behaviour}`)]
		})
		.slice(1)
}

/** The fragments' sections, one heading per section in the order first met; or the no-entry note's reason. */
function changelogLines(sources: PullRequestSources): string[] {
	const { changelog } = sources
	if (changelog === undefined) return [NOT_RECORDED]
	if (changelog.kind === 'none')
		return [BODY_LINES.noEntry.replace('{reason}', () => changelog.reason)]
	const sections = [...new Set(changelog.entries.map((entry) => entry.section))]
	return sections
		.flatMap(function sectionLines(section) {
			const texts = changelog.entries
				.filter((entry) => entry.section === section)
				.map((entry) => entry.text)
			return ['', `#### ${section}`, '', ...texts]
		})
		.slice(1)
}

/** One line per part of `tests.json`: its counts on the tree it lands, "stale" for another tree. */
function testsLines(sources: PullRequestSources): string[] {
	const { tests, treeHash } = sources
	if (tests?.tdd === undefined && tests?.gate === undefined) return [NOT_RECORDED]
	return [
		`- ${tests.tdd === undefined ? `tdd: ${NOT_RECORDED}` : tddLine({ tdd: tests.tdd, treeHash })}`,
		`- ${tests.gate === undefined ? `gate: ${NOT_RECORDED}` : gateLine({ gate: tests.gate, treeHash })}`,
	]
}

function tddLine(params: { tdd: TestsRecordTdd; treeHash: string }): string {
	const { tdd } = params
	const head = tdd.head.slice(0, SHORT_SHA_LENGTH)
	if (tdd.stateHash !== params.treeHash) return BODY_LINES.tddStale.replace('{head}', head)
	const statuses = Object.entries(tdd.counts)
		.map(([status, count]) => `${count} ${status}`)
		.join(', ')
	return BODY_LINES.tddCases
		.replace('{count}', counted({ count: tdd.cases.length, noun: 'case' }))
		.replace('{statuses}', () => statuses)
		.replace('{head}', head)
}

function gateLine(params: { gate: TestsRecordGate; treeHash: string }): string {
	const { gate } = params
	const head = gate.head.slice(0, SHORT_SHA_LENGTH)
	if (gate.stateHash !== params.treeHash)
		return BODY_LINES.gateStale.replace('{mode}', gate.mode).replace('{head}', head)
	return BODY_LINES.gateTests
		.replace('{mode}', gate.mode)
		.replace('{passed}', String(gate.tests?.passed ?? 0))
		.replace('{total}', String(gate.tests?.total ?? 0))
		.replace('{failed}', String(gate.tests?.failed ?? 0))
		.replace('{skipped}', String(gate.tests?.skipped ?? 0))
		.replace('{files}', String(gate.testFiles?.total ?? 0))
		.replace('{head}', head)
}

/** The findings as a table (how each closed), then each review's verdict. */
function reviewLines(sources: PullRequestSources): string[] {
	const { review } = sources
	if (review === undefined) return [NOT_RECORDED]
	const findings =
		review.findings.length === 0
			? [BODY_LINES.noFindings]
			: [BODY_LINES.findingsHeader, BODY_LINES.findingsRule, ...review.findings.map(findingLine)]
	const verdicts =
		review.verdicts.length === 0
			? []
			: ['', BODY_LINES.verdictsHeader, ...review.verdicts.map(verdictLine)]
	return [...findings, ...verdicts]
}

function findingLine(row: FindingRow): string {
	const state =
		row.state === 'fixed' && row.closedBy !== undefined
			? BODY_LINES.fixedIn.replace('{round}', String(row.closedBy.round))
			: (row.state ?? '-')
	const cells = [
		row.id,
		row.round === undefined ? '-' : String(row.round),
		row.severity ?? '-',
		row.file === undefined ? '-' : `\`${row.file}\``,
		state,
	]
	return `| ${cells.join(' | ')} |`
}

function verdictLine(row: VerdictRow): string {
	const model = [row.vendor, row.model].filter((word) => word !== undefined).join(' ')
	return `- ${reviewerName(row.by)}${model === '' ? '' : ` (${model})`}: ${row.verdict}`
}

function reviewerName(by: ReviewerOf): string {
	if (by.kind === 'station')
		return by.round === undefined ? by.station : `${by.station} round ${by.round}`
	if (by.kind === 'verify') return by.name === undefined ? 'verify' : `verify by ${by.name}`
	return by.name
}

/** The author's boxes, each ticked from its record; none ticked on a guess. */
function checklistLines(sources: PullRequestSources): string[] {
	const boxes: [string, boolean][] = [
		[CHECKLIST_LINES.tests, testsDone(sources)],
		[CHECKLIST_LINES.changelog, sources.changelog !== undefined],
		[CHECKLIST_LINES.docs, sources.docsPassed === true],
		[CHECKLIST_LINES.version, sources.release ? sources.versionBumped : !sources.versionBumped],
	]
	return boxes.map(([text, ticked]) => `- [${ticked ? 'x' : ' '}] ${text}`)
}

/**
 * Every case of the change done (green, or accepted / revised / unchanged) on the landed tree, and the gate part, when
 * it ran on that tree, without a failure (the full suite is CI's).
 */
function testsDone(sources: PullRequestSources): boolean {
	const { tdd, gate } = sources.tests ?? {}
	if (tdd === undefined || tdd.stateHash !== sources.treeHash || tdd.cases.length === 0)
		return false
	if (!tdd.cases.every((testCase) => DONE_CASE_STATUSES.includes(testCase.status))) return false
	if (gate === undefined) return true
	return (
		gate.stateHash === sources.treeHash &&
		(gate.tests?.failed ?? 0) === 0 &&
		(gate.testFiles?.failed ?? 0) === 0
	)
}
