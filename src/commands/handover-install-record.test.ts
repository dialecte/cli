/** `handover run`: the install guard's `install.json` lands in the hand-over folder, for a real run and a rehearsal. */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { SCRATCH_REPOSITORY_TIMEOUT } from '../../test/scratch-checks.constants.ts'
import {
	createCounter,
	createHookedPackage,
	editReadLot,
	runFolder,
	writeReadLotHandover,
} from '../../test/scratch-checks.ts'
import { writeFiles } from '../../test/scratch-repository.ts'
import { HANDOVER_FILES } from '../lib/handover/handover.constants.ts'
import { shellQuote } from '../lib/shell-quote.ts'

import { describe, expect, it } from 'vitest'

/** The word a lot's lines start with. */
const LOT = 'lot'

const LOCK = `${JSON.stringify({
	name: 'demo',
	lockfileVersion: 3,
	packages: { '': { name: 'demo' }, 'node_modules/left-pad': { version: '1.3.0' } },
})}\n`

/** A hooked package whose lock and `node_modules` agree, its read lot edited, the hand-over written. */
function handoverWithMatchingInstall(installed = '1.3.0'): { root: string; out: string } {
	const root = createHookedPackage({
		hookCounter: createCounter(),
		gateCounter: createCounter(),
		packageLock: LOCK,
	})
	writeFiles({
		root,
		files: {
			'node_modules/left-pad/package.json': `${JSON.stringify({ name: 'left-pad', version: installed })}\n`,
		},
	})
	editReadLot(root)
	return { root, ...writeReadLotHandover(root) }
}

function installRecordOf(out: string): unknown {
	return JSON.parse(readFileSync(join(out, HANDOVER_FILES.install), 'utf8'))
}

describe(
	'handover run: install.json in the hand-over folder',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		const ok = {
			at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
			lock: createHash('sha256').update(LOCK).digest('hex'),
			// the repository's lock (a rehearsal's clone holds the same bytes here)
			working: createHash('sha256').update(LOCK).digest('hex'),
			ok: true,
			mismatched: 0,
		}

		it('a real run → written, ok for the lock the commit holds', async () => {
			const { out } = handoverWithMatchingInstall()

			await expect(runFolder({ out })).resolves.toMatchObject({ exitCode: 0 })

			expect(installRecordOf(out)).toEqual(ok)
		})

		it('a rehearsal → written too, the guard having run on its clone', async () => {
			const { out } = handoverWithMatchingInstall()

			await expect(runFolder({ out, argv: ['--rehearse'] })).resolves.toMatchObject({ exitCode: 0 })

			expect(installRecordOf(out)).toEqual(ok)
		})

		it('a rehearsal whose node_modules do not match the lock → exit 2, refused naming the repository (never the clone), the record ok false', async () => {
			const { root, out } = handoverWithMatchingInstall('1.0.0')

			await expect(runFolder({ out, argv: ['--rehearse'] })).resolves.toMatchObject({
				exitCode: 2,
				text: expect.stringContaining(
					`\n✗ ${LOT} 1 not committed: node_modules do not match package-lock.json: run npm ci in ${shellQuote(root)}\n`,
				),
			})

			expect(installRecordOf(out)).toEqual({ ...ok, ok: false, mismatched: 1 })
		})

		it('a real run whose node_modules do not match the lock → exit 2, refused naming the repository, the record ok false', async () => {
			const { root, out } = handoverWithMatchingInstall('1.0.0')

			await expect(runFolder({ out })).resolves.toMatchObject({
				exitCode: 2,
				text: expect.stringContaining(
					`\n✗ ${LOT} 1 not committed: node_modules do not match package-lock.json: run npm ci in ${shellQuote(root)}\n`,
				),
			})

			expect(installRecordOf(out)).toEqual({ ...ok, ok: false, mismatched: 1 })
		})
	},
)
