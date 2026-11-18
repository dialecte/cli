/**
 * The GitHub adapter's review reads: the checks on a pull request's head, its line comments, and its changed files
 * opened in the browser. A fake `gh` (or browser opener) on the PATH answers as the real one does.
 */
import { chmodSync, readFileSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'

import { temporaryFolder } from '../../../../test/scratch-repository.ts'
import { BROWSER_OPENERS } from '../host.constants.ts'
import { createGithubHost } from './github-host.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/**
 * Commands named `names` that print `stdout` and exit `code`, first on the PATH; each writes its arguments to
 * `<name>.args` in the folder answered.
 */
function fakeCommands(params: { names: string[]; stdout?: string; code?: number }): string {
	const folder = temporaryFolder('dialecte-fake-gh-')
	for (const name of params.names) {
		const script = join(folder, name)
		writeFileSync(
			script,
			`#!/bin/sh\nprintf '%s\\n' "$@" > '${join(folder, `${name}.args`)}'\nprintf '%s' '${params.stdout ?? ''}'\nexit ${params.code ?? 0}\n`,
		)
		chmodSync(script, 0o755)
	}
	vi.stubEnv('PATH', `${folder}${delimiter}${process.env.PATH ?? ''}`)
	return folder
}

/** `gh pr view --json headRefOid,statusCheckRollup` as gh writes it for these rollup entries. */
function rollupOf(entries: object[]): string {
	return JSON.stringify({ headRefOid: 'abc', statusCheckRollup: entries })
}

describe('createGithubHost: checks', () => {
	it.each([
		{
			label: 'every check passed (success, skipped, neutral, a success status)',
			entries: [
				{ __typename: 'CheckRun', name: 'ci-ok', status: 'COMPLETED', conclusion: 'SUCCESS' },
				{ __typename: 'CheckRun', name: 'docs', status: 'COMPLETED', conclusion: 'SKIPPED' },
				{ __typename: 'CheckRun', name: 'lint', status: 'COMPLETED', conclusion: 'NEUTRAL' },
				{ __typename: 'StatusContext', context: 'legacy', state: 'SUCCESS' },
			],
			checks: { head: 'abc', state: 'green', failing: [], pending: [] },
		},
		{
			label: 'a failing check beside a pending one',
			entries: [
				{ __typename: 'CheckRun', name: 'ci-ok', status: 'COMPLETED', conclusion: 'FAILURE' },
				{ __typename: 'CheckRun', name: 'shard 2', status: 'IN_PROGRESS', conclusion: '' },
				{ __typename: 'StatusContext', context: 'legacy', state: 'ERROR' },
			],
			checks: { head: 'abc', state: 'failing', failing: ['ci-ok', 'legacy'], pending: ['shard 2'] },
		},
		{
			label: 'a pending check only',
			entries: [
				{ __typename: 'CheckRun', name: 'ci-ok', status: 'COMPLETED', conclusion: 'SUCCESS' },
				{ __typename: 'StatusContext', context: 'legacy', state: 'PENDING' },
			],
			checks: { head: 'abc', state: 'pending', failing: [], pending: ['legacy'] },
		},
		{
			label: 'no check on the head',
			entries: [],
			checks: { head: 'abc', state: 'none', failing: [], pending: [] },
		},
	])('gh pr view of $label → read as such', ({ entries, checks }) => {
		const root = fakeCommands({ names: ['gh'], stdout: rollupOf(entries) })

		expect(createGithubHost().readChecks({ root, number: 12 })).toEqual(checks)
		expect(readFileSync(join(root, 'gh.args'), 'utf8').split('\n')).toEqual([
			'pr',
			'view',
			'12',
			'--json',
			'headRefOid,statusCheckRollup',
			'',
		])
	})

	it('a check failed then run again and passed → green: only the newest run of a check counts', () => {
		const root = fakeCommands({
			names: ['gh'],
			stdout: rollupOf([
				{
					__typename: 'CheckRun',
					name: 'shard 2',
					workflowName: 'ci',
					status: 'COMPLETED',
					conclusion: 'FAILURE',
					startedAt: '2026-11-17T10:00:00Z',
				},
				{
					__typename: 'CheckRun',
					name: 'shard 2',
					workflowName: 'ci',
					status: 'COMPLETED',
					conclusion: 'SUCCESS',
					startedAt: '2026-11-17T10:30:00Z',
				},
			]),
		})

		expect(createGithubHost().readChecks({ root, number: 12 })).toEqual({
			head: 'abc',
			state: 'green',
			failing: [],
			pending: [],
		})
	})

	it('a failed check run again and still queued without a start time → pending, never the failed run', () => {
		const root = fakeCommands({
			names: ['gh'],
			stdout: rollupOf([
				{
					__typename: 'CheckRun',
					name: 'shard 2',
					workflowName: 'ci',
					status: 'COMPLETED',
					conclusion: 'FAILURE',
					startedAt: '2026-11-17T10:00:00Z',
				},
				{
					__typename: 'CheckRun',
					name: 'shard 2',
					workflowName: 'ci',
					status: 'QUEUED',
					conclusion: '',
					startedAt: '0001-01-01T00:00:00Z',
				},
			]),
		})

		expect(createGithubHost().readChecks({ root, number: 12 })).toEqual({
			head: 'abc',
			state: 'pending',
			failing: [],
			pending: ['shard 2'],
		})
	})

	it('gh failing → a refusal naming the call', () => {
		const root = fakeCommands({ names: ['gh'], code: 1 })

		expect(createGithubHost().readChecks({ root, number: 12 })).toEqual({
			refusal: 'gh pr view: exit 1',
		})
	})
})

describe('createGithubHost: line comments', () => {
	it('the comments of a pull request → each with its id, file, line and text, a reply with what it answers', () => {
		const lines = [
			{ id: 1, path: 'src/a.ts', line: 4, body: 'blocking: a is wrong', replyTo: null },
			{ id: 2, path: 'src/a.ts', line: 4, body: 'agreed', replyTo: 1 },
			{ id: 3, path: 'README.md', line: null, body: 'nit: file level', replyTo: null },
		]
		const root = fakeCommands({
			names: ['gh'],
			stdout: lines.map((line) => JSON.stringify(line)).join('\n'),
		})

		expect(createGithubHost().readReviewComments({ root, number: 12 })).toEqual([
			{ id: 1, path: 'src/a.ts', line: 4, body: 'blocking: a is wrong' },
			{ id: 2, path: 'src/a.ts', line: 4, body: 'agreed', replyTo: 1 },
			{ id: 3, path: 'README.md', body: 'nit: file level' },
		])
		const args = readFileSync(join(root, 'gh.args'), 'utf8').split('\n')
		expect(args.slice(0, 3)).toEqual([
			'api',
			'repos/{owner}/{repo}/pulls/12/comments',
			'--paginate',
		])
	})

	it('no comment → none', () => {
		const root = fakeCommands({ names: ['gh'], stdout: '' })

		expect(createGithubHost().readReviewComments({ root, number: 12 })).toEqual([])
	})

	it('a line that is not a comment → a refusal, never a partial list', () => {
		const root = fakeCommands({ names: ['gh'], stdout: '{"id":"x"}' })

		expect(createGithubHost().readReviewComments({ root, number: 12 })).toEqual({
			refusal: 'gh api: not a review comment: {"id":"x"}',
		})
	})
})

describe('createGithubHost: changed files', () => {
	it('the changed files asked for → the browser opened on the files tab of the pull request', () => {
		const root = fakeCommands({ names: Object.values(BROWSER_OPENERS).map((opener) => opener[0]) })
		const opener = BROWSER_OPENERS[process.platform] ?? BROWSER_OPENERS.default

		expect(
			createGithubHost().openFiles({ root, url: 'https://github.test/pull/12' }),
		).toBeUndefined()
		expect(readFileSync(join(root, `${opener[0]}.args`), 'utf8').split('\n')).toEqual([
			...opener.slice(1),
			'https://github.test/pull/12/files',
			'',
		])
	})

	it('the opener failing → a refusal naming it', () => {
		const root = fakeCommands({
			names: Object.values(BROWSER_OPENERS).map((opener) => opener[0]),
			code: 3,
		})
		const opener = BROWSER_OPENERS[process.platform] ?? BROWSER_OPENERS.default

		expect(createGithubHost().openFiles({ root, url: 'https://github.test/pull/12' })).toEqual({
			refusal: `${opener[0]}: exit 3`,
		})
	})
})

describe('createGithubHost: line comments argv', () => {
	it.each([
		{
			label: 'the endpoint with the number filled, every page, the filter last',
			args: [
				'api',
				'repos/{owner}/{repo}/pulls/12/comments',
				'--paginate',
				'--jq',
				'.[] | {id, path, line: (.line // .original_line), body, replyTo: .in_reply_to_id}',
			],
		},
	])('$label', ({ args }) => {
		const root = fakeCommands({ names: ['gh'], stdout: '' })

		createGithubHost().readReviewComments({ root, number: 12 })

		expect(readFileSync(join(root, 'gh.args'), 'utf8').trimEnd().split('\n')).toEqual(args)
	})
})
