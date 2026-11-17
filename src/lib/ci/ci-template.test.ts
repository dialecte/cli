/**
 * The CI template rendered for a package's facts: which files it gets, the ci.yml jobs, how the workflows run the
 * cli, and the repository's own `_test.yml` contract.
 */
import { readCiTemplate, renderCiFiles, testContractOf } from './ci-template.ts'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

import type { CiFacts, CiFiles } from './ci-template.types.ts'

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

/**
 * What a test reads of the rendered files; a slot left is the cli slot, or a `{{` not opening a GitHub `${{ }}`
 * expression.
 */
function summaryOf(files: CiFiles): {
	paths: string[]
	ciJobs: string[]
	ciOkNeeds: string[]
	testWith: unknown
	cliRuns: string[]
	playwright: boolean
	slotsLeft: string[]
} {
	const ci = parse(files.get('.github/workflows/ci.yml') ?? '') as {
		jobs: Record<string, { needs?: string[]; with?: unknown }>
	}
	const runs = [...files.values()].flatMap((text) =>
		text
			.split('\n')
			.map((line) => /^\s*(?:- )?run: (.*\bci [a-z-]+)$/.exec(line)?.[1])
			.filter((run): run is string => run !== undefined),
	)
	return {
		paths: [...files.keys()].sort(),
		ciJobs: Object.keys(ci.jobs).sort(),
		ciOkNeeds: [...(ci.jobs['ci-ok']?.needs ?? [])].sort(),
		testWith: ci.jobs.test?.with,
		cliRuns: runs.sort(),
		playwright: (files.get('.github/workflows/_install.yml') ?? '').includes('playwright'),
		slotsLeft: [...files]
			.filter(([, text]) => /(?<!\$)\{\{|__dialecte_cli__/.test(text))
			.map(([path]) => path),
	}
}

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
		})
	})

	it('a core-shaped package → the workflows run the installed cli; type-perf and docs jobs; test passes mode; the install job installs Playwright', () => {
		expect(summaryOf(renderCiFiles({ facts: CORE, template: readCiTemplate() }))).toEqual({
			paths: [...ALWAYS, '.github/workflows/_docs.yml', '.github/workflows/_type-perf.yml'].sort(),
			ciJobs: ['build', 'check', 'ci-ok', 'docs', 'install', 'test', 'type-perf'],
			ciOkNeeds: ['build', 'check', 'docs', 'install', 'test', 'type-perf'],
			testWith: { mode: "${{ github.event_name == 'pull_request' && 'pr' || 'full' }}" },
			cliRuns: ['npx dialecte ci check', 'npx dialecte ci publish-decision'],
			playwright: true,
			slotsLeft: [],
		})
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
