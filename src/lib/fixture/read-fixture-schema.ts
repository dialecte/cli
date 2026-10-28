import { isCoreReaders, isDialecteConfig } from '../schema/load-dialectes.ts'
import { CORE_READER_NAMES } from '../schema/schema.constants.ts'

import type { RunEnvironment } from '../run/run.types.ts'
import type { FixtureDialecte, FixtureReaders } from './fixture.types.ts'

/**
 * The dialecte a run drives, as `dialecte schema` reads it: its config (the one export holding
 * `rootElementName` and `definition`) and the readers of the very core the run loaded, so the plan and the
 * engine read the same definition.
 */
export function readFixtureSchema(params: {
	environment: RunEnvironment
	packageName: string
}): FixtureDialecte {
	const { environment, packageName } = params
	const configs = [...new Set(Object.values(environment.dialecte).filter(isDialecteConfig))]
	if (configs.length !== 1)
		throw new Error(
			`fixture: ${packageName} exports ${configs.length === 0 ? 'no dialecte config' : 'several dialecte configs'} - name the entry of one with --package <name>`,
		)
	const readers = environment.core.utils
	if (!isCoreReaders(readers))
		throw new Error(
			`fixture: the core ${packageName} runs on lacks ${CORE_READER_NAMES.filter((name) => typeof readers[name] !== 'function').join(', ')}: update @dialecte/core`,
		)
	if (typeof readers.requiredChoices !== 'function')
		throw new Error(
			`fixture: the core ${packageName} runs on has no requiredChoices (@dialecte/core/utils): update @dialecte/core`,
		)
	return { packageName, config: configs[0], readers: readers as FixtureReaders }
}
