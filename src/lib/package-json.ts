import { readStepSource } from './gate/step-source.ts'
import { DECLARING_FIELDS } from './package-json.constants.ts'

import type { DeclaredSpec, PackageJson } from './package-json.types.ts'

/**
 * The package.json at `root`; without one, what the gate's step source puts together (`readStepSource`: the root
 * dialecte.json and the steps the repository's files tell), so every gate reader sees the same steps; an empty
 * object when there is nothing to run.
 */
export function readPackageJson(root: string): PackageJson {
	const source = readStepSource(root)
	return 'refusal' in source ? {} : source.packageJson
}

/**
 * The spec a manifest declares for `name` and the field it sits in, read in the order dependencies,
 * devDependencies, optionalDependencies, peerDependencies; undefined when it declares none, or when the first field
 * declaring it holds no string.
 */
export function declaredSpecOf(params: {
	manifest: PackageJson
	name: string
}): DeclaredSpec | undefined {
	const field = DECLARING_FIELDS.find(
		(candidate) => params.manifest[candidate]?.[params.name] !== undefined,
	)
	const spec: unknown = field === undefined ? undefined : params.manifest[field]?.[params.name]
	return field === undefined || typeof spec !== 'string' ? undefined : { field, spec }
}
