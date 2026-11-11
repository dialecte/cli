/**
 * `dialecte lot report <id> [--json]` and `dialecte lot report --feature <name> [--simulated] [--json]` (33L0
 * sections 7 and 12): reads files only, writes nothing, starts no process (nothing this module reaches imports a
 * child process).
 */
import { readFeatureReport, readLotReport } from '../lib/events/read-lot-report.ts'
import { renderFeatureReport, renderLotReport } from '../lib/events/render-report.ts'
import { JSON_FLAG } from '../lib/parse-invocation.constants.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { lotFailureExit, lotRefusalExit, lotUsageExit } from '../lib/store/lot-exits.ts'
import { noLotRefusal, requireLot } from '../lib/store/resolve-lot.ts'
import { LINE_FEED } from '../lib/store/store.constants.ts'
import { printableOf } from '../lib/store/text-escape.ts'
import { FEATURE_OPTION, REPORT_FLAGS, REPORT_VALUE_OPTIONS } from './lot-report.constants.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { ReportedLot } from '../lib/events/read-lot-report.types.ts'
import type { LotReportJson } from './lot-report.types.ts'

/**
 * The report of the lot `<id>` names, or of a feature's lots, as text or `--json`; exit 1 when a feature has no lot,
 * 2 for a usage error, an unknown id or an ambiguous index (JSON `{ error, usage, next: null }` under `--json`).
 */
export function lotReport(params: {
	cwd: string
	/** The words after the verb. */
	argv: string[]
	now?: Date
}): CommandResult {
	const read = readArguments({
		argv: params.argv,
		valueOptions: REPORT_VALUE_OPTIONS,
		flags: REPORT_FLAGS,
	})
	if (typeof read === 'string')
		return lotUsageExit({ reason: read, json: params.argv.includes(JSON_FLAG) })
	const json = read.flags.has('json')
	const now = params.now ?? new Date()
	const feature = read.values.get(FEATURE_OPTION)
	const [id, ...extra] = read.words
	if (feature !== undefined) {
		if (id !== undefined)
			return lotUsageExit({ reason: `lot report --feature takes no id, not ${id}`, json })
		return featureReport({
			cwd: params.cwd,
			feature,
			json,
			simulated: read.flags.has('simulated'),
			now,
		})
	}
	if (id === undefined) return lotUsageExit({ reason: 'lot report takes one id: none given', json })
	if (extra.length > 0)
		return lotUsageExit({ reason: `lot report takes one id, not also ${extra.join(' ')}`, json })
	if (read.flags.has('simulated'))
		return lotUsageExit({ reason: 'lot report --simulated goes with --feature', json })
	const required = requireLot({ argument: id, cwd: params.cwd, mode: 'read' })
	if ('exitCode' in required) return lotRefusalExit({ message: required.output, json })
	const report = readLotReport({ lotFolder: required.lot, now })
	if (report === undefined) return lotRefusalExit({ message: noLotRefusal(id), json })
	return {
		exitCode: 0,
		output: json
			? JSON.stringify(lotReportJson({ report }), null, 2)
			: renderLotReport({ report }).join(LINE_FEED),
	}
}

/** The report of a feature's lots; exit 1 when the feature has none. */
function featureReport(params: {
	cwd: string
	feature: string
	json: boolean
	simulated: boolean
	now: Date
}): CommandResult {
	const report = readFeatureReport({ feature: params.feature, cwd: params.cwd, now: params.now })
	if (report.lots.length === 0 && report.simulated.count === 0)
		return lotFailureExit({
			message: `no lot of the feature ${printableOf(params.feature)}`,
			json: params.json,
		})
	return {
		exitCode: 0,
		output: params.json
			? JSON.stringify(report, null, 2)
			: renderFeatureReport({ report, simulated: params.simulated }).join(LINE_FEED),
	}
}

/** The model under spec 7's names: the families flat under `suites`, `throwawaySuites` beside it, the token parts and the total. */
function lotReportJson(params: { report: ReportedLot }): LotReportJson {
	const { report } = params
	const { fields, total } = report.totals.tokens
	return {
		lot: report.lot,
		state: report.state,
		feature: report.feature,
		effort: report.effort,
		steps: report.steps,
		rounds: report.rounds,
		stations: report.stations,
		runs: report.runs,
		totals: {
			tokens: {
				input: fields.input,
				output: fields.output,
				cacheRead: fields.cacheRead,
				cacheWrite: fields.cacheWrite,
				total,
			},
			money: report.totals.money,
			time: report.totals.time,
		},
		agents: report.agents,
		skills: report.skills,
		suites: report.suites.families,
		throwawaySuites: report.suites.throwaways,
		reportedSuites: report.reportedSuites,
		heavy: report.heavy,
		folders: report.folders,
		review: report.review,
		events: report.events,
		next: report.next,
		simulated: report.simulated === true,
	}
}
