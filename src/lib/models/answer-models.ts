import { endedOf, jsonOf, textOf } from '../print/print.ts'
/** What `dialecte models` prints: the tier map of one vendor. */
import { MODEL_TIERS, TIER_DEFINITIONS, TIER_NAMES, VENDOR_IDS } from './model-tiers.constants.ts'
import { isVendorId } from './vendor-id.ts'

import type { LookupCommandOutput } from '../command-output.types.ts'
import type { TierModel } from './model-tiers.types.ts'

export function answerModels(params: {
	/** `--vendor`, else the vendor the skills manifest remembers. */
	vendor: string | undefined
	json: boolean
}): LookupCommandOutput {
	const knownIds = VENDOR_IDS
	if (params.vendor === undefined)
		return {
			output: textOf([
				`dialecte models: no vendor known for this project. Run \`dialecte skills sync --vendor <${knownIds.join('|')}>\`, or pass \`--vendor <id>\`.`,
				'',
			]),
			exitCode: 2,
		}
	if (!isVendorId(params.vendor))
		return {
			output: textOf([
				`dialecte models: unknown vendor "${params.vendor}" (known: ${knownIds.join(', ')})`,
				'',
			]),
			exitCode: 1,
		}
	const models = MODEL_TIERS.vendors[params.vendor]
	if (params.json)
		return {
			output: endedOf(
				jsonOf(
					{
						vendor: params.vendor,
						checkedAt: MODEL_TIERS.checkedAt,
						tiers: models.tiers,
						...(models.note === undefined ? {} : { note: models.note }),
						definitions: TIER_DEFINITIONS,
					},
					'\t',
				),
			),
			exitCode: 0,
		}
	const width = Math.max(...TIER_NAMES.map((tier) => tier.length)) + 2
	const lines = [
		`vendor ${params.vendor}  (checked ${MODEL_TIERS.checkedAt})`,
		...TIER_NAMES.map((tier) => `${tier.padEnd(width)}${renderModel(models.tiers[tier])}`),
		...(models.note === undefined ? [] : [`note: ${models.note}`]),
		'',
		...TIER_NAMES.map((tier) => `${tier.padEnd(width)}${TIER_DEFINITIONS[tier]}`),
	]
	return { output: textOf([...lines, '']), exitCode: 0 }
}

function renderModel(tierModel: TierModel): string {
	return tierModel.effort === undefined
		? tierModel.model
		: `${tierModel.model} (${tierModel.effort})`
}
