/** The scratch packages of the `dialecte ci` tests. */
export { OWN_TEST_PATH } from '../src/lib/ci/ci-template.constants.ts'

/** A package with the one script the template requires (publish.yml builds it) and nothing optional. */
export const PLAIN_PACKAGE_JSON = JSON.stringify({
	name: '@scratch/pkg',
	version: '1.0.0',
	scripts: { build: 'tsup', check: 'tsc --noEmit' },
})

/** The repository's own test workflow: callable, no inputs. */
export const OWN_TEST_WORKFLOW =
	'name: _test\non:\n  workflow_call:\njobs:\n  test:\n    runs-on: ubuntu-24.04\n    steps:\n      - run: npm test\n'

/** The files a plain package gets from the template, sorted. */
export const PLAIN_PACKAGE_PATHS = [
	'.github/pull_request_template.md',
	'.github/workflows/_build.yml',
	'.github/workflows/_check-npm-version.yml',
	'.github/workflows/_check.yml',
	'.github/workflows/_extract-version.yml',
	'.github/workflows/_install.yml',
	'.github/workflows/_publish.yml',
	'.github/workflows/_tag-release.yml',
	'.github/workflows/ci.yml',
	'.github/workflows/publish.yml',
	'.nvmrc',
	'changes/.gitkeep',
] as const

/** A package shaped like the core library: type gates, a docs site, browser tests, a test workflow taking a mode. */
export const CORE_SHAPED_PACKAGE_JSON = JSON.stringify({
	name: '@scratch/core',
	version: '1.0.0',
	scripts: {
		build: 'vite build',
		check: 'tsc --noEmit',
		'type-bench:check': 'bench --check',
		'doc:build': 'vitepress build',
	},
	devDependencies: { playwright: '1.0.0' },
})

/** The cli's own package: its workflows run it from its sources. */
export const CLI_SHAPED_PACKAGE_JSON = JSON.stringify({
	name: '@dialecte/cli',
	version: '1.0.0',
	scripts: { build: 'tsup', check: 'tsc --noEmit' },
})

/** The repository's own test workflow taking the mode ci.yml passes. */
export const OWN_TEST_WORKFLOW_WITH_MODE =
	'name: _test\non:\n  workflow_call:\n    inputs:\n      mode:\n        type: string\n        required: true\njobs:\n  test:\n    runs-on: ubuntu-24.04\n    steps:\n      - run: npm test\n'

/** The workflow that fills the node_modules cache: the one place a miss installs. */
export const INSTALL_WORKFLOW = '.github/workflows/_install.yml'
