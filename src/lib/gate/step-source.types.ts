import type { PackageJson } from '../package-json.types.ts'
import type { GateStep } from './gate-config.types.ts'

/** Where the gate's steps come from in a repository: its package.json, its root dialecte.json, or its files. */
export type StepSourceOrigin = 'package.json' | 'dialecte.json' | 'inferred'

/**
 * The gate's step source of a repository (`readStepSource`): the package.json as the gate reads it, written by the
 * repository or put together from its dialecte.json and what its files tell.
 */
export type StepSource = {
	origin: StepSourceOrigin
	packageJson: PackageJson
}

/** A root `dialecte.json`, read only when the repository has no package.json: what its package.json `dialecte` would say. */
export type DialecteJson = {
	/** The file's schema version: 1 (`DIALECTE_JSON_SCHEMA`) when given. */
	schema?: number
	gate?: NonNullable<PackageJson['dialecte']>['gate']
}

/** One tool the gate recognises from the files a repository holds: all `files` at its root give `steps`. */
export type InferredTool = {
	/** Shown in the failure naming what the gate infers from: `pyproject.toml + uv.lock`. */
	label: string
	files: readonly string[]
	steps: Readonly<Record<'fast' | 'full', readonly GateStep[]>>
}
