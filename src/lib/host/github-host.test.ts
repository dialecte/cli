/** The GitHub adapter reads what `gh` writes: a fake `gh` on the PATH answers as the real one does. */
import { chmodSync, readFileSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { createGithubHost } from './github-host.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** A `gh` that prints `stdout`, `stderr` and exits `code`, first on the PATH; it writes its arguments to `gh.args`. */
function fakeGh(params: { stdout?: string; stderr?: string; code?: number }): string {
	const folder = temporaryFolder('dialecte-fake-gh-')
	const script = join(folder, 'gh')
	writeFileSync(
		script,
		`#!/bin/sh\nprintf '%s\\n' "$@" > '${join(folder, 'gh.args')}'\ncat > '${join(folder, 'gh.stdin')}'\nprintf '%s' '${params.stdout ?? ''}'\nprintf '%s' '${params.stderr ?? ''}' >&2\nexit ${params.code ?? 0}\n`,
	)
	chmodSync(script, 0o755)
	vi.stubEnv('PATH', `${folder}${delimiter}${process.env.PATH ?? ''}`)
	return folder
}

describe('createGithubHost', () => {
	it.each([
		{
			label: 'an open pull request in the queue',
			stdout:
				'{"number":12,"url":"https://github.test/pull/12","title":"feat(x): x","body":"the body","state":"OPEN","isDraft":false,"autoMergeRequest":{"enabledAt":"x"},"headRefOid":"abc"}',
			pullRequest: {
				number: 12,
				url: 'https://github.test/pull/12',
				title: 'feat(x): x',
				body: 'the body',
				state: 'open',
				draft: false,
				queued: true,
				head: 'abc',
			},
		},
		{
			label: 'an open pull request in the merge queue without auto-merge (queued by a stack merge)',
			stdout:
				'{"number":12,"url":"https://github.test/pull/12","title":"feat(x): x","body":"","state":"OPEN","isDraft":false,"autoMergeRequest":null,"isInMergeQueue":true,"headRefOid":"abc"}',
			pullRequest: {
				number: 12,
				url: 'https://github.test/pull/12',
				title: 'feat(x): x',
				body: '',
				state: 'open',
				draft: false,
				queued: true,
				head: 'abc',
			},
		},
		{
			label: 'a merged one',
			stdout:
				'{"number":12,"url":"https://github.test/pull/12","title":"feat(x): x","body":"","state":"MERGED","isDraft":false,"autoMergeRequest":null,"headRefOid":"abc"}',
			pullRequest: {
				number: 12,
				url: 'https://github.test/pull/12',
				title: 'feat(x): x',
				body: '',
				state: 'merged',
				draft: false,
				queued: false,
				head: 'abc',
			},
		},
	])('gh pr view of $label → read as such', ({ stdout, pullRequest }) => {
		const root = fakeGh({ stdout })

		expect(createGithubHost().readPullRequest({ root, ref: 'feat/x' })).toEqual(pullRequest)
	})

	it('gh saying no pull request found → none, not a refusal', () => {
		const root = fakeGh({ stderr: 'no pull requests found for branch "feat/x"', code: 1 })

		expect(createGithubHost().readPullRequest({ root, ref: 'feat/x' })).toBeUndefined()
	})

	it('gh failing otherwise → a refusal naming the call and its reason', () => {
		const root = fakeGh({ stderr: 'HTTP 401: Bad credentials', code: 1 })

		expect(createGithubHost().readPullRequest({ root, ref: 'feat/x' })).toEqual({
			refusal: 'gh pr view: HTTP 401: Bad credentials',
		})
	})

	it('a pull request edited → gh pr edit <number> --title <title> --body-file -, the body on its input', () => {
		const root = fakeGh({})

		expect(
			createGithubHost().editPullRequest({
				root,
				number: 12,
				title: 'feat(x): x',
				body: '### Summary\n\nX.',
			}),
		).toBeUndefined()
		expect(readFileSync(join(root, 'gh.args'), 'utf8').split('\n')).toEqual([
			'pr',
			'edit',
			'12',
			'--title',
			'feat(x): x',
			'--body-file',
			'-',
			'',
		])
		expect(readFileSync(join(root, 'gh.stdin'), 'utf8')).toBe('### Summary\n\nX.')
	})

	it('gh refusing the body edit → a refusal naming the call and its reason', () => {
		const root = fakeGh({ stderr: 'HTTP 403: Resource not accessible', code: 1 })

		expect(createGithubHost().editPullRequest({ root, number: 12, title: 'x', body: 'y' })).toEqual(
			{ refusal: 'gh pr edit: HTTP 403: Resource not accessible' },
		)
	})
})
