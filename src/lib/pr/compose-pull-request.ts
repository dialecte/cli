/**
 * The pure half of `lot pr`: a lot's pull request text composed from its read records through the repository's one
 * template. No file, git or host read here (`pull-request-sources.ts` gathers). The body is the lot's final state:
 * each part from the record as it stands, "not recorded" for a record missing, never a guess.
 */
import { counted } from '../counted.ts'
import { DESIGN_STATE_WORDS } from '../design/design.constants.ts'
import { SHORT_SHA_LENGTH } from '../gate-records/gate-records.constants.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { qualityBodyLines } from '../quality/quality-body.ts'
import {
	BODY_LINES,
	CHECKLIST_LINES,
	CRLF_PATTERN,
	DONE_CASE_STATUSES,
	FILLED_PARTS,
	KEPT_PART,
	LOT_INDEX_OF_NAME,
	NOT_RECORDED,
	PART_MARKER_PATTERN,
	PLACEHOLDER_BODY_PATTERN,
	PULL_REQUEST_LINES,
	RENDERER_COMMENT_PATTERN,
	REVIEWER_KINDS,
	TEMPLATE_FAULTS,
} from './pull-request.constants.ts'

import type {
	DesignRow,
	FindingRow,
	ReviewerOf,
	VerdictRow,
} from '../review-rounds/review-record.types.ts'
import type { TestsRecordGate, TestsRecordTdd } from '../tdd/tests-record.types.ts'
import type { PullRequestSources, PullRequestText } from './pull-request.types.ts'

