/** A simulated lot's own `scenario.json`, read from disk: file reads only, shared by the player and the lot reader. */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { STORE_FILES } from './store.constants.ts'

import type { ScenarioFile, ScenarioRead } from './scenarios.types.ts'

/**
 * The lot's own `scenario.json`: missing (nothing to play), unreadable when it does not parse or holds no steps
 * array, else its steps. The lot reader's check (`scenarioDamageOf`) makes an unreadable or empty one damaged.
 */
export function readScenario(params: { lotFolder: string }): ScenarioRead {
	const path = join(params.lotFolder, STORE_FILES.scenario)
	if (!existsSync(path)) return { state: 'missing' }
	try {
		const file = JSON.parse(readFileSync(path, 'utf8')) as Partial<ScenarioFile> | null
		return Array.isArray(file?.steps)
			? { state: 'read', steps: file.steps }
			: { state: 'unreadable' }
	} catch {
		return { state: 'unreadable' }
	}
}
