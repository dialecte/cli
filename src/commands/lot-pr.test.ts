/**
 * `dialecte lot pr <id>`: the lot's pull request rendered from its records through the repository's template, its
 * open pull request updated when it reads otherwise; a body holding what a public text never holds is not sent.
 */
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { recordingHost } from '../../test/land-lot.ts'
import {
	FORBIDDEN_WORD,
	LOT_ISSUE,
	LOT_MESSAGE,
	LOT_NAME,
	LOT_SUMMARY,
} from '../../test/lot-pr.constants.ts'
import { pullRequestLot } from '../../test/lot-pr.ts'
import { git } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { renderLotUsage } from '../lib/command-map/render-help.ts'
import { runLotPr } from './lot-pr.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PullRequest } from '../lib/host/host.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The lot's open pull request #7 as the host holds it. */
function openPullRequest(params: { title: string; body: string }): PullRequest {
	return {
		number: 7,
		url: 'https://host.test/pull/7',
		title: params.title,
		body: params.body,
		state: 'open',
		draft: true,
		queued: false,
		head: '',
	}
}

describe('dialecte lot pr', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('--print → the title and the body from the records, the host never asked', () => {
		const lot = pullRequestLot()
		const { host, calls } = recordingHost()

		const result = runLotPr({
			cwd: lot.workspace.repository,
			argv: [LOT_NAME, '--print'],
			host,
		})

		expect(result.exitCode).toBe(0)
		expect(calls).toEqual([])
		expect(result.output.split('\n')[0]).toBe(`title: ${LOT_MESSAGE}`)
		expect(result.output).toContain(LOT_SUMMARY)
		expect(result.output).toContain('- `x` answers one.')
		expect(result.output).toContain('- tdd: 1 case (1 green) on 0123456789ab')
		expect(result.output).toContain(`Closes #${LOT_ISSUE}`)
	})

	it('no pull request yet → the text printed and lot land --draft named, nothing sent, exit 0', () => {
		const lot = pullRequestLot()
		const { host, calls } = recordingHost()

		const result = runLotPr({ cwd: lot.workspace.repository, argv: [LOT_NAME], host })

		expect(result.exitCode).toBe(0)
		expect(calls).toEqual(['read feat/x'])
		expect(result.output.split('\n').at(-1)).toBe(
			`no pull request yet: dialecte lot land ${LOT_NAME} --draft opens it with this text`,
		)
	})

	it('an open pull request that reads otherwise → its title and body replaced by the rendered ones', () => {
		const lot = pullRequestLot()
		const { host, calls, bodies } = recordingHost({
			existing: openPullRequest({ title: 'merge: main into feat/x', body: 'old text' }),
		})

		const result = runLotPr({ cwd: lot.workspace.repository, argv: [LOT_NAME], host })

		expect(result.exitCode).toBe(0)
		expect(calls).toEqual(['read feat/x', `edit 7 "${LOT_MESSAGE}"`])
		expect(bodies[0]).toContain(LOT_SUMMARY)
		expect(result.output).toBe(
			'pull request #7 updated from the lot records: https://host.test/pull/7',
		)
	})

	it('a pull request that already reads the records → nothing asked of the host but its read', () => {
		const lot = pullRequestLot()
		const { host, calls } = recordingHost({
			existing: openPullRequest({ title: 'old', body: 'old' }),
		})
		runLotPr({ cwd: lot.workspace.repository, argv: [LOT_NAME], host })

		const result = runLotPr({ cwd: lot.workspace.repository, argv: [LOT_NAME], host })

		expect(calls.slice(2)).toEqual(['read feat/x'])
		expect(result.output).toBe(
			'pull request #7 already reads the lot records: https://host.test/pull/7',
		)
	})

	it("a person's ticks after the kept marker → kept in the new body", () => {
		const lot = pullRequestLot()
		const kept = [
			'### Checklist for the reviewer when doing the PR review',
			'',
			'- [x] Tests are complete',
			'',
			'Read twice.',
		].join('\n')
		const { host, bodies } = recordingHost({
			existing: openPullRequest({ title: LOT_MESSAGE, body: `rendered before\n\n${kept}\n` }),
		})

		runLotPr({ cwd: lot.workspace.repository, argv: [LOT_NAME], host })

		expect(bodies).toHaveLength(1)
		expect(bodies[0]?.endsWith(`\n\n${kept}`)).toBe(true)
	})

	it('a behaviour holding a forbidden word → refused, the word and its record named, nothing asked of the host', () => {
		const lot = pullRequestLot({
			brief: {
				steps: [
					{ title: 'x', spec: '## Step 1', behaviours: [`x asked by ${FORBIDDEN_WORD} -> one`] },
				],
			},
		})
		git({
			root: lot.workspace.repository,
			args: ['config', 'dialecte.forbiddenWords', FORBIDDEN_WORD],
		})
		const { host, calls } = recordingHost()

		const result = runLotPr({ cwd: lot.workspace.repository, argv: [LOT_NAME], host })

		expect(result.exitCode).toBe(1)
		expect(calls).toEqual([])
		expect(result.output).toBe(
			`lot pr: the pull request text holds a forbidden word \`${FORBIDDEN_WORD}\` in brief.json steps[0].behaviours[0]: rewrite that record, nothing sent`,
		)
	})

	it("a repository template without the renderer's markers → refused, the template named, exit 1", () => {
		const lot = pullRequestLot({ template: '### What is included in this change?\n\n[Describe]\n' })
		const { host, calls } = recordingHost()

		const result = runLotPr({ cwd: lot.workspace.repository, argv: [LOT_NAME], host })

		expect(result.exitCode).toBe(1)
		expect(calls).toEqual([])
		expect(result.output).toBe(
			"lot pr: .github/pull_request_template.md is not the renderer's template (missing marker summary): copy the cli's template into the repository",
		)
	})

	it('a tests record taken on another tree → the body says stale, never its counts', () => {
		const lot = pullRequestLot({ staleTests: true })
		const { host } = recordingHost()

		const result = runLotPr({ cwd: lot.workspace.repository, argv: [LOT_NAME, '--print'], host })

		expect(result.output).toContain(
			'- tdd: stale, taken on 0123456789ab, not the tree this pull request lands',
		)
		expect(result.output).not.toContain('1 case (1 green)')
	})

	it('a merged pull request → nothing sent, its state named, exit 1', () => {
		const lot = pullRequestLot()
		const { host, calls } = recordingHost({
			existing: { ...openPullRequest({ title: 'x', body: 'y' }), state: 'merged' },
		})

		const result = runLotPr({ cwd: lot.workspace.repository, argv: [LOT_NAME], host })

		expect(result.exitCode).toBe(1)
		expect(calls).toEqual(['read feat/x'])
		expect(result.output).toBe('lot pr: pull request #7 is merged: nothing sent')
	})

	it('--json → the title, the body, the pull request and whether it was sent', () => {
		const lot = pullRequestLot()
		const { host } = recordingHost({ existing: openPullRequest({ title: 'old', body: 'old' }) })

		const result = runLotPr({ cwd: lot.workspace.repository, argv: [LOT_NAME, '--json'], host })

		expect(result.output).toMatch(/^\{/)
		expect(JSON.parse(result.output)).toEqual({
			title: LOT_MESSAGE,
			body: expect.stringContaining(LOT_SUMMARY),
			pullRequest: { number: 7, url: 'https://host.test/pull/7' },
			sent: true,
		})
	})

	it('an unknown option → the usage, nothing read or sent, exit 2', () => {
		const lot = pullRequestLot()
		const { host, calls } = recordingHost()

		const result = runLotPr({ cwd: lot.workspace.repository, argv: [LOT_NAME, '--prnit'], host })

		expect(result.exitCode).toBe(2)
		expect(calls).toEqual([])
		expect(result.output).toBe(renderLotUsage())
	})

	it('a lot already landed → its pull request read by the landing number', () => {
		const lot = pullRequestLot()
		writeFileSync(
			join(lot.lotFolder, 'landing.json'),
			JSON.stringify({
				schema: 1,
				number: 7,
				url: 'u',
				branch: 'feat/x',
				head: 'h',
				replaced: [],
				at: '',
			}),
		)
		const { host, calls } = recordingHost({
			existing: openPullRequest({ title: 'old', body: 'old' }),
		})

		runLotPr({ cwd: lot.workspace.repository, argv: [LOT_NAME], host })

		expect(calls[0]).toBe('read 7')
	})

	it('the host refusing the edit → its reason, exit 1', () => {
		const lot = pullRequestLot()
		const { host } = recordingHost({
			existing: openPullRequest({ title: 'old', body: 'old' }),
			editRefusal: 'gh pr edit: HTTP 403',
		})

		const result = runLotPr({ cwd: lot.workspace.repository, argv: [LOT_NAME], host })

		expect(result.exitCode).toBe(1)
		expect(result.output).toBe('lot pr: gh pr edit: HTTP 403')
	})

	it('a body the host gives back with Windows line ends, the same text → nothing sent', () => {
		const lot = pullRequestLot()
		const { host, bodies } = recordingHost({
			existing: openPullRequest({ title: 'old', body: 'old' }),
		})
		runLotPr({ cwd: lot.workspace.repository, argv: [LOT_NAME], host })
		const windows = recordingHost({
			existing: openPullRequest({ title: LOT_MESSAGE, body: bodies[0].replaceAll('\n', '\r\n') }),
		})

		const result = runLotPr({ cwd: lot.workspace.repository, argv: [LOT_NAME], host: windows.host })

		expect(windows.calls).toEqual(['read feat/x'])
		expect(result.output).toContain('already reads the lot records')
	})

	it("a pull request whose head is not the lot's HEAD → updated, and the line says lot land pushes the rest", () => {
		const lot = pullRequestLot()
		const { host } = recordingHost({
			existing: { ...openPullRequest({ title: 'old', body: 'old' }), head: 'a'.repeat(40) },
		})

		const result = runLotPr({ cwd: lot.workspace.repository, argv: [LOT_NAME], host })

		expect(result.output.split('\n').at(-1)).toBe(
			`! pull request #7 is at aaaaaaaaaaaa, the lot at ${git({ root: lot.worktree, args: ['rev-parse', '--short=12', 'HEAD'] }).trim()}: the text describes the lot; dialecte lot land ${LOT_NAME} --draft pushes it`,
		)
	})

	it('a template the lot head does not hold → refused, the template named as missing, exit 1', () => {
		const lot = pullRequestLot({ lotDeletes: ['.github/pull_request_template.md'] })
		const { host } = recordingHost()

		const result = runLotPr({ cwd: lot.workspace.repository, argv: [LOT_NAME], host })

		expect(result.exitCode).toBe(1)
		expect(result.output).toBe(
			"lot pr: the lot's head holds no .github/pull_request_template.md: copy the cli's template into the repository",
		)
	})

	it('a lot whose worktree is gone → refused, the worktree named, exit 1', () => {
		const lot = pullRequestLot()
		rmSync(lot.worktree, { recursive: true, force: true })
		const { host } = recordingHost()

		function run() {
			return runLotPr({ cwd: lot.workspace.repository, argv: [LOT_NAME], host })
		}

		expect(run).not.toThrow()
		expect(run()).toEqual({
			exitCode: 1,
			output: expect.stringMatching(/^lot pr: the worktree .* is gone: nothing rendered\n?$/),
		})
	})
})
