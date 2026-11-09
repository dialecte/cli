import { counted } from '../counted.ts'
/**
 * The recap as GitHub markdown: the expandable part of a pull request, each section always present and
 * built from the records only - no free prose beyond its fixed sentences, no path outside the repository.
 */
import { CARD_GATE_MARKS } from '../gate-records/gate-records.constants.ts'
import { printableOf } from '../store/text-escape.ts'
import {
	ALSO_JUDGED,
	ASSISTANT,
	BRANCH_REWRITTEN,
	DECISION_PREFIXES,
	EMPTY_SECTION,
	FINDING_OUTCOMES,
	NO_MUTATION_SCOPE_DECLARED,
	NOT_COMMITTED,
	OTHER_JUDGED_STATUSES,
	PREPARED_BY,
	RECAP_CLOSE,
	RECAP_MOVED_ITEM,
	RECAP_OPEN,
	RECAP_OTHER_RUN,
	RECAP_REPORTED_RUN,
	RECAP_SCHEDULED_ITEM,
	ROUND_SEVERITIES,
	SECTION_TITLES,
	TESTS_ADDED_LINE,
} from './recap.constants.ts'

import type { KeyedLedgerItem, RunEntry } from '../mutation/mutation.types.ts'
import type { RecapFinding, RecapMutation, RecapRecords } from './recap.types.ts'

export function renderRecap(records: RecapRecords): string {
	return [
		...RECAP_OPEN,
		'',
		SECTION_TITLES.commits,
		...commitLines(records),
		'',
		SECTION_TITLES.tests,
		...testLines(records),
		'',
		SECTION_TITLES.checks,
		...checkLines(records),
		'',
		SECTION_TITLES.mutation,
		...mutationLines(records.mutation),
		'',
		SECTION_TITLES.review,
		...reviewLines(records),
		'',
		SECTION_TITLES.decisions,
		...decisionLines(records),
		'',
		SECTION_TITLES.followUps,
		...followUpLines(records),
		'',
		PREPARED_BY.replace('{user}', records.user),
		'',
		RECAP_CLOSE,
	].join('\n')
}

/** Each lot with its commit or not committed yet; when the branch was rewritten, the line saying so. */
function commitLines(records: RecapRecords): string[] {
	return [
		...records.commits.map((lot) =>
			lot.commit
				? `- \`${lot.commit.slice(0, 7)}\` ${lot.subject}`
				: `- ${NOT_COMMITTED} ${lot.subject}`,
		),
		...(records.branchRewritten ? [BRANCH_REWRITTEN] : []),
	]
}

/** The cases judged green, counted per test file; the other judged statuses on one line. */
function testLines(records: RecapRecords): string[] {
	const statuses = [...(records.judgedCases ?? new Map()).entries()]
	const greenPerFile = new Map<string, number>()
	for (const [label, status] of statuses) {
		if (status !== 'green') continue
		const file = label.split('::')[0]
		greenPerFile.set(file, (greenPerFile.get(file) ?? 0) + 1)
	}
	const green = [...greenPerFile.values()].reduce((total, count) => total + count, 0)
	const others = OTHER_JUDGED_STATUSES.flatMap(function otherCount(other) {
		const count = statuses.filter(([, status]) => status === other).length
		return count ? [`${count} ${other}`] : []
	})
	return [
		...(green
			? [
					TESTS_ADDED_LINE.replace('{cases}', counted({ count: green, noun: 'case' })),
					...[...greenPerFile.entries()]
						.sort(([first], [second]) => first.localeCompare(second))
						.map(([file, count]) => `- \`${file}\` ${count}`),
				]
			: [EMPTY_SECTION.tests]),
		...(others.length ? [`${ALSO_JUDGED} ${others.join(', ')}.`] : []),
	]
}

function checkLines(records: RecapRecords): string[] {
	if (records.checks.length === 0) return [EMPTY_SECTION.checks]
	return records.checks.map((line) =>
		[`- ${CARD_GATE_MARKS[line.status]}`, line.name, line.detail].filter(Boolean).join(' '),
	)
}

/** Each run of the lot, oldest first, then the survivors its runs killed or recorded, then its scheduled ones. */
function mutationLines(mutation: RecapMutation): string[] {
	if (mutation.kind === 'undeclared') return [NO_MUTATION_SCOPE_DECLARED]
	const { runs, moved, scheduled } = mutation
	if (runs.length + moved.length + scheduled.length === 0) return [EMPTY_SECTION.mutation]
	return [
		...runs.map(runLine),
		...moved.map((item) =>
			itemText({ template: RECAP_MOVED_ITEM, item })
				.replace('{state}', item.state)
				.replace('{id}', item.movedBy ?? ''),
		),
		...scheduled.map((item) =>
			itemText({ template: RECAP_SCHEDULED_ITEM, item }).replace('{followUp}', item.followUp ?? ''),
		),
	]
}

