/**
 * The landing flow in one place: a repository is CI-first when its `ci.yml` runs on the merge queue (`merge_group`)
 * and holds the `ci-ok` job the queue's ruleset requires, anything else lands through a hand-over; each flow names a
 * working lot's next line and refuses the other flow's landing verbs.
 */
import { temporaryFolder, writeFiles } from '../../../test/scratch-repository.ts'
import { flowRefusalOf, landingFlow, landingFlowOf } from './flow.ts'

import { describe, expect, it } from 'vitest'

import type { LandingFlowName } from './flow.types.ts'

const CI_PATH = '.github/workflows/ci.yml'

const CI_FIRST_YAML = [
	'name: ci',
	'on: [pull_request, merge_group]',
	'jobs:',
	'  ci-ok:',
	'    name: ci-ok',
	'',
].join('\n')

describe('landingFlowOf', () => {
	it.each<{ name: string; files: Record<string, string>; flow: LandingFlowName }>([
		{
			name: 'ci.yml with merge_group and a ci-ok job → ci-first',
			files: {
				[CI_PATH]: [
					'name: ci',
					'on:',
					'  pull_request:',
					'    branches:',
					'      - main',
					'  merge_group:',
					'jobs:',
					'  check:',
					'    runs-on: ubuntu-latest',
					'  ci-ok:',
					'    name: ci-ok',
					'    needs:',
					'      - check',
					'',
				].join('\n'),
			},
			flow: 'ci-first',
		},
		{
			name: 'ci.yml without merge_group → hand-over',
			files: {
				[CI_PATH]: [
					'name: ci',
					'on:',
					'  pull_request:',
					'jobs:',
					'  ci-ok:',
					'    name: ci-ok',
					'',
				].join('\n'),
			},
			flow: 'hand-over',
		},
		{
			name: 'ci.yml without a ci-ok job → hand-over',
			files: {
				[CI_PATH]: [
					'name: ci',
					'on:',
					'  merge_group:',
					'jobs:',
					'  check:',
					'    runs-on: ubuntu-latest',
					'',
				].join('\n'),
			},
			flow: 'hand-over',
		},
		{
			name: 'no workflows folder → hand-over',
			files: { 'package.json': '{ "name": "demo" }\n' },
			flow: 'hand-over',
		},
		{
			name: 'ci.yml that is no YAML → hand-over',
			files: { [CI_PATH]: 'on: [merge_group\njobs: {ci-ok\n' },
			flow: 'hand-over',
		},
		{
			name: 'merge_group in the list form of on → ci-first',
			files: {
				[CI_PATH]: [
					'name: ci',
					'on: [pull_request, merge_group]',
					'jobs:',
					'  ci-ok:',
					'    name: ci-ok',
					'',
				].join('\n'),
			},
			flow: 'ci-first',
		},
	])('$name', ({ files, flow }) => {
		const root = temporaryFolder('dialecte-flow-')
		writeFiles({ root, files })

		expect(landingFlowOf(root)).toBe(flow)
	})
})

describe('landingFlow', () => {
	it.each<{ flow: LandingFlowName; manualNext: string; refused: string[] }>([
		{
			flow: 'ci-first',
			manualNext: 'run the stations, then dialecte lot land {name}',
			refused: ['handover write', 'handover run'],
		},
		{
			flow: 'hand-over',
			manualNext: 'run the stations, then dialecte handover write <lots.json> --out {name}',
			refused: ['lot land', 'lot approve'],
		},
	])('the $flow flow -> its next line and its refused verbs', ({ flow, manualNext, refused }) => {
		expect(landingFlow(flow)).toEqual({ manualNext, refused })
	})
})

/** The CI-first refusal of `<command> <verb>` in `root`. */
function ciFirstRefusal(params: { command: string; verb: string; root: string }): string {
	return `${params.command} ${params.verb}: ${params.root} is CI-first (.github/workflows/ci.yml runs on merge_group and holds the ci-ok job): a lot lands through its change request, never a hand-over; commit on the lot branch through the hook, then lot land <id>; nothing written`
}

/** The hand-over refusal of `<command> <verb>` in `root`. */
function handOverRefusal(params: { command: string; verb: string; root: string }): string {
	return `${params.command} ${params.verb}: ${params.root} lands through a hand-over (no .github/workflows/ci.yml running on merge_group with a ci-ok job): run the stations, then handover write <lots.json>; nothing written`
}

const CI_FIRST_FILES = { [CI_PATH]: CI_FIRST_YAML }

describe('flowRefusalOf', () => {
	it.each<{
		title: string
		files: Record<string, string>
		command: string
		verb: string
		expected: (root: string) => string | undefined
	}>([
		{
			title: 'CI-first: handover write -> refused naming the flow and lot land',
			files: CI_FIRST_FILES,
			command: 'handover',
			verb: 'write',
			expected: (root) => ciFirstRefusal({ command: 'handover', verb: 'write', root }),
		},
		{
			title: 'CI-first: handover run -> refused',
			files: CI_FIRST_FILES,
			command: 'handover',
			verb: 'run',
			expected: (root) => ciFirstRefusal({ command: 'handover', verb: 'run', root }),
		},
		{
			title: 'CI-first: lot land -> allowed',
			files: CI_FIRST_FILES,
			command: 'lot',
			verb: 'land',
			expected: () => undefined,
		},
		{
			title: 'hand-over: handover run -> allowed',
			files: {},
			command: 'handover',
			verb: 'run',
			expected: () => undefined,
		},
		{
			title: 'hand-over: lot land -> refused naming the hand-over flow',
			files: {},
			command: 'lot',
			verb: 'land',
			expected: (root) => handOverRefusal({ command: 'lot', verb: 'land', root }),
		},
	])('$title', ({ files, command, verb, expected }) => {
		const root = temporaryFolder('dialecte-flow-')
		writeFiles({ root, files })

		expect(flowRefusalOf({ root, command, verb })).toEqual(expected(root))
	})
})
