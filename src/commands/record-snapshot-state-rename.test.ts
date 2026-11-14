/**
 * `lot snapshot` with a rename that fails (D7): `round-<n>.state` joins the names renamed from `.partial` together, so a
 * failure on any of the four leaves none of them (never a `.state` beside nothing), and a rerun takes the round.
 */
import { readdirSync } from 'node:fs'

import {
	createScratchRepository,
	temporaryFolder,
	writeFiles,
} from '../../test/scratch-repository.ts'
import { runRecord } from './record.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

const failing = vi.hoisted(() => ({ suffix: undefined as string | undefined }))

vi.mock('node:fs', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:fs')>()
	return {
		...actual,
		renameSync(from: string, to: string) {
			if (failing.suffix !== undefined && String(from).endsWith(`${failing.suffix}.partial`))
				throw new Error(`rename refused: ${String(from)}`)
			return actual.renameSync(from, to)
		},
	}
})

afterEach(function resetFailure() {
	failing.suffix = undefined
})

describe('lot snapshot - a failed rename', { timeout: 60_000 }, () => {
	for (const name of ['round-1.state', 'round-1.base', 'round-1.deleted', 'round-1'])
		it(`the rename of ${name} fails → exit 1, none of the round's names stands, a rerun takes the round`, () => {
			const root = createScratchRepository({ 'a.ts': 'a\n' })
			writeFiles({ root, files: { 'a.ts': 'a2\n' } })
			const folder = temporaryFolder('dialecte-handover-')
			failing.suffix = name

			const failed = runRecord({ cwd: root, argv: ['snapshot', folder, '--round', '1'] })

			expect(failed).toEqual({ exitCode: 1, output: expect.stringMatching(/^lot snapshot: /) })
			const left = readdirSync(folder).filter((entry) => !entry.endsWith('.partial'))
			// the derived line is appended before the round is taken (D7): it stays, the round's names do not
			expect(left).toEqual(['risk.jsonl'])

			failing.suffix = undefined
			expect(runRecord({ cwd: root, argv: ['snapshot', folder, '--round', '1'] }).exitCode).toBe(0)
			expect(readdirSync(folder).sort()).toEqual([
				'risk.jsonl',
				'round-1',
				'round-1.base',
				'round-1.deleted',
				'round-1.state',
			])
		})
})
