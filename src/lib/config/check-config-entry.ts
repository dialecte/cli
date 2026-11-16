import { CONFIG_LAYER_FILE_LABELS, CONFIG_REPOS_KEY } from './config.constants.ts'

import type { ConfigEntry, ConfigKeySpec, ConfigLayer } from './config.types.ts'

/** Why every reader refuses an entry (wrong layer, not overridable, bad value), undefined when it holds. */
function refusalOf(params: {
	entry: ConfigEntry
	spec: ConfigKeySpec
	layer: ConfigLayer
	inRepos: boolean
}): string | undefined {
	const { entry, spec } = params
	if (spec.layer !== params.layer)
		return `'${entry.key}' is a ${spec.layer} setting: it belongs in ${CONFIG_LAYER_FILE_LABELS[spec.layer]}, not in ${CONFIG_LAYER_FILE_LABELS[params.layer]}`
	if (params.inRepos && !spec.repoOverride)
		return `'${entry.key}' cannot be set per repository: set it at the top level of ${CONFIG_LAYER_FILE_LABELS.personal}`
	const problem = spec.problemOf(entry.value)
	return problem === undefined ? undefined : `'${entry.key}' ${problem}`
}

/**
 * The verdict on one entry of a file of `layer` (D6, D11, D12): `refused` with its problem (every reader refuses
 * it), `unknown` (a key the registry does not hold: `check` reports it, readers ignore it) or `accepted`.
 */
export function checkConfigEntry(params: {
	entry: ConfigEntry
	layer: ConfigLayer
	inRepos: boolean
	keys: readonly ConfigKeySpec[]
}): { verdict: 'accepted' } | { verdict: 'refused' | 'unknown'; problem: string } {
	const { entry, layer } = params
	const spec = params.keys.find((candidate) => candidate.key === entry.key)
	if (spec !== undefined) {
		const problem = refusalOf({ entry, spec, layer, inRepos: params.inRepos })
		return problem === undefined ? { verdict: 'accepted' } : { verdict: 'refused', problem }
	}
	if (layer === 'project' && entry.key === CONFIG_REPOS_KEY)
		return {
			verdict: 'refused',
			problem: `'repos' holds personal overrides: it belongs in ${CONFIG_LAYER_FILE_LABELS.personal}, never in a committed file`,
		}
	return { verdict: 'unknown', problem: `'${entry.key}' is not a ${layer} setting (unknown key)` }
}
