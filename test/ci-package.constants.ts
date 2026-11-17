/** The scratch packages of the `dialecte ci` tests. */

/** A package with the one script the template requires (publish.yml builds it) and nothing optional. */
export const PLAIN_PACKAGE_JSON = JSON.stringify({
	name: '@scratch/pkg',
	version: '1.0.0',
	scripts: { build: 'tsup', check: 'tsc --noEmit' },
})

/** The repository's own test workflow: callable, no inputs. */
export const OWN_TEST_WORKFLOW =
	'name: _test\non:\n  workflow_call:\njobs:\n  test:\n    runs-on: ubuntu-24.04\n    steps:\n      - run: npm test\n'

/** Where the repository's own test workflow lives. */
export const OWN_TEST_PATH = '.github/workflows/_test.yml'

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
