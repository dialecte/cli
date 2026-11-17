/**
 * `readCiFacts` on scratch packages: what their package.json and own `_test.yml` say decides the rendered CI - the
 * jobs, the tests' mode input, the Playwright install and how the workflows run the cli.
 */
import {
	CLI_SHAPED_PACKAGE_JSON,
	CORE_SHAPED_PACKAGE_JSON,
	OWN_TEST_PATH,
	OWN_TEST_WORKFLOW_WITH_MODE,
} from '../../../test/ci-package.constants.ts'
import { ciPackage } from '../../../test/ci-package.ts'
import { summaryOf } from '../../../test/ci-summary.ts'
import { readCiFacts } from './ci-facts.ts'
import { readCiTemplate, renderCiFiles } from './ci-template.ts'

import { describe, expect, it } from 'vitest'

/** The rendered summary of a package's facts, or its refusal. */
function renderedOf(root: string): unknown {
	const read = readCiFacts(root)
	if ('refusal' in read) return read
	const summary = summaryOf(renderCiFiles({ facts: read.facts, template: readCiTemplate() }))
	return {
		ciJobs: summary.ciJobs,
		testWith: summary.testWith,
		playwright: summary.playwright,
		cliRuns: summary.cliRuns,
		restoresFailOnMiss: summary.restoresFailOnMiss,
	}
}

describe('readCiFacts', () => {
	it.each([
		{
			name: 'a core-shaped package (type-bench:check, doc:build, playwright, a _test.yml taking mode) → type-perf and docs jobs, mode passed, Playwright installed, the installed cli',
			files: {
				'package.json': CORE_SHAPED_PACKAGE_JSON,
				[OWN_TEST_PATH]: OWN_TEST_WORKFLOW_WITH_MODE,
			},
			rendered: {
				ciJobs: ['build', 'check', 'ci-ok', 'docs', 'install', 'test', 'type-perf'],
				testWith: { mode: "${{ github.event_name == 'pull_request' && 'pr' || 'full' }}" },
				playwright: true,
				cliRuns: [
					'npx --no-install dialecte ci check',
					'npx --no-install dialecte ci publish-decision',
				],
				restoresFailOnMiss: true,
			},
		},
		{
			name: 'a plain package → the base jobs, no mode, no Playwright, the installed cli',
			files: {},
			rendered: {
				ciJobs: ['build', 'check', 'ci-ok', 'install', 'test'],
				testWith: undefined,
				playwright: false,
				cliRuns: [
					'npx --no-install dialecte ci check',
					'npx --no-install dialecte ci publish-decision',
				],
				restoresFailOnMiss: true,
			},
		},
		{
			name: 'the cli package (@dialecte/cli) → the cli from its sources',
			files: { 'package.json': CLI_SHAPED_PACKAGE_JSON },
			rendered: {
				ciJobs: ['build', 'check', 'ci-ok', 'install', 'test'],
				testWith: undefined,
				playwright: false,
				cliRuns: ['node src/cli.ts ci check', 'node src/cli.ts ci publish-decision'],
				restoresFailOnMiss: true,
			},
		},
	])('$name', ({ files, rendered }) => {
		expect(renderedOf(ciPackage({ files }))).toEqual(rendered)
	})
})
