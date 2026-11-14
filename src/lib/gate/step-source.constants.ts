import type { InferredTool } from './step-source.types.ts'

/** The file a repository without package.json writes its gate in, at its root. */
export const DIALECTE_JSON_FILE = 'dialecte.json'

/** The schema version of `dialecte.json` this cli reads. */
export const DIALECTE_JSON_SCHEMA = 1

/** The keys a `dialecte.json` may hold. */
export const DIALECTE_JSON_KEYS: readonly string[] = ['schema', 'gate']

/** The tools the gate infers its steps from when a repository has no package.json, first match wins. */
export const INFERRED_TOOLS: readonly InferredTool[] = [
	{
		label: 'pyproject.toml + uv.lock',
		files: ['pyproject.toml', 'uv.lock'],
		steps: {
			fast: [{ name: 'tests', run: 'uv run pytest', counts: 'tests' }],
			full: [{ name: 'tests', run: 'uv run pytest', counts: 'tests' }],
		},
	},
]

/**
 * No package.json, no dialecte.json, nothing the gate infers steps from: `{tools}` lists each inferred tool as
 * `<files> (<command>)`.
 */
export const NO_STEP_SOURCE =
	'no package.json and nothing to run: write a dialecte.json at the root ({ "gate": { "fast": [...], "full": [...] } }), or hold the files the gate infers its steps from: {tools}'

/** A dialecte.json the cli cannot read: `{problem}` says why. */
export const INVALID_DIALECTE_JSON = 'dialecte.json: {problem}'

/** What is wrong with a dialecte.json, as `INVALID_DIALECTE_JSON`'s `{problem}` says it. */
export const DIALECTE_JSON_PROBLEMS = {
	notJson: 'not valid JSON ({error})',
	notAnObject: 'an object such as { "gate": { "fast": [...], "full": [...] } }',
	unknownKey: 'unknown key "{key}" (only "schema" and "gate" are read)',
	schema: '"schema" is 1',
	gateNotAnObject: '"gate" is an object of step lists',
	skip: '"gate.skip" opts out of a default npm step, and a repository without package.json has none: declare the lists instead',
	missingList:
		'no "{list}" list, and nothing to infer it from: declare it, or hold the files the gate infers its steps from: {tools}',
} as const
