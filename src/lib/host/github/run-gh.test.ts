/**
 * `runGh` runs one declared `gh` call: an option its table entry does not declare does not compile (so `--json` on a
 * read that has `fields`, or any flag on an entry with none), argv follows the build order (words, endpoint,
 * positional, options, the implied flags), and the call's kind sets the timeout. A fake `gh` on the PATH writes the
 * argv it received; the timeout is read from the options `spawnSync` was handed.
 */
import { spawnSync } from 'node:child_process'
import { chmodSync, readFileSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'

import { temporaryFolder } from '../../../../test/scratch-repository.ts'
import { HOST_READ_TIMEOUT_MS, HOST_WRITE_TIMEOUT_MS } from '../host.constants.ts'
import { GITHUB_CALLS } from './github-calls.constants.ts'
import { impliedFlagsOf, runGh } from './run-gh.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { HostCallTable, HostOptions } from '../host.types.ts'

vi.mock('node:child_process', async function wrapSpawn(importOriginal) {
	const actual = await importOriginal<typeof import('node:child_process')>()
	return { ...actual, spawnSync: vi.fn(actual.spawnSync) }
})

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** A `gh` first on the PATH that answers `{}` and writes its arguments to `gh.args`, one per line. */
function fakeGh(): string {
	const folder = temporaryFolder('dialecte-fake-gh-run-')
	const script = join(folder, 'gh')
	writeFileSync(
		script,
		`#!/bin/sh\nprintf '%s\\n' "$@" > '${join(folder, 'gh.args')}'\nprintf '%s' '{}'\n`,
	)
	chmodSync(script, 0o755)
	vi.stubEnv('PATH', `${folder}${delimiter}${process.env.PATH ?? ''}`)
	return folder
}

/** The arguments the fake `gh` received. */
function argvOf(folder: string): string[] {
	return readFileSync(join(folder, 'gh.args'), 'utf8').trimEnd().split('\n')
}

describe('runGh: the table refuses what an entry does not declare', () => {
	it.each([
		{
			label: 'an option an entry with flags does not declare (mergePullRequest)',
			act: () =>
				runGh({
					root: process.cwd(),
					call: 'mergePullRequest',
					positional: ['7'],
					// @ts-expect-error '--bogus' is not a flag of mergePullRequest
					options: { '--bogus': true },
				}),
		},
		{
			label: '-f on queuedState, which has flags: the query is implied by the entry',
			act: () =>
				runGh({
					root: process.cwd(),
					call: 'queuedState',
					// @ts-expect-error '-f' is implied by the entry's graphql, never an option
					options: { '-f': 'query=x' },
				}),
		},
		{
			label: '--jq on reviewComments, which has flags: the filter is implied by the entry',
			act: () =>
				runGh({
					root: process.cwd(),
					call: 'reviewComments',
					values: { number: '1' },
					// @ts-expect-error '--jq' is implied by the entry's filter, never an option
					options: { '--jq': '.x' },
				}),
		},
		{
			label: '--json on viewPullRequest: the spec passes its own fields',
			act: () =>
				runGh({
					root: process.cwd(),
					call: 'viewPullRequest',
					positional: ['7'],
					// @ts-expect-error '--json' is implied by the entry's fields, never an option
					options: { '--json': 'number' },
				}),
		},
		{
			label: 'any option on an entry that declares no flags (closePullRequest)',
			act: () =>
				runGh({
					root: process.cwd(),
					call: 'closePullRequest',
					positional: ['7'],
					// @ts-expect-error closePullRequest declares no flag
					options: { '--delete-branch': true },
				}),
		},
	])('$label → a compile error', ({ act }) => {
		fakeGh()

		expect(act).not.toThrow()
	})
})

describe('HostOptions on a fixture vendor table', () => {
	const FIXTURE = {
		bare: { words: ['bare'], flags: [], kind: 'read' },
		flagged: { words: ['flagged'], flags: ['--one'], kind: 'write' },
	} as const satisfies HostCallTable

	it('an entry with no flags and one with flags each refuse an undeclared key', () => {
		// @ts-expect-error bare declares no flag
		const _none: HostOptions<typeof FIXTURE, 'bare'> = { '--one': true }
		const declared: HostOptions<typeof FIXTURE, 'flagged'> = { '--one': true }
		// @ts-expect-error '--two' is not a flag of flagged
		const _undeclared: HostOptions<typeof FIXTURE, 'flagged'> = { '--two': true }

		expect({ entries: Object.keys(FIXTURE), declared }).toEqual({
			entries: ['bare', 'flagged'],
			declared: { '--one': true },
		})
	})
})

describe('runGh: argv in the build order', () => {
	it.each([
		{
			label: 'positional and a flag alone (true)',
			call: { call: 'mergePullRequest', positional: ['7'], options: { '--auto': true } },
			argv: ['pr', 'merge', '7', '--auto'],
		},
		{
			label: 'a string option → the flag then its value',
			call: {
				call: 'editPullRequest',
				positional: ['7'],
				options: { '--title': 'feat: x', '--body-file': '-' },
			},
			argv: ['pr', 'edit', '7', '--title', 'feat: x', '--body-file', '-'],
		},
		{
			label: 'an array option → the flag repeated; an undefined option left out',
			call: {
				call: 'createPullRequest',
				options: { '--title': ['a', 'b'], '--draft': undefined },
			},
			argv: ['pr', 'create', '--title', 'a', '--title', 'b'],
		},
		{
			label: 'fields → --json after the positional',
			call: { call: 'viewChecks', positional: ['7'] },
			argv: ['pr', 'view', '7', '--json', 'headRefOid,statusCheckRollup'],
		},
		{
			label: 'an endpoint with {number} filled, {owner} and {repo} kept, then the option and --jq',
			call: {
				call: 'reviewComments',
				values: { number: '12' },
				options: { '--paginate': true },
			},
			argv: [
				'api',
				'repos/{owner}/{repo}/pulls/12/comments',
				'--paginate',
				'--jq',
				GITHUB_CALLS.reviewComments.filter,
			],
		},
		{
			label: 'an endpoint with {owner} filled too',
			call: {
				call: 'reviewComments',
				values: { owner: 'o', repo: 'r', number: '12' },
			},
			argv: ['api', 'repos/o/r/pulls/12/comments', '--jq', GITHUB_CALLS.reviewComments.filter],
		},
		{
			label: 'graphql → the endpoint, the options, -f query=, then --jq',
			call: {
				call: 'queuedState',
				options: { '-F': ['owner={owner}', 'repo={repo}', 'number=7'] },
			},
			argv: [
				'api',
				'graphql',
				'-F',
				'owner={owner}',
				'-F',
				'repo={repo}',
				'-F',
				'number=7',
				'-f',
				`query=${GITHUB_CALLS.queuedState.graphql}`,
				'--jq',
				'.data.repository.pullRequest',
			],
		},
	] as const)('$label', ({ call, argv }) => {
		const folder = fakeGh()

		const run = vi.fn(() => runGh({ root: process.cwd(), ...call } as Parameters<typeof runGh>[0]))

		expect(run).not.toThrow()
		expect({ run: run.mock.results[0]?.value, argv: argvOf(folder) }).toEqual({
			run: { output: '{}' },
			argv,
		})
	})
})

describe('runGh: the implied flags come from one function', () => {
	it('a spec with fields, a query and a filter → --json, -f query=, --jq, in that order', () => {
		expect(
			impliedFlagsOf({
				words: ['x'],
				flags: [],
				kind: 'read',
				fields: ['a', 'b'],
				graphql: 'query{x}',
				filter: '.x',
			}),
		).toEqual(['--json', 'a,b', '-f', 'query=query{x}', '--jq', '.x'])
	})

	it('a spec with none of them → nothing implied', () => {
		expect(impliedFlagsOf({ words: ['x'], flags: [], kind: 'write' })).toEqual([])
	})
})

describe('runGh: the timeout follows the call kind', () => {
	it.each([
		{ label: 'a read', call: 'viewPullRequest', timeout: HOST_READ_TIMEOUT_MS },
		{ label: 'a write', call: 'closePullRequest', timeout: HOST_WRITE_TIMEOUT_MS },
	] as const)('$label → its timeout', ({ call, timeout }) => {
		fakeGh()

		expect(() => runGh({ root: process.cwd(), call, positional: ['7'] })).not.toThrow()

		const options = vi.mocked(spawnSync).mock.calls.at(-1)?.[2]
		expect(options?.timeout).toBe(timeout)
	})
})
