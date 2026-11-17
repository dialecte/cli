/**
 * The gate's last step in a lot's worktree (33CO 4.2, decision Q6): the lot's forecast against main and every open lot,
 * recorded with trigger `gate`, printed as a warning only - the gate's verdict and exit never change.
 */
import { lotGitDeclaredHighOf } from '../design/base-declared.ts'
import { designStatusLine } from '../design/design-line.ts'
import { lotDesignStandingOf } from '../design/design-standing.ts'
import { realPathOf } from '../file-system.ts'
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { readIdentity } from '../store/identity.ts'
import { lotOfWorktree } from '../store/resolve-lot.ts'
import { workTreeHolding } from '../store/store-folder.ts'
import { recordForecastRun } from './forecast-record.ts'
import { forecastHoldText } from './forecast-view.ts'
import { GATE_FORECAST_TEXTS } from './forecast.constants.ts'
import { forecastLot } from './forecast.ts'

import type { GateForecast } from './forecast.types.ts'

/**
 * The forecast of the lot whose own worktree holds `cwd`, recorded; undefined outside it (a review throwaway too) or
 * for a lot with no forecast (not open, damaged, simulated). Its text: the verdict, then one line per comparison it does not clear.
 */
export function runGateForecast(params: {
	cwd: string
	now?: () => Date
}): GateForecast | undefined {
	// the gate's verdict and exit never change (Q6): a forecast that throws is an unknown note, never a crash
	try {
		return gateForecastOf(params)
	} catch (error) {
		const reason = (error as Error).message
		return {
			verdict: 'unknown',
			lines: [],
			text: [
				fillMessage({ template: GATE_FORECAST_TEXTS.verdict, values: { verdict: 'unknown' } }),
				fillMessage({ template: GATE_FORECAST_TEXTS.failed, values: { reason } }),
			],
		}
	}
}

/** `runGateForecast` without its guard. */
function gateForecastOf(params: { cwd: string; now?: () => Date }): GateForecast | undefined {
	const lotFolder = lotOfWorktree({ cwd: params.cwd })
	if (lotFolder === undefined) return undefined
	// the lot's own worktree only: a review round's throwaway of the same index holds no work of the lot
	const worktree = readIdentity({ lotFolder })?.worktree
	const own = workTreeHolding({ from: params.cwd })
	if (worktree === null || worktree === undefined || own === undefined) return undefined
	if (realPathOf(worktree) !== realPathOf(own)) return undefined
	const run = forecastLot({ lotFolder, trigger: 'gate', now: params.now })
	if ('refusal' in run) return undefined
	const recorded = recordForecastRun({ lotFolder, run, trigger: 'gate' })
	const held = run.lines.flatMap((line) => {
		const hold = forecastHoldText(line)
		return hold === undefined
			? []
			: [
					fillMessage({
						template: GATE_FORECAST_TEXTS.held,
						values: { against: line.against, hold },
					}),
				]
	})
	return {
		verdict: run.verdict,
		lines: run.lines,
		text: [
			fillMessage({ template: GATE_FORECAST_TEXTS.verdict, values: { verdict: run.verdict } }),
			...held,
			// where the lot's design stands, held to its base's shared areas (DESIGN-GATE)
			designStatusLine(
				lotDesignStandingOf({
					lotFolder,
					declaredHigh: lotGitDeclaredHighOf({ lotFolder }).globs,
				}),
			),
			// the gate already warns when the lot's events cannot be written: its forecast event is not said twice
			...(recorded.eventFailed ? [] : recorded.notes),
		],
	}
}
