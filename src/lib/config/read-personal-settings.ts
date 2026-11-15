import { CONFIG_KEYS } from './config-keys.constants.ts'
import { ConfigRefusal } from './config-refusal.ts'
import { findOldHomes } from './find-old-homes.ts'
import { resolveConfig } from './resolve-config.ts'

import type { ConfigContext, PersonalSettings } from './config.types.ts'

/**
 * The personal keys' effective values (key -> value in the shape its check accepted, the `repos:` entry of this repository included) and the notes
 * of the old copies config.yml already holds (the git keys, then the forbidden-words file, U2). Throws
 * `ConfigRefusal` with every refusal of both files (D6), then those of the old homes not migrated.
 */
export function readPersonalSettings(context: ConfigContext): {
	values: PersonalSettings
	notes: string[]
} {
	const keys = context.keys ?? CONFIG_KEYS
	const resolved = resolveConfig(context)
	const oldHomes = findOldHomes({ context, layer: 'personal' })
	const refusals = [...resolved.refusals, ...oldHomes.refusals]
	if (refusals.length > 0) throw new ConfigRefusal(refusals)
	const personalValues = resolved.values.filter((value) =>
		keys.some((spec) => spec.key === value.key && spec.layer === 'personal'),
	)
	return {
		// every value passed its key's check, the shape PersonalSettings names
		values: Object.fromEntries(
			personalValues.map((value) => [value.key, value.value]),
		) as PersonalSettings,
		notes: oldHomes.notes,
	}
}
