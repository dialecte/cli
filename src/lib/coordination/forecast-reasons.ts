/** The texts of an unknown comparison's reasons that more than one module writes. */
import { fillMessage } from '../knowledge/standard/fill-message.ts'
import { FORECAST_REASONS } from './forecast.constants.ts'

/** `forecast of <lot> over <seconds> s`: a git step ran over its limit. */
export function overTimeReason(params: { lot: string; limitMs: number }): string {
	return fillMessage({
		template: FORECAST_REASONS.overTime,
		values: { lot: params.lot, seconds: String(params.limitMs / 1000) },
	})
}
