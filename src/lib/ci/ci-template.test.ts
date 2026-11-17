/**
 * The CI template rendered for a package's facts: which files it gets, the ci.yml jobs, how the workflows run the
 * cli, and the repository's own `_test.yml` contract.
 */
import { summaryOf } from '../../../test/ci-summary.ts'
import { readCiTemplate, renderCiFiles, testContractOf } from './ci-template.ts'

import { describe, expect, it } from 'vitest'

import type { CiFacts } from './ci-template.types.ts'

/** The paths every package gets, whatever its facts. */
const ALWAYS = [
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
]

const CLI: CiFacts = {
	cli: 'source',
	typePerf: false,
	docs: false,
	playwright: false,
	testMode: false,
}

const CORE: CiFacts = {
	cli: 'installed',
	typePerf: true,
	docs: true,
	playwright: true,
	testMode: true,
}

describe('renderCiFiles', () => {
	it('the cli package → the workflows run the cli from its sources; jobs install, build, check, test, ci-ok; no type-perf or docs files; test passes no mode', () => {
		expect(summaryOf(renderCiFiles({ facts: CLI, template: readCiTemplate() }))).toEqual({
			paths: ALWAYS,
			ciJobs: ['build', 'check', 'ci-ok', 'install', 'test'],
			ciOkNeeds: ['build', 'check', 'install', 'test'],
			testWith: undefined,
			cliRuns: ['node src/cli.ts ci check', 'node src/cli.ts ci publish-decision'],
			playwright: false,
			slotsLeft: [],
			restoresFailOnMiss: true,
		})
	})

	it('a core-shaped package → the workflows run the installed cli; type-perf and docs jobs; test passes mode; the install job installs Playwright', () => {
		expect(summaryOf(renderCiFiles({ facts: CORE, template: readCiTemplate() }))).toEqual({
			paths: [...ALWAYS, '.github/workflows/_docs.yml', '.github/workflows/_type-perf.yml'].sort(),
			ciJobs: ['build', 'check', 'ci-ok', 'docs', 'install', 'test', 'type-perf'],
			ciOkNeeds: ['build', 'check', 'docs', 'install', 'test', 'type-perf'],
			testWith: { mode: "${{ github.event_name == 'pull_request' && 'pr' || 'full' }}" },
			cliRuns: [
				'npx --no-install dialecte ci check',
				'npx --no-install dialecte ci publish-decision',
			],
			playwright: true,
			slotsLeft: [],
			restoresFailOnMiss: true,
		})
	})
})

describe('the rendered publish.yml', () => {
	it('→ its header says npm trusted publishing names the file and its trigger: never renamed, never retriggered', () => {
		const header = (
			renderCiFiles({ facts: CORE, template: readCiTemplate() }).get(
				'.github/workflows/publish.yml',
			) ?? ''
		)
			.split('\n')
			.filter((line) => line.startsWith('#'))
			.join(' ')

		expect({
			namesTrustedPublishing: header.includes(
				'npm trusted publishing names this file (publish.yml) and its push trigger',
			),
			neverRenamed: header.includes('never rename it, never'),
		}).toEqual({ namesTrustedPublishing: true, neverRenamed: true })
	})
})

describe('testContractOf', () => {
	it.each([
		{
			name: 'no _test.yml → missing',
			text: undefined,
			contract: {
				present: false,
				mode: false,
				findings: ['is missing: the repository owns its tests, ci.yml calls it'],
			},
		},
		{
			name: 'a workflow_call with no inputs → met, no mode',
			text: 'on:\n  workflow_call:\njobs: {}\n',
			contract: { present: true, mode: false, findings: [] },
		},
		{
			name: 'a string mode input → met, mode passed',
			text: 'on:\n  workflow_call:\n    inputs:\n      mode:\n        type: string\n        required: true\njobs: {}\n',
			contract: { present: true, mode: true, findings: [] },
		},
		{
			name: 'a mode input that is no string → a finding',
			text: 'on:\n  workflow_call:\n    inputs:\n      mode:\n        type: boolean\njobs: {}\n',
			contract: {
				present: true,
				mode: false,
				findings: ['its mode input takes boolean: ci.yml passes the string pr or full'],
			},
		},
		{
			name: 'no workflow_call trigger → a finding',
			text: 'on:\n  push:\njobs: {}\n',
			contract: {
				present: true,
				mode: false,
				findings: ['has no workflow_call trigger: ci.yml calls it'],
			},
		},
		{
			name: 'no readable YAML → a finding',
			text: 'on: [\n',
			contract: { present: true, mode: false, findings: ['is no readable YAML'] },
		},
	])('$name', ({ text, contract }) => {
		expect(testContractOf(text)).toEqual(contract)
	})
})
