/**
 * The probe-only reads of the GitHub vendor: what `gh` is asked, and what the answer is read as. A fake `gh` on the
 * PATH answers; the argv of the table's reads is pinned by `host-contract.test.ts` (the committed record holds
 * `pr list` once refreshed), and the adapter's `readReviewComments` by `github-host-review.test.ts`.
 */
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'

import { temporaryFolder } from '../../../../test/scratch-repository.ts'
import { readReviewCommentsWith } from './github-host.ts'
import { newestMergedPullRequest } from './github-probes.ts'
import { REVIEW_COMMENTS_JQ } from './github.constants.ts'
import { runGh } from './run-gh.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** A `gh` first on the PATH that prints `stdout`; its arguments are written to `gh.args` in the folder answered, one per line. */
function fakeGh(stdout: string): string {
	const folder = temporaryFolder('dialecte-fake-gh-probes-')
	const script = join(folder, 'gh')
	writeFileSync(
		script,
		`#!/bin/sh\nprintf '%s\\n' "$@" > '${join(folder, 'gh.args')}'\nprintf '%s' '${stdout}'\n`,
	)
	chmodSync(script, 0o755)
	vi.stubEnv('PATH', `${folder}${delimiter}${process.env.PATH ?? ''}`)
	return folder
}

/** The arguments the fake gh was run with. */
function argsOf(folder: string): string[] {
	const file = join(folder, 'gh.args')
	return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n') : []
}

describe('newestMergedPullRequest', () => {
	it('gh answering one merged pull request → its number, asked as gh pr list --state merged --limit 1', () => {
		const folder = fakeGh('[{"number":73}]')

		const answer = newestMergedPullRequest({ run: runGh, root: folder })

		expect({ answer, args: argsOf(folder) }).toEqual({
			answer: { number: 73 },
			args: ['pr', 'list', '--state', 'merged', '--limit', '1', '--json', 'number'],
		})
	})

	it('gh answering text that is not the number list → a refusal naming gh pr list', () => {
		const folder = fakeGh('not json')

		const answer = newestMergedPullRequest({ run: runGh, root: folder })

		expect(answer).toHaveProperty('refusal')
		expect((answer as { refusal: string }).refusal).toContain('gh pr list')
	})

	it('gh answering an empty list → a refusal saying there is nothing to probe', () => {
		const folder = fakeGh('[]')

		const answer = newestMergedPullRequest({ run: runGh, root: folder })

		expect(answer).toHaveProperty('refusal')
		expect((answer as { refusal: string }).refusal).toContain('nothing to probe')
	})
})

describe('readReviewCommentsWith', () => {
	it('the reference repository and number → the adapter argv with them filled, the comments read', () => {
		const folder = fakeGh(
			'{"id":1,"path":"a.go","line":4,"body":"x","replyTo":null}\n{"id":2,"path":"a.go","line":4,"body":"y","replyTo":1}',
		)

		const comments = readReviewCommentsWith({
			run: runGh,
			root: folder,
			values: { owner: 'cli', repo: 'cli', number: '15071' },
		})

		expect({ comments, args: argsOf(folder) }).toEqual({
			comments: [
				{ id: 1, path: 'a.go', line: 4, body: 'x' },
				{ id: 2, path: 'a.go', line: 4, body: 'y', replyTo: 1 },
			],
			args: ['api', 'repos/cli/cli/pulls/15071/comments', '--paginate', '--jq', REVIEW_COMMENTS_JQ],
		})
	})
})
