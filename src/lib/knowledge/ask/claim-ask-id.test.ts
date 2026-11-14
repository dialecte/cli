import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import {
	CLAIM_CHILD,
	CLAIMS_PER_CHILD,
	CLAIM_CASE_TIMEOUT,
} from '../../../../test/claim-ask-child.constants.ts'
import { temporaryFolder } from '../../../../test/scratch-repository.ts'
import { claimAskId } from './claim-ask-id.ts'

import { describe, expect, it } from 'vitest'

/** The names of the folder's entries, sorted; none when it does not exist. */
function namesOf(folder: string): string[] {
	return existsSync(folder) ? readdirSync(folder).sort() : []
}

/** The ids a child process claimed, in the order it printed them. */
function claimedByChild(params: {
	asksFolder: string
}): Promise<{ ids: string[]; stderr: string }> {
	return new Promise((resolveClaims) => {
		const child = spawn(
			process.execPath,
			[CLAIM_CHILD, params.asksFolder, String(CLAIMS_PER_CHILD)],
			{ stdio: ['ignore', 'pipe', 'pipe'] },
		)
		let text = ''
		let stderr = ''
		child.stdout.on('data', (chunk) => {
			text += String(chunk)
		})
		child.stderr.on('data', (chunk) => {
			stderr += String(chunk)
		})
		child.on('close', () =>
			resolveClaims({ ids: text.split('\n').filter((line) => line !== ''), stderr }),
		)
	})
}

describe('claimAskId: A-<n> by an exclusive create (D16, case: two claims at once never share an id)', () => {
	it('an asks folder not made yet -> A-0001, its folder made', () => {
		const asksFolder = join(temporaryFolder('dialecte-ask-claim-'), 'asks')

		expect(claimAskId({ asksFolder })).toBe('A-0001')
		expect(existsSync(join(asksFolder, 'A-0001'))).toBe(true)
	})

	it('a second claim -> A-0002, the first folder kept', () => {
		const asksFolder = join(temporaryFolder('dialecte-ask-claim-'), 'asks')

		expect({
			ids: [claimAskId({ asksFolder }), claimAskId({ asksFolder })],
			folders: namesOf(asksFolder),
		}).toEqual({ ids: ['A-0001', 'A-0002'], folders: ['A-0001', 'A-0002'] })
	})

	it('A-0001 and A-0002 taken by another writer -> A-0003, never an id that exists', () => {
		const asksFolder = join(temporaryFolder('dialecte-ask-claim-'), 'asks')
		mkdirSync(join(asksFolder, 'A-0001'), { recursive: true })
		mkdirSync(join(asksFolder, 'A-0002'))

		expect(claimAskId({ asksFolder })).toBe('A-0003')
	})

	it(
		'two processes claiming at once -> every id distinct, one folder per id, nothing on either stderr',
		async () => {
			const asksFolder = join(temporaryFolder('dialecte-ask-claim-'), 'asks')
			mkdirSync(asksFolder)

			const [first, second] = await Promise.all([
				claimedByChild({ asksFolder }),
				claimedByChild({ asksFolder }),
			])

			expect({
				claimed: first.ids.length + second.ids.length,
				distinct: new Set([...first.ids, ...second.ids]).size,
				folders: namesOf(asksFolder).length,
				stderr: [first.stderr, second.stderr],
			}).toEqual({
				claimed: 2 * CLAIMS_PER_CHILD,
				distinct: 2 * CLAIMS_PER_CHILD,
				folders: 2 * CLAIMS_PER_CHILD,
				stderr: ['', ''],
			})
		},
		CLAIM_CASE_TIMEOUT,
	)
})
