/** `handover run` on a scoped package whose configured base branch does not exist: refused, nothing committed. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { createScopedLotPackageOfOneStep, writeLotsHandover } from '../../test/scoped-handover.ts'
import { READ_LOT, SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import { createCounter, editReadLot, runFolder } from '../../test/scratch-checks.ts'
import { git, writeFiles } from '../../test/scratch-repository.ts'
import { NO_CONFIGURED_BASE_BRANCH } from '../lib/gate/gate-base.constants.ts'

import { describe, expect, it } from 'vitest'

describe(
	'handover run: the base branch of a scoped package',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it('dialecte.baseBranch names a branch with neither a local nor an origin ref → exit 2 with the resolver’s refusal naming it, no commit made', async () => {
			const { root } = createScopedLotPackageOfOneStep({ hookCounter: createCounter() })
			editReadLot(root)
			const { out, result: written } = writeLotsHandover({ root, lots: [READ_LOT] })
			expect(written.exitCode).toBe(0)
			// the package names its base branch after the hand-over was written
			const declared = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
				dialecte: Record<string, unknown>
			}
			declared.dialecte.baseBranch = 'release'
			writeFiles({ root, files: { 'package.json': `${JSON.stringify(declared, null, '\t')}\n` } })
			const before = git({ root, args: ['rev-parse', 'HEAD'] })

			await expect(runFolder({ out })).resolves.toMatchObject({
				exitCode: 2,
				text: expect.stringContaining(NO_CONFIGURED_BASE_BRANCH.replace('{branch}', 'release')),
			})
			expect(git({ root, args: ['rev-parse', 'HEAD'] })).toBe(before)
		})

		it('R3-8 dialecte.baseBranch is a$&b, no such branch → the refusal holds the name verbatim, never a replacement pattern read, exit 2', async () => {
			const { root } = createScopedLotPackageOfOneStep({ hookCounter: createCounter() })
			editReadLot(root)
			const { out, result: written } = writeLotsHandover({ root, lots: [READ_LOT] })
			expect(written.exitCode).toBe(0)
			const declared = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
				dialecte: Record<string, unknown>
			}
			declared.dialecte.baseBranch = 'a$&b'
			writeFiles({ root, files: { 'package.json': `${JSON.stringify(declared, null, '\t')}\n` } })

			const run = await runFolder({ out })

			expect({
				exitCode: run.exitCode,
				holdsTheName: run.text.includes(
					'dialecte.baseBranch names a$&b, but there is no such branch',
				),
			}).toEqual({ exitCode: 2, holdsTheName: true })
		})
	},
)
