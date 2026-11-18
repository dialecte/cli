/** The files and lines of the `handover` refusal in a CI-first repository (`handover-ci-first.test.ts`). */

/** A ci.yml the merge queue runs (`merge_group`) holding the `ci-ok` job its ruleset requires. */
export const CI_FIRST_FILES = {
	'.github/workflows/ci.yml': [
		'name: ci',
		'on:',
		'  pull_request:',
		'    branches:',
		'      - main',
		'  merge_group:',
		'jobs:',
		'  ci-ok:',
		'    name: ci-ok',
		'    runs-on: ubuntu-latest',
		'',
	].join('\n'),
}

/** The lot's change. */
export const CI_FIRST_CHANGES = { 'src/read.ts': 'export function read() {\n\treturn 1\n}\n' }

/** The refusal names the CI-first flow: commit on the lot branch through the hook, then land it. */
export const CI_FIRST_REFUSAL =
	/CI-first.*commit on the lot branch through the hook.*lot land <id>; nothing written/s
