/** `handover run`: a hook whose test step failed in parallel and passed in its serial rerun reads flaky on the card. */

import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { FLAKY_HOOK_LINES, FLAKY_WORDS, TEST_HOOK_ROW } from '../../test/hook-flaky.constants.ts'
import { noRepositoryCli } from '../../test/repository-cli-probe.ts'
import { gateLinesOf, runFolder } from '../../test/scratch-checks.ts'
import {
	createScratchRepository,
	git,
	temporaryFolder,
	writeFiles,
} from '../../test/scratch-repository.ts'
import { HANDOVER_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { runHandover } from './handover.ts'

import { describe, expect, it } from 'vitest'

import type { LotsFile } from '../lib/handover/handover.types.ts'

/** A shell command printing each line as given. */
function printLines(lines: readonly string[]): string {
	return `printf '%s\\n' ${lines.map((line) => `'${line.replaceAll("'", "'\\''")}'`).join(' ')}`
}

/** A repository with one lot written as a hand-over, its pre-commit hook printing `lines`; the folder. */
function prepare(lines: readonly string[]): string {
	const root = createScratchRepository({ 'src/read.ts': 'export function read() {}\n' })
	writeFiles({ root, files: { '.gitignore': '.husky/_\nnode_modules\n' } })
	git({ root, args: ['add', '.gitignore'] })
	git({ root, args: ['commit', '-q', '-m', 'chore: ignore the hooks folder'] })
	mkdirSync(join(root, '.husky/_'), { recursive: true })
	writeFileSync(join(root, '.husky/_/pre-commit'), `#!/bin/sh\n${printLines(lines)}\n`)
	chmodSync(join(root, '.husky/_/pre-commit'), 0o755)
	git({ root, args: ['config', 'core.hooksPath', '.husky/_'] })
	writeFiles({
		root,
		files: {
			'src/read.ts': 'export function read() {\n\treturn 1\n}\n',
			'CHANGELOG.md': '# Changelog\n\n- read answers 1\n',
		},
	})
	const out = temporaryFolder('dialecte-handover-')
	const lotsPath = join(out, 'lots.json')
	const lotsFile: LotsFile = {
		repository: root,
		branch: 'main',
		head: git({ root, args: ['rev-parse', 'HEAD'] }).trim(),
		gates: 'npm run check',
		lots: [{ paths: ['src/', 'CHANGELOG.md'], message: 'feat(read): read answers one' }],
	}
	writeFileSync(lotsPath, JSON.stringify(lotsFile))
	const written = runHandover({
		argv: [lotsPath],
		cliPath: '/opt/dialecte/dist/cli.js',
		probe: noRepositoryCli,
	})
	expect(written.exitCode).toBe(0)
	return out
}

describe('handover run: a flaky hook step on the card', { timeout: HANDOVER_CASE_TIMEOUT }, () => {
	it('a hook whose test step failed in parallel and passed in its serial rerun → the hook row says 1 flaky, passed serially, never a failed count', async () => {
		const out = prepare(FLAKY_HOOK_LINES)

		const ran = await runFolder({ out })

		expect(ran.exitCode).toBe(0)
		const [row, ...rest] = gateLinesOf(ran.text).filter((line) => TEST_HOOK_ROW.test(line))
		expect({ rest, flaky: row?.includes(FLAKY_WORDS), failed: row?.includes('failed') }).toEqual({
			rest: [],
			flaky: true,
			failed: false,
		})
	})
})
