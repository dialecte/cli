import { ConfigRefusal } from './config-refusal.ts'
import { findOldHomes } from './find-old-homes.ts'
import { resolveConfig } from './resolve-config.ts'

import type { ConfigContext, ProjectSettings } from './config.types.ts'

/**
 * The project keys' effective values (key -> value, each in the shape its check accepted) from `.dialecterc` and the environment; an empty object when
 * nothing is set. Reads neither the personal file nor git (no process spawned). Throws `ConfigRefusal` with the
 * refusals of `.dialecterc` (D6), then those of the old homes (package.json `"dialecte"`, dialecte.json, C8).
 */
export function readProjectSettings(context: ConfigContext): ProjectSettings {
	const resolved = resolveConfig({ ...context, layers: ['project'] })
	const oldHomes = findOldHomes({ context, layer: 'project' })
	const refusals = [...resolved.refusals, ...oldHomes.refusals]
	if (refusals.length > 0) throw new ConfigRefusal(refusals)
	// every value passed its key's check, the shape ProjectSettings names
	return Object.fromEntries(
		resolved.values.map((value) => [value.key, value.value]),
	) as ProjectSettings
}
