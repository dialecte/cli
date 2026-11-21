/**
 * `lot scope --drop` and the lot's committed work (SAFE Q5): a drop is checked against the files the lot committed
 * since its base, not only the worktree's uncommitted ones, so a drop never uncovers committed work; a drop whose lot
 * base cannot be read is refused, as the hook refuses. Refused: exit 2, nothing written.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { commitIn } from '../../test/landing-repository.ts'
import { manifestOf, scopeGuardLotOf } from '../../test/scope-guard-lot.ts'
import { writeFiles } from '../../test/scratch-repository.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runLot } from './lot.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ScopeGuardLot } from '../../test/scope-guard-lot.types.ts'
import type { CommandResult } from '../lib/command-result.types.ts'

afterEach(function restoreEnvironment() {
	vi.unstubAllEnvs()
})

const NOW = new Date('2026-11-21T12:00:00.000Z')

/** `lot scope <lot> --drop src/in/` by a person from the main checkout, read with whether a change line was written. */
function dropInsideFolder(lot: ScopeGuardLot): {
	exitCode: number
	output: string
	written: boolean
} {
	const result: CommandResult = runLot({
		cwd: lot.root,
		argv: ['scope', lot.name, '--drop', 'src/in/', '--by', 'person-a', '--reason', 'hand back'],
		now: NOW,
	})
	return {
		exitCode: result.exitCode,
		output: result.output,
		written: existsSync(join(lot.lotFolder, 'scope-changes.jsonl')),
	}
}

describe('lot scope --drop - the committed work', { timeout: STORE_CASE_TIMEOUT }, () => {
	it('a drop that would uncover a file committed on the lot branch -> refused naming it, nothing written', () => {
		const lot = scopeGuardLotOf()
		commitIn({
			root: lot.worktree,
			files: { 'src/in/a.ts': 'export const a = 1\n' },
			message: 'feat: a',
		})

		expect(dropInsideFolder(lot)).toEqual({
			exitCode: 2,
			output: expect.stringContaining('src/in/a.ts'),
			written: false,
		})
	})

	it('a drop whose lot base cannot be resolved -> refused naming the base, nothing written', () => {
		const lot = scopeGuardLotOf()
		writeFiles({
			root: lot.worktree,
			files: {
				'package.json': manifestOf({ counter: lot.counter, dialecte: { baseBranch: 'trunk' } }),
			},
		})

		expect(dropInsideFolder(lot)).toEqual({
			exitCode: 2,
			output: expect.stringContaining('trunk'),
			written: false,
		})
	})
})
