/**
 * `dialecte lot describe <id>`: the lot's pull request rendered from its records through the repository's template, its
 * open pull request updated when it reads otherwise; a body holding what a public text never holds is not sent.
 */
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { FIXTURE_TEMPLATE_PATH } from '../../test/change-request-template.constants.ts'
import { replaceRecord } from '../../test/damaged-lot-workspace.ts'
import { recordingHost } from '../../test/land-lot.ts'
import {
	FORBIDDEN_WORD,
	LOT_ISSUE,
	LOT_MESSAGE,
	LOT_NAME,
	LOT_SUMMARY,
} from '../../test/lot-describe.constants.ts'
import { cliTemplate, changeRequestLot } from '../../test/lot-describe.ts'
import { git, writeFiles } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { renderLotUsage } from '../lib/command-map/render-help.ts'
import { runLotDescribe } from './lot-describe.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ChangeRequest } from '../lib/host/host.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

/** The lot's open pull request #7 as the host holds it. */
function openChangeRequest(params: { title: string; body: string }): ChangeRequest {
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
		const lot = changeRequestLot()
		const { host, calls } = recordingHost()

		const result = runLotDescribe({
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

	it('a GitHub origin and no pull request yet → lot land named with the pull request noun', () => {
		const lot = changeRequestLot()
		git({
			root: lot.workspace.repository,
			args: ['remote', 'set-url', 'origin', 'https://github.com/o/r.git'],
		})
		const { host } = recordingHost()

		const result = runLotDescribe({ cwd: lot.workspace.repository, argv: [LOT_NAME], host })

		expect(result.output.split('\n').at(-1)).toBe(
			`no pull request yet: dialecte lot land ${LOT_NAME} opens it with this text`,
		)
	})

	it('the retired verb lot pr → the lot usage, exit 2', () => {
		const lot = changeRequestLot()

		expect(runLot({ cwd: lot.workspace.repository, argv: ['pr', LOT_NAME] })).toEqual({
			exitCode: 2,
			output: renderLotUsage(),
		})
	})

	it('no change request yet → the text printed and lot land named, nothing sent, exit 0', () => {
		const lot = changeRequestLot()
		const { host, calls } = recordingHost()

		const result = runLotDescribe({ cwd: lot.workspace.repository, argv: [LOT_NAME], host })

		expect(result.exitCode).toBe(0)
		expect(calls).toEqual(['read feat/x'])
		expect(result.output.split('\n').at(-1)).toBe(
			`no change request yet: dialecte lot land ${LOT_NAME} opens it with this text`,
		)
	})

	it('an open pull request that reads otherwise → its title and body replaced by the rendered ones', () => {
		const lot = changeRequestLot()
		const { host, calls, bodies } = recordingHost({
			existing: openChangeRequest({ title: 'merge: main into feat/x', body: '' }),
		})

		const result = runLotDescribe({ cwd: lot.workspace.repository, argv: [LOT_NAME], host })

		expect(result.exitCode).toBe(0)
		expect(calls).toEqual(['read feat/x', `edit 7 "${LOT_MESSAGE}"`])
		expect(bodies[0]).toContain(LOT_SUMMARY)
		expect(result.output).toBe(
			'change request #7 updated from the lot records: https://host.test/pull/7',
		)
	})

	it('a pull request that already reads the records → nothing asked of the host but its read', () => {
		const lot = changeRequestLot()
		const { host, calls } = recordingHost({
			existing: openChangeRequest({ title: 'old', body: '' }),
		})
		runLotDescribe({ cwd: lot.workspace.repository, argv: [LOT_NAME], host })

		const result = runLotDescribe({ cwd: lot.workspace.repository, argv: [LOT_NAME], host })

		expect(calls.slice(2)).toEqual(['read feat/x'])
		expect(result.output).toBe(
			'change request #7 already reads the lot records: https://host.test/pull/7',
		)
	})

	it("a person's ticks after the kept marker → kept in the new body", () => {
		const lot = changeRequestLot()
		const kept = [
			'### Checklist for the reviewer when doing the PR review',
			'',
			'- [x] Tests are complete',
			'',
			'Read twice.',
		].join('\n')
		const { host, bodies } = recordingHost({
			existing: openChangeRequest({ title: LOT_MESSAGE, body: `rendered before\n\n${kept}\n` }),
		})

		runLotDescribe({ cwd: lot.workspace.repository, argv: [LOT_NAME], host })

		expect(bodies).toHaveLength(1)
		expect(bodies[0]?.endsWith(`\n\n${kept}`)).toBe(true)
	})

	it('a behaviour holding a forbidden word → refused, the word and its record named, nothing asked of the host', () => {
		const lot = changeRequestLot({
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

		const result = runLotDescribe({ cwd: lot.workspace.repository, argv: [LOT_NAME], host })

		expect(result.exitCode).toBe(1)
		expect(calls).toEqual([])
		expect(result.output).toBe(
			`lot describe: the change request text holds a forbidden word \`${FORBIDDEN_WORD}\` in brief.json steps[0].behaviours[0]: rewrite that record, nothing sent`,
		)
	})

	it("a repository template without the renderer's markers → refused, the template named, exit 1", () => {
		const lot = changeRequestLot({
			template: '### What is included in this change?\n\n[Describe]\n',
		})
		const { host, calls } = recordingHost()

		const result = runLotDescribe({ cwd: lot.workspace.repository, argv: [LOT_NAME], host })

		expect(result.exitCode).toBe(1)
		expect(calls).toEqual([])
		expect(result.output).toBe(
			"lot describe: .github/pull_request_template.md is not the renderer's template (missing marker <!-- dialecte:summary -->): copy the cli's template into the repository",
		)
	})

	it('a tests record taken on another tree → the body says stale, never its counts', () => {
		const lot = changeRequestLot({ staleTests: true })
		const { host } = recordingHost()

		const result = runLotDescribe({
			cwd: lot.workspace.repository,
			argv: [LOT_NAME, '--print'],
			host,
		})

		expect(result.output).toContain(
			'- tdd: stale, taken on 0123456789ab, not the tree this change request lands',
		)
		expect(result.output).not.toContain('1 case (1 green)')
	})

	it('a merged pull request → nothing sent, its state named, exit 1', () => {
		const lot = changeRequestLot()
		const { host, calls } = recordingHost({
			existing: { ...openChangeRequest({ title: 'x', body: 'y' }), state: 'merged' },
		})

		const result = runLotDescribe({ cwd: lot.workspace.repository, argv: [LOT_NAME], host })

		expect(result.exitCode).toBe(1)
		expect(calls).toEqual(['read feat/x'])
		expect(result.output).toBe('lot describe: change request #7 is merged: nothing sent')
	})

	it('--json → the title, the body, the pull request and whether it was sent', () => {
		const lot = changeRequestLot()
		const { host } = recordingHost({ existing: openChangeRequest({ title: 'old', body: '' }) })

		const result = runLotDescribe({
			cwd: lot.workspace.repository,
			argv: [LOT_NAME, '--json'],
			host,
		})

		expect(result.output).toMatch(/^\{/)
		expect(JSON.parse(result.output)).toEqual({
			title: LOT_MESSAGE,
			body: expect.stringContaining(LOT_SUMMARY),
			changeRequest: { number: 7, url: 'https://host.test/pull/7', head: '' },
			head: git({ root: lot.worktree, args: ['rev-parse', 'HEAD'] }).trim(),
			sent: true,
		})
	})

	it("--json for a pull request whose head is not the lot's → both heads given", () => {
		const lot = changeRequestLot()
		const { host } = recordingHost({
			existing: { ...openChangeRequest({ title: 'old', body: '' }), head: 'a'.repeat(40) },
		})

		const result = runLotDescribe({
			cwd: lot.workspace.repository,
			argv: [LOT_NAME, '--json'],
			host,
		})

		expect(result.output).toMatch(/^\{/)
		expect(JSON.parse(result.output)).toMatchObject({
			changeRequest: { head: 'a'.repeat(40) },
			head: git({ root: lot.worktree, args: ['rev-parse', 'HEAD'] }).trim(),
		})
	})

	it('an unknown option → the usage, nothing read or sent, exit 2', () => {
		const lot = changeRequestLot()
		const { host, calls } = recordingHost()

		const result = runLotDescribe({
			cwd: lot.workspace.repository,
			argv: [LOT_NAME, '--prnit'],
			host,
		})

		expect(result.exitCode).toBe(2)
		expect(calls).toEqual([])
		expect(result.output).toBe(renderLotUsage())
	})

	it('a lot already landed → its pull request read by the landing number', () => {
		const lot = changeRequestLot()
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
			existing: openChangeRequest({ title: 'old', body: '' }),
		})

		runLotDescribe({ cwd: lot.workspace.repository, argv: [LOT_NAME], host })

		expect(calls[0]).toBe('read 7')
	})

	it('the host refusing the edit → its reason, exit 1', () => {
		const lot = changeRequestLot()
		const { host } = recordingHost({
			existing: openChangeRequest({ title: 'old', body: '' }),
			editRefusal: 'gh pr edit: HTTP 403',
		})

		const result = runLotDescribe({ cwd: lot.workspace.repository, argv: [LOT_NAME], host })

		expect(result.exitCode).toBe(1)
		expect(result.output).toBe('lot describe: gh pr edit: HTTP 403')
	})

	it('a body the host gives back with Windows line ends, the same text → nothing sent', () => {
		const lot = changeRequestLot()
		const { host, bodies } = recordingHost({
			existing: openChangeRequest({ title: 'old', body: '' }),
		})
		runLotDescribe({ cwd: lot.workspace.repository, argv: [LOT_NAME], host })
		const windows = recordingHost({
			existing: openChangeRequest({ title: LOT_MESSAGE, body: bodies[0].replaceAll('\n', '\r\n') }),
		})

		const result = runLotDescribe({
			cwd: lot.workspace.repository,
			argv: [LOT_NAME],
			host: windows.host,
		})

		expect(windows.calls).toEqual(['read feat/x'])
		expect(result.output).toContain('already reads the lot records')
	})

	it("a pull request whose head is not the lot's HEAD → updated, and the line says lot land pushes the rest", () => {
		const lot = changeRequestLot()
		const { host } = recordingHost({
			existing: { ...openChangeRequest({ title: 'old', body: '' }), head: 'a'.repeat(40) },
		})

		const result = runLotDescribe({ cwd: lot.workspace.repository, argv: [LOT_NAME], host })

		expect(result.output.split('\n').at(-1)).toBe(
			`! change request #7 is at aaaaaaaaaaaa, the lot at ${git({ root: lot.worktree, args: ['rev-parse', '--short=12', 'HEAD'] }).trim()}: the text describes the lot; dialecte lot land ${LOT_NAME} pushes it`,
		)
	})

	it('a template neither the lot head nor the base holds → refused, the template named as missing, exit 1', () => {
		const lot = changeRequestLot({ lotDeletes: ['.github/pull_request_template.md'] })
		git({ root: lot.workspace.repository, args: ['rm', '-q', '.github/pull_request_template.md'] })
		git({ root: lot.workspace.repository, args: ['commit', '-qm', 'chore: no template'] })
		git({ root: lot.workspace.repository, args: ['push', '-q', 'origin', 'main'] })
		const { host } = recordingHost()

		const result = runLotDescribe({ cwd: lot.workspace.repository, argv: [LOT_NAME], host })

		expect(result.exitCode).toBe(1)
		expect(result.output).toBe(
			"lot describe: the lot's head holds no .github/pull_request_template.md: copy the cli's template into the repository",
		)
	})

	it('a lot whose worktree is gone → refused, the worktree named, exit 1', () => {
		const lot = changeRequestLot()
		rmSync(lot.worktree, { recursive: true, force: true })
		const { host } = recordingHost()

		function run() {
			return runLotDescribe({ cwd: lot.workspace.repository, argv: [LOT_NAME], host })
		}

		expect(run).not.toThrow()
		expect(run()).toEqual({
			exitCode: 1,
			output: expect.stringMatching(/^lot describe: the worktree .* is gone: nothing rendered\n?$/),
		})
	})

	it('--print of a body of several lines → printed line by line, no line break escaped', () => {
		const lot = changeRequestLot()
		const { host } = recordingHost()

		const result = runLotDescribe({
			cwd: lot.workspace.repository,
			argv: [LOT_NAME, '--print'],
			host,
		})

		expect(result.output).toContain(`### Summary\n\n${LOT_SUMMARY}\n\n### Behaviours`)
	})

	it("a body holding a person's text and no kept heading → refused, nothing sent, the text never dropped", () => {
		const lot = changeRequestLot()
		const { host, calls } = recordingHost({
			existing: openChangeRequest({ title: 'old', body: 'Notes a person wrote on the page.' }),
		})

		const result = runLotDescribe({ cwd: lot.workspace.repository, argv: [LOT_NAME], host })

		expect(result).toEqual({
			exitCode: 1,
			output:
				"lot describe: the change request body holds text the render would drop (no '### Checklist for the reviewer when doing the PR review' heading): move it under that heading or clear it, nothing sent",
		})
		expect(calls).toEqual(['read feat/x'])
	})

	it("an open pull request with lot land's old placeholder body → replaced: no person wrote it", () => {
		const lot = changeRequestLot()
		const { host, calls } = recordingHost({
			existing: openChangeRequest({
				title: 'old',
				body: `Lot ${LOT_NAME}. The full suite runs on CI; the merge queue lands it.`,
			}),
		})

		runLotDescribe({ cwd: lot.workspace.repository, argv: [LOT_NAME], host })

		expect(calls).toContain(`edit 7 "${LOT_MESSAGE}"`)
	})

	it('a damaged lot (its brief edited by hand) → refused, nothing read or sent', () => {
		const lot = changeRequestLot()
		replaceRecord({ folder: lot.lotFolder, name: 'brief.json', text: '{}' })
		const { host, calls } = recordingHost()

		const result = runLotDescribe({ cwd: lot.workspace.repository, argv: [LOT_NAME], host })

		expect(result).toEqual({
			exitCode: 1,
			output: `lot describe: ${LOT_NAME} is damaged: dialecte lot status ${LOT_NAME} says how`,
		})
		expect(calls).toEqual([])
	})

	it("a lot cut before the template's markers → lot pr reads origin's template", () => {
		const lot = changeRequestLot({ template: '### No markers here\n' })
		writeFiles({
			root: lot.workspace.repository,
			files: { [FIXTURE_TEMPLATE_PATH]: cliTemplate() },
		})
		git({
			root: lot.workspace.repository,
			args: ['commit', '-qam', 'chore: the template with its markers'],
		})
		git({ root: lot.workspace.repository, args: ['push', '-q', 'origin', 'main'] })
		const { host } = recordingHost()

		const result = runLotDescribe({
			cwd: lot.workspace.repository,
			argv: [LOT_NAME, '--print'],
			host,
		})

		expect(result.exitCode).toBe(0)
		expect(result.output).toContain('### Summary')
	})
})
