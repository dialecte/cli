/**
 * `gate --hook` of a package that declares no hook list runs every full step, a scoped `dialecte rules` step
 * included: on the committed tree, against the hook base. The package is shaped like core's: scoped rules in fast and
 * full, a scoped browser test step, a release list, no hook list.
 */
import { runHookIn } from '../../test/gate-hook.ts'
import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { createScratchRepository, git, writeFiles } from '../../test/scratch-repository.ts'
import { resolveHookSteps } from '../lib/gate/gate-config.ts'

import { describe, expect, it } from 'vitest'

import type { PackageJson } from '../lib/package-json.types.ts'

/** A package.json shaped like core's: its gate lists as core declares them, its scripts stubbed (a test script prints one vitest count). */
const CORE_SHAPED_PACKAGE_JSON = `{
	"name": "@dialecte/core",
	"type": "module",
	"scripts": {
		"check": "true",
		"skills:check": "true",
		"build": "true",
		"test:node": "printf '      Tests  4 passed (4)\\\\n'",
		"test:scope": "sh scope.sh",
		"test:browser:release": "true",
		"type-narrowing": "true",
		"type-bench:check": "true"
	},
	"dialecte": {
		"profile": "contributor",
		"gate": {
			"fast": [
				{ "name": "check", "run": "npm run check" },
				{ "name": "skills", "run": "npm run skills:check" },
				{
					"name": "tests",
					"run": "npx vitest run --changed --project node --project node-indexeddb",
					"counts": "tests",
					"changedOnly": true
				},
				{ "name": "rules", "run": "dialecte rules", "scoped": true }
			],
			"full": [
				{ "name": "check", "run": "npm run check" },
				{ "name": "skills", "run": "npm run skills:check" },
				{ "name": "build", "run": "npm run build" },
				{ "name": "tests", "run": "npm run test:node", "counts": "tests" },
				{ "name": "browser tests", "run": "npm run test:scope", "counts": "tests", "scoped": true },
				{ "name": "rules", "run": "dialecte rules", "scoped": true }
			],
			"release": [
				{ "name": "check", "run": "npm run check" },
				{ "name": "skills", "run": "npm run skills:check" },
				{ "name": "build", "run": "npm run build" },
				{ "name": "tests", "run": "npm run test:node", "counts": "tests" },
				{
					"name": "browser tests",
					"run": "npm run test:browser:release",
					"counts": "tests",
					"heavy": true
				},
				{ "name": "type narrowing", "run": "npm run type-narrowing" },
				{ "name": "type bench", "run": "npm run type-bench:check" }
			]
		}
	}
}
`

/** The scoped browser test step: it writes a selection of one test (the scoped contract), then prints one vitest count. */
const SCOPE_SCRIPT = `changed=$(tr -cd '\\0' < "$DIALECTE_GATE_CHANGED" | wc -c | tr -d ' ')
printf '{"schema":1,"base":"%s","tree":"%s","changed":%s,"selected":[{"id":"T0","reasons":["always"]}],"skipped":[]}\\n' "$DIALECTE_GATE_BASE" "$DIALECTE_GATE_TREE" "$changed" > "$DIALECTE_GATE_SELECTION"
printf '      Tests  4 passed (4)\\n'
`

/** A change breaking a code rule: an `await` inside an argument. */
const AWAIT_IN_ARGUMENT_SOURCE = `export async function totalOf(params: {
	count: (size: number) => number
	read: () => Promise<number>
}): Promise<number> {
	return params.count(await params.read())
}
`

/** The same change, the awaited value named first. */
const CLEAN_SOURCE = `export async function totalOf(params: {
	count: (size: number) => number
	read: () => Promise<number>
}): Promise<number> {
	const size = await params.read()
	return params.count(size)
}
`

/** A core-shaped package on `main`, then `feat/x` cut from it with `source` staged as `src/total.ts`: what a commit records. */
function createCoreShapedChange(source: string): string {
	const root = createScratchRepository({
		'package.json': CORE_SHAPED_PACKAGE_JSON,
		'scope.sh': SCOPE_SCRIPT,
		'.gitignore': 'node_modules\n',
	})
	git({ root, args: ['checkout', '-q', '-b', 'feat/x'] })
	writeFiles({ root, files: { 'src/total.ts': source } })
	git({ root, args: ['add', '-A'] })
	return root
}

describe('resolveHookSteps of a core-shaped package', () => {
	it('no hook list → every full step, the scoped rules step included, in list order', () => {
		const packageJson = JSON.parse(CORE_SHAPED_PACKAGE_JSON) as PackageJson

		expect(
			resolveHookSteps({ packageJson }).map((step) => [step.name, step.scoped === true]),
		).toEqual([
			['check', false],
			['skills', false],
			['build', false],
			['tests', false],
			['browser tests', true],
			['rules', true],
			['type-narrowing', false],
		])
	})
})

describe('gate --hook runs a scoped rules step', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a core-shaped package and a staged change breaking a code rule → the hook fails at rules, naming the rule', async () => {
		const root = createCoreShapedChange(AWAIT_IN_ARGUMENT_SOURCE)

		const result = await runHookIn({ cwd: root })

		expect(result.exitCode).toBe(1)
		expect(result.output).toMatch(/^src\/total\.ts:\d+:\d+ +error +await-in-argument\b/m)
		expect(result.output).toMatch(/^gate --hook: failed at rules$/m)
	})

	it('a core-shaped package and a clean staged change → the hook runs rules over the change against the hook base, green', async () => {
		const root = createCoreShapedChange(CLEAN_SOURCE)
		const base = git({ root, args: ['rev-parse', 'main'] }).trim()

		const result = await runHookIn({ cwd: root })

		expect(result.exitCode).toBe(0)
		expect(result.output).toMatch(/^ok +rules\b/m)
		expect(result.output).toContain(`gate --hook: base ${base} (base-branch)`)
	})
})
