/**
 * `handover run`: the hook record of a package whose full test steps hold a scoped step folds the base the hook
 * printed in its base line (A4d), is written without a key when the hook prints none (A20), and is as today when
 * the scoped step is not in the full list (only in fast or release).
 */
import { createHash } from 'node:crypto'

import { SHA256_PATTERN } from '../../test/gate-records.constants.ts'
import { readRecordFile } from '../../test/gate-records.ts'
import { createScopedStep } from '../../test/scoped-gate-package.ts'
import { createScopedHookedPackage, gateOfLayout } from '../../test/scoped-hook-package.ts'
import {
	HOOK_RECORD_FILE,
	SCRATCH_REPOSITORY_TIMEOUT,
} from '../../test/scratch-checks.constants.ts'
import {
	countingStep,
	createCounter,
	editReadLot,
	headOf,
	runFolder,
	writeReadLotHandover,
} from '../../test/scratch-checks.ts'
import { git } from '../../test/scratch-repository.ts'
import { hashHookCommand } from '../lib/gate-records/check-key.ts'
import { readTreeRecords } from '../lib/gate-records/check-store.ts'

import { describe, expect, it } from 'vitest'

import type { GateLayout } from '../../test/scoped-hook-package.types.ts'
import type { GateRecord } from '../lib/gate-records/gate-records.types.ts'

/** A base the hook says it used, which is no commit of the repository: the record must hold exactly this. */
const PRINTED_BASE = 'd'.repeat(40)

/** A shell command printing each line as given. */
function printLines(lines: readonly string[]): string {
	return `printf '%s\\n' ${lines.map((line) => `'${line.replaceAll("'", "'\\''")}'`).join(' ')}`
}

/** What a hook running `gate --hook` prints: npm's step header, then `lines`. */
function hookPrinting(lines: readonly string[]): string {
	return printLines(['', '> demo@1.0.0 test:hook', '> node src/cli.ts gate --hook', ...lines])
}

function baseLineOf(params: { commit: string; source: string; selection?: string }): string {
	return `gate --hook: base ${params.commit} (${params.source}), ${params.selection ?? 'selected T0'}`
}

/** Another base a hook may print, no commit of the repository either. */
const OTHER_PRINTED_BASE = 'e'.repeat(40)

/** sha256 of the hook's files folded with the base, as the hook record's command hash holds it. */
function foldedHookHash(params: { hook: string; gateBase: string }): string {
	return createHash('sha256')
		.update(JSON.stringify({ hook: params.hook, gateBase: params.gateBase }))
		.digest('hex')
}

/** A package whose scoped step is where `layout` says, its hook printing `lines`; its lot edited and handed over. */
async function runHandOver(params: { lines: readonly string[]; layout?: GateLayout }) {
	const root = createScopedHookedPackage({
		gate: gateOfLayout({
			layout: params.layout ?? 'full',
			scoped: createScopedStep().step,
			plain: countingStep({ counter: createCounter() }),
		}),
		hookScript: hookPrinting(params.lines),
	})
	editReadLot(root)
	const { out } = writeReadLotHandover(root)
	const hook = hashHookCommand(root)
	const base = headOf(root)
	const ran = await runFolder({ out })
	return { root, hook, base, ran }
}

describe(
	'handover run: the hook record of a scoped package',
	{ timeout: SCRATCH_REPOSITORY_TIMEOUT },
	() => {
		it.each([
			{ selection: 'selected T0' },
			{ selection: 'selected T0, T4' },
			{ selection: 'nothing selected' },
			{ selection: 'reused' },
		])(
			'the hook printed a base line ($selection) → the record holds that base and source, its command hash folds the base with the hook files',
			async ({ selection }) => {
				const { root, hook, ran } = await runHandOver({
					lines: [baseLineOf({ commit: PRINTED_BASE, source: 'handover', selection })],
				})

				const record = readRecordFile<GateRecord>({ root, name: HOOK_RECORD_FILE })
				expect(ran.exitCode).toBe(0)
				expect(record?.base).toEqual({ commit: PRINTED_BASE, source: 'handover' })
				expect(record?.key?.commandHash).toBe(foldedHookHash({ hook, gateBase: PRINTED_BASE }))
			},
		)

		it('A4d: the base the hook printed is not the one the run handed down (its hook refused the hand-down) → the record holds the printed one, never the handed one', async () => {
			const { root, hook, base, ran } = await runHandOver({
				lines: [baseLineOf({ commit: OTHER_PRINTED_BASE, source: 'base-branch' })],
			})

			const record = readRecordFile<GateRecord>({ root, name: HOOK_RECORD_FILE })
			expect(ran.exitCode).toBe(0)
			expect(record?.base).toEqual({ commit: OTHER_PRINTED_BASE, source: 'base-branch' })
			expect(record?.base?.commit).not.toBe(base)
			expect(record?.key?.commandHash).toBe(foldedHookHash({ hook, gateBase: OTHER_PRINTED_BASE }))
			expect(record?.key?.commandHash).not.toBe(foldedHookHash({ hook, gateBase: base }))
			expect(record?.key?.commandHash).toMatch(SHA256_PATTERN)
		})

		it('A20: an older hook that prints no base line → the record has no key and no base, and nothing is stored under the committed tree', async () => {
			const { root, ran } = await runHandOver({ lines: ['      Tests  4 passed (4)'] })

			const record = readRecordFile<GateRecord>({ root, name: HOOK_RECORD_FILE })
			const tree = git({ root, args: ['rev-parse', 'HEAD^{tree}'] }).trim()
			expect(ran.exitCode).toBe(0)
			expect(record).toMatchObject({
				mode: 'hook',
				steps: [{ name: 'test:hook', status: 'passed' }],
			})
			expect(record).not.toHaveProperty('key')
			expect(record).not.toHaveProperty('base')
			expect(readTreeRecords({ root, tree })).toEqual([])
		})

		it.each([
			{ layout: 'none' as const, label: 'no scoped step' },
			{ layout: 'fast-only' as const, label: 'the only scoped step in fast' },
			{ layout: 'release-only' as const, label: 'the only scoped step in release' },
		])(
			'$label in the full list (a base line printed all the same) → the command hash is the hook files alone and the record holds no base',
			async ({ layout }) => {
				const { root, hook, ran } = await runHandOver({
					lines: [baseLineOf({ commit: PRINTED_BASE, source: 'base-branch' })],
					layout,
				})

				const record = readRecordFile<GateRecord>({ root, name: HOOK_RECORD_FILE })
				expect(ran.exitCode).toBe(0)
				expect(record?.key?.commandHash).toBe(hook)
				expect(record).not.toHaveProperty('base')
			},
		)
	},
)
