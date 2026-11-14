import { readStepSource } from './gate/step-source.ts'

import type { PackageJson } from './package-json.types.ts'

/**
 * The package.json at `root`; without one, what the gate's step source puts together (`readStepSource`: the root
 * dialecte.json and the steps the repository's files tell), so every gate reader sees the same steps; an empty
 * object when there is nothing to run.
 */
export function readPackageJson(root: string): PackageJson {
	const source = readStepSource(root)
	return 'refusal' in source ? {} : source.packageJson
}