/** The title and body of the lot, or the refusal of a template that is not the renderer's. */
export function composePullRequest(params: {
	template: string
	sources: PullRequestSources
	/** A person's part of the current body (`keptTextOf`); the template's own when undefined. */
	kept: string | undefined
}): PullRequestText | { refusal: string } {
	const fault = templateFaultOf(params.template)
	if (fault !== undefined) return { refusal: fault }
	const lines = linesOf(params.template)
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

/**
 * Why the template is not the renderer's: a part it does not mark (in the renderer's order), a part it marks twice, or
 * a filled part marked after the kept marker (it would never render); undefined for the renderer's template.
 */
export function templateFaultOf(template: string): string | undefined {
	const markers = linesOf(template).map(markerOf)
	const parts = [...FILLED_PARTS, KEPT_PART]
	const missing = parts.find((part) => !markers.includes(part))
	if (missing !== undefined) return TEMPLATE_FAULTS.missing.replace('{part}', missing)
	const twice = parts.find((part) => markers.indexOf(part) !== markers.lastIndexOf(part))
	if (twice !== undefined) return TEMPLATE_FAULTS.twice.replace('{part}', twice)
	const keptAt = markers.indexOf(KEPT_PART)
	const late = FILLED_PARTS.find((part) => markers.indexOf(part) > keptAt)
	return late === undefined ? undefined : TEMPLATE_FAULTS.afterKept.replace('{part}', late)
}

/**
 * The person's part of the current `body`: from the kept part's first line on, its last occurrence (a rendered part
 * can never push it out); undefined when the body has none.
 */
export function keptTextOf(params: { template: string; body: string }): string | undefined {
	const lines = linesOf(params.template)
	const keptAt = lines.map(markerOf).indexOf(KEPT_PART)
	const first = lines.slice(keptAt + 1).find((line) => line.trim() !== '')
	if (keptAt === -1 || first === undefined) return undefined
	const body = linesOf(params.body)
	const at = body.lastIndexOf(first)
	return at === -1 ? undefined : body.slice(at).join('\n').trim()
}

/**
 * What of the current `body` the render keeps (`keptTextOf`), or the refusal of a body whose person's text the render
 * would drop: one without the kept part's heading that is neither empty nor the placeholder an earlier landing wrote.
 * Never a person's text dropped silently.
 */
export function keptPartOf(params: {
	template: string
	body: string
}): { kept: string | undefined } | { refusal: string } {
	const kept = keptTextOf(params)
	if (kept !== undefined) return { kept }
	const body = linesOf(params.body).join('\n').trim()
	if (body === '' || PLACEHOLDER_BODY_PATTERN.test(body)) return { kept: undefined }
	const lines = linesOf(params.template)
	const heading = lines
		.slice(lines.map(markerOf).indexOf(KEPT_PART) + 1)
		.find((line) => line.trim() !== '')
	return { refusal: PULL_REQUEST_LINES.keptMissing.replace('{heading}', () => heading ?? '') }
}

/** The lines of a text, whatever line ends another system gave it. */
export function linesOf(text: string): string[] {
	return text.replace(CRLF_PATTERN, '\n').split('\n')
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
				// the base-aware findings judged on the head, a paragraph of their own after the risk line
				...(sources.quality === undefined ? [] : ['', ...qualityBodyLines(sources.quality)]),
			]
		case 'overlaps':
			return overlapLines(sources)
		case 'depends':
			return [
				sources.dependsOn === undefined
					? NOT_RECORDED
					: BODY_LINES.dependsOn.replace('{number}', String(sources.dependsOn)),
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

/**
 * One line per overlap the lot accepted (the same lot and reason once): the other lot by its index, never its branch's
 * words, and why; `none` without one.
 */
function overlapLines(sources: PullRequestSources): string[] {
	const overlaps = sources.overlaps ?? []
	if (overlaps.length === 0) return [BODY_LINES.noOverlaps]
	const lines = overlaps.map(function overlapLine(overlap) {
		return BODY_LINES.overlap
			.replace('{index}', () => indexOfLot(overlap.lot))
			.replace('{reason}', () => overlap.reason)
	})
	// a lot accepted again for the same reason (a start, then a scope add) is one line
	return [...new Set(lines)]
}

/** A lot's index, the digits its name starts with (`0007-repo-x` → `0007`); `another lot` for a name holding none. */
function indexOfLot(name: string): string {
	return LOT_INDEX_OF_NAME.exec(name)?.[1] ?? BODY_LINES.unindexedLot
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
		`- ${tests.gate === undefined ? BODY_LINES.noGate : gateLine({ gate: tests.gate, treeHash })}`,
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
	return [...designLines(sources.design ?? review.design), ...findings, ...verdicts]
}

/** The design's line, first in the review part: its state and who approved or waived it, by kind; none without a row. */
function designLines(row: DesignRow | undefined): string[] {
	if (row === undefined) return []
	return [
		fillMessage({
			template: BODY_LINES.design,
			values: {
				state: DESIGN_STATE_WORDS[row.state],
				by:
					row.by === undefined
						? ''
						: fillMessage({
								template: BODY_LINES.designBy,
								values: { kind: reviewerName(row.by) },
							}),
			},
		}),
	]
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

/**
 * Who gave a verdict, by kind only: a review station (with its round), a verify, the orchestrator or a person; never a
 * person's or a verifier's name (the host shows who approves).
 *
 * @intent name who reviewed or approved by kind, never by name
 * @internal
 */
export function reviewerName(by: ReviewerOf): string {
	if (by.kind === 'station')
		return by.round === undefined ? by.station : `${by.station} round ${by.round}`
	if (by.kind === 'verify') return REVIEWER_KINDS.verify
	return by.name === REVIEWER_KINDS.orchestrator
		? REVIEWER_KINDS.orchestrator
		: REVIEWER_KINDS.person
}

/** The author's boxes, each ticked from its record; none ticked on a guess. */
function checklistLines(sources: PullRequestSources): string[] {
	const boxes: [string, boolean][] = [
		[
			sources.tests?.gate === undefined
				? `${CHECKLIST_LINES.tests} (${BODY_LINES.noGate})`
				: CHECKLIST_LINES.tests,
			testsDone(sources),
		],
		[CHECKLIST_LINES.changelog, sources.changelog !== undefined],
		[CHECKLIST_LINES.docs, sources.docsPassed === true],
		[CHECKLIST_LINES.version, sources.release ? sources.versionBumped : !sources.versionBumped],
	]
	return boxes.map(([text, ticked]) => `- [${ticked ? 'x' : ' '}] ${text}`)
}

/**
 * Every case of the change done (green, or accepted / revised / unchanged) on the landed tree, and a gate record of
 * that tree without a failure; with no gate record the box stays for CI, the proof.
 */
function testsDone(sources: PullRequestSources): boolean {
	const { tdd, gate } = sources.tests ?? {}
	if (tdd === undefined || tdd.stateHash !== sources.treeHash || tdd.cases.length === 0)
		return false
	if (!tdd.cases.every((testCase) => DONE_CASE_STATUSES.includes(testCase.status))) return false
	if (gate === undefined) return false
	return (
		gate.stateHash === sources.treeHash &&
		(gate.tests?.failed ?? 0) === 0 &&
		(gate.testFiles?.failed ?? 0) === 0
	)
}
