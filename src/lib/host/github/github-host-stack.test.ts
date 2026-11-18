/**
 * The GitHub adapter's stack calls (33CI CI4): the gh-stack extension probed, a pull request linked on its parent's, a
 * stack queued, a pull request retargeted, and a pull request's base read. A fake `gh` on the PATH answers as the real
 * one does and keeps the arguments it was given.
 */
import { chmodSync, readFileSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'

import { temporaryFolder } from '../../../../test/scratch-repository.ts'
import { createGithubHost } from './github-host.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** A `gh` that prints `stdout` and exits `code`, first on the PATH; it writes its arguments to `gh.args`. */
function fakeGh(params: { stdout?: string; code?: number } = {}): string {
	const folder = temporaryFolder('dialecte-fake-gh-stack-')
	const script = join(folder, 'gh')
	writeFileSync(
		script,
		`#!/bin/sh\nprintf '%s\\n' "$@" > '${join(folder, 'gh.args')}'\nprintf '%s' '${params.stdout ?? ''}'\nexit ${params.code ?? 0}\n`,
	)
	chmodSync(script, 0o755)
	vi.stubEnv('PATH', `${folder}${delimiter}${process.env.PATH ?? ''}`)
	return folder
}

/** The arguments the fake `gh` was last given, one per line. */
function argumentsOf(folder: string): string[] {
	return readFileSync(join(folder, 'gh.args'), 'utf8').trim().split('\n')
}

describe('createGithubHost: stacks', () => {
	it('probeStacks with gh stack answering → stacks; without → no stacks, naming why', () => {
		fakeGh()
		const answering = createGithubHost().probeStacks({ root: process.cwd() })
		fakeGh({ code: 1 })
		const missing = createGithubHost().probeStacks({ root: process.cwd() })

		expect({ answering, missing }).toEqual({
			answering: { stacks: true },
			missing: { stacks: false, why: 'gh stack is not installed' },
		})
	})

	it('linkStack → gh stack link <parent url> <child url>', () => {
		const folder = fakeGh()

		const linked = createGithubHost().linkStack({
			root: process.cwd(),
			parent: 'https://host.test/pull/5',
			child: 'https://host.test/pull/7',
		})

		expect({ linked, args: argumentsOf(folder) }).toEqual({
			linked: undefined,
			args: ['stack', 'link', 'https://host.test/pull/5', 'https://host.test/pull/7'],
		})
	})

	it('queueStack → gh stack merge <number> --yes --squash, never auto-merge', () => {
		const folder = fakeGh()

		const queued = createGithubHost().queueStack({ root: process.cwd(), number: 7, draft: false })

		expect({ queued, args: argumentsOf(folder) }).toEqual({
			queued: undefined,
			args: ['stack', 'merge', '7', '--yes', '--squash'],
		})
	})

	it('retargetPullRequest → gh pr edit <number> --base <base>', () => {
		const folder = fakeGh()

		const moved = createGithubHost().retargetPullRequest({
			root: process.cwd(),
			number: 7,
			base: 'main',
		})

		expect({ moved, args: argumentsOf(folder) }).toEqual({
			moved: undefined,
			args: ['pr', 'edit', '7', '--base', 'main'],
		})
	})

	it('a gh refusal of a stack call → its first error line, the command named', () => {
		fakeGh({ code: 1 })

		const queued = createGithubHost().queueStack({ root: process.cwd(), number: 7, draft: false })

		expect(queued).toEqual({ refusal: 'gh stack merge: exit 1' })
	})

	it('readPullRequest → the base branch gh names (baseRefName)', () => {
		fakeGh({
			stdout: JSON.stringify({
				number: 7,
				url: 'https://host.test/pull/7',
				title: 't',
				body: '',
				state: 'OPEN',
				isDraft: true,
				autoMergeRequest: null,
				headRefOid: 'abc',
				baseRefName: 'feat/x',
			}),
		})

		const read = createGithubHost().readPullRequest({ root: process.cwd(), ref: '7' })

		expect(read).toMatchObject({ number: 7, base: 'feat/x' })
	})
})

describe('createGithubHost: the stack probe argv', () => {
	it.each([{ label: 'probeStacks → gh stack --help', args: ['stack', '--help'] }])(
		'$label',
		({ args }) => {
			const folder = fakeGh()

			createGithubHost().probeStacks({ root: process.cwd() })

			expect(argumentsOf(folder)).toEqual(args)
		},
	)
})
