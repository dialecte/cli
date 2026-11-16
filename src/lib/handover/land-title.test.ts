/** A lot's pull request carries the lot's own message: the brief's commit lot, never the branch's last commit. */
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { landingRepository, recordingHost } from '../../../test/land-lot.ts'
import { git } from '../../../test/scratch-repository.ts'
import { SCRATCH_GIT_CASE_TIMEOUT } from '../../../test/test-timing.constants.ts'
import { landLot } from './land-lot.ts'

import { describe, expect, it } from 'vitest'

import type { LandingRepository } from '../../../test/land-lot.types.ts'
import type { HostAdapter } from '../host/host.types.ts'

const NOW = new Date('2026-11-17T03:00:00Z')
const MESSAGE = "feat(x): the lot's own message"

/** `landLot` of the landing repository's lot `feat/x` into main, as a draft. */
function land(params: { repository: LandingRepository; host: HostAdapter }) {
	return landLot({
		...params.repository,
		lot: '0001-repo-x',
		branch: 'feat/x',
		base: 'main',
		host: params.host,
		draft: true,
		now: NOW,
	})
}

describe(
	'landLot titles the pull request with the lot message',
	{ timeout: SCRATCH_GIT_CASE_TIMEOUT },
	() => {
		it("the branch's last commit a merge of main → opened with the brief's message, not the merge subject", () => {
			const repository = landingRepository({ messages: [MESSAGE] })
			git({
				root: repository.worktree,
				args: ['commit', '-q', '--allow-empty', '-m', 'merge: main into feat/x'],
			})
			const { host, calls } = recordingHost()

			land({ repository, host })

			expect(calls).toEqual(['read feat/x', `open feat/x -> main "${MESSAGE}" draft`])
		})

		it('a brief with several commit lots → titled with the first message, the others listed in the body', () => {
			const repository = landingRepository({
				messages: [MESSAGE, 'test(x): x keeps its cases', 'docs(x): x in the readme'],
			})
			const { host, calls, bodies } = recordingHost()

			land({ repository, host })

			expect(calls).toContain(`open feat/x -> main "${MESSAGE}" draft`)
			expect(bodies[0].split('\n').slice(-2)).toEqual([
				'- test(x): x keeps its cases',
				'- docs(x): x in the readme',
			])
		})

		it('an open pull request titled otherwise → retitled with the lot message, not opened again', () => {
			const repository = landingRepository({ messages: [MESSAGE] })
			const existing = {
				number: 7,
				url: 'https://host.test/pull/7',
				title: 'test(x): steps 3-4 of x',
				state: 'open' as const,
				draft: true,
				queued: false,
				head: '',
			}
			const { host, calls } = recordingHost({ existing })

			const landed = land({ repository, host })

			expect(calls).toEqual(['read feat/x', `retitle 7 "${MESSAGE}"`])
			expect(landed.lines).toContain(`pull request #7 retitled: ${MESSAGE}`)
		})

		it('the host refusing the retitle → refused with its reason, the landing still recorded at the pushed head', () => {
			const repository = landingRepository({ messages: [MESSAGE] })
			const existing = {
				number: 7,
				url: 'https://host.test/pull/7',
				title: 'test(x): steps 3-4 of x',
				state: 'open' as const,
				draft: true,
				queued: false,
				head: '',
			}
			const recording = recordingHost({ existing })
			const host: HostAdapter = {
				...recording.host,
				retitlePullRequest: function refuseRetitle() {
					return { refusal: 'gh pr edit: HTTP 403: Resource not accessible' }
				},
			}

			const landed = land({ repository, host })
			const pushed = git({ root: repository.worktree, args: ['rev-parse', 'HEAD'] }).trim()

			expect(landed.exitCode).toBe(1)
			expect(landed.lines.at(-1)).toBe('lot land: gh pr edit: HTTP 403: Resource not accessible')
			expect(existsSync(join(repository.lotFolder, 'landing.json'))).toBe(true)
			expect(
				JSON.parse(readFileSync(join(repository.lotFolder, 'landing.json'), 'utf8')),
			).toMatchObject({ number: 7, head: pushed })
		})

		it('a lot folder without its brief → refused before anything is pushed or asked', () => {
			const repository = landingRepository()
			rmSync(join(repository.lotFolder, 'brief.json'))
			const { host, calls } = recordingHost()

			const landed = land({ repository, host })

			expect(landed).toEqual({
				exitCode: 1,
				lines: [
					`lot land: ${join(repository.lotFolder, 'brief.json')} names no commit message (lots[0].message): nothing pushed`,
				],
			})
			expect(calls).toEqual([])
		})
	},
)