/** A reported run with its counts; any other run with its state. */
function runLine(run: RunEntry): string {
	if (run.state !== 'reported' || !run.counts)
		return runText({ template: RECAP_OTHER_RUN, run }).replace('{state}', run.state)
	const { killed, survived, timedOut, noCoverage } = run.counts
	return runText({ template: RECAP_REPORTED_RUN, run })
		.replace('{killed}', String(killed))
		.replace('{survived}', String(survived))
		.replace('{timedOut}', String(timedOut))
		.replace('{noCoverage}', String(noCoverage))
}

/** A run's mode and id put in a template. */
function runText(params: { template: string; run: RunEntry }): string {
	return params.template.replace('{mode}', params.run.mode).replace('{id}', params.run.runId)
}

/** A survivor's `file:line` and mutation put in a template. */
function itemText(params: { template: string; item: KeyedLedgerItem }): string {
	const { template, item } = params
	return template
		.replace('{file}', item.file)
		.replace('{line}', String(item.line))
		.replace('{mutation}', item.mutation)
}

/** The totals, then each round with its findings in ledger order. */
function reviewLines(records: RecapRecords): string[] {
	const findings = records.findings ?? []
	if (findings.length === 0) return [EMPTY_SECTION.review]
	const rounds = [...new Set(findings.map((finding) => finding.round))].sort(
		(first, second) => first - second,
	)
	const outcomes = FINDING_OUTCOMES.flatMap(function outcomeCount(outcome) {
		const count = findings.filter((finding) => finding.outcome === outcome).length
		return count ? [`${count} ${outcome}`] : []
	})
	const highest = rounds.at(-1) ?? 0
	return [
		`${counted({ count: highest, noun: 'round' })}, ${counted({ count: findings.length, noun: 'finding' })}: ${outcomes.join(', ')}.`,
		...rounds.flatMap((round) =>
			roundLines({ round, findings: findings.filter((finding) => finding.round === round) }),
		),
	]
}

function roundLines(params: { round: number; findings: RecapFinding[] }): string[] {
	const severities = ROUND_SEVERITIES.flatMap(function severityCount(entry) {
		const count = params.findings.filter((finding) => finding.severity === entry.severity).length
		if (!count) return []
		return [entry.plural ? counted({ count, noun: entry.severity }) : `${count} ${entry.severity}`]
	})
	const severitiesText = severities.length ? ` (${severities.join(', ')})` : ''
	return [
		`- Round ${params.round}: ${counted({ count: params.findings.length, noun: 'finding' })}${severitiesText}`,
		...params.findings.map(
			(finding) =>
				`  - ${finding.outcome} ${finding.id}: ${[finding.severity, atText(finding.at), finding.finding].filter(Boolean).join(' ')}`,
		),
	]
}

/** A `file:line` as code; nothing when the row has none. */
function atText(at: string): string {
	return at ? `\`${at}\`` : ''
}

/** The ledger's accepted rows, the lot declaration's accepted and revised cases, then `decisions.md`. */
function decisionLines(records: RecapRecords): string[] {
	const by = `(by ${ASSISTANT})`
	const lines = [
		...(records.findings ?? [])
			.filter((finding) => finding.outcome === 'accepted')
			.map(
				(finding) =>
					`- ${DECISION_PREFIXES.kept} ${finding.id} ${finding.finding} - ${finding.reason ?? ''} ${by}`,
			),
		...records.accepted.map(
			(entry) => `- ${DECISION_PREFIXES.accepted} ${entry.case} - ${entry.reason} ${by}`,
		),
		...records.revised.map(
			(entry) => `- ${DECISION_PREFIXES.revised} ${entry.case} - ${entry.reason} ${by}`,
		),
		// decision rows hold what agents and hosts wrote (decisions.md, the lot's answers): escaped once
		...printableOf(records.decisions).map((row) => `- ${row.decision} (by ${row.by})`),
	]
	return lines.length ? lines : [EMPTY_SECTION.decisions]
}

/** The ledger's logged rows: the id, the finding and its `file:line`, never where it was logged. */
function followUpLines(records: RecapRecords): string[] {
	const lines = (records.findings ?? [])
		.filter((finding) => finding.outcome === 'logged')
		.map(
			(finding) =>
				`- ${finding.id}: ${finding.finding}${finding.at ? ` (${atText(finding.at)})` : ''}`,
		)
	return lines.length ? lines : [EMPTY_SECTION.followUps]
}
