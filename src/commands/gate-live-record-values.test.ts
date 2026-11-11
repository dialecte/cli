/**
 * R1-A4: a live line the cli composes from a record value prints an SGR in that value escaped; a child's relayed
 * line keeps its colour.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { readRecordFile } from '../../test/gate-records.ts'
import {
	FAST_RECORD_FILE,
	SCRATCH_REPOSITORY_TIMEOUT,
} from '../../test/scratch-checks.constants.ts'
import { createGatePackage } from '../../test/scratch-checks.ts'
import { commonGitDirOf } from '../../test/scratch-tree.ts'
import { CHECK_STORE_FOLDER } from '../lib/gate-records/gate-records.constants.ts'
import { createStreamLiveOutput } from '../lib/progress/stream-live-output.ts'
import {
	ESCAPED_FORGED_COLOUR,
	FORGED_AT,
	FORGED_COLOUR,
	GATE_FILES,
	PASSING_STEP,
} from './gate-live-record-values.constants.ts'
import { runGate } from './gate.ts'

import { describe, expect, it } from 'vitest'

import type { GateRecord } from '../lib/gate-records/gate-records.types.ts'

/** The text a live output over a stream that is not a terminal wrote. */
function liveTextOf(params: { cwd: string }): Promise<{ text: string; output: string }> {
	const chunks: string[] = []
	const live = createStreamLiveOutput({ isTTY: false, write: (text) => chunks.push(text) })
	return runGate({ cwd: params.cwd, argv: [], live }).then((result) => ({
		text: chunks.join(''),
		output: result.output,
	}))
}

describe('gate live lines and record values', { timeout: SCRATCH_REPOSITORY_TIMEOUT }, () => {
	it('a record whose at holds a colour sequence, reused with a live output → the reuse line prints the sequence escaped, never as a colour', async () => {
		const root = createGatePackage({ fast: [PASSING_STEP], files: GATE_FILES })
		await runGate({ cwd: root, argv: [] })
		const record = readRecordFile<GateRecord>({ root, name: FAST_RECORD_FILE })
		const stored = join(commonGitDirOf(root), CHECK_STORE_FOLDER, `${record?.key?.tree}.json`)
		const records = JSON.parse(readFileSync(stored, 'utf8')) as GateRecord[]
		writeFileSync(stored, JSON.stringify(records.map((entry) => ({ ...entry, at: FORGED_AT }))))

		const { text } = await liveTextOf({ cwd: root })

		const reuseLine = text.split('\n').find((line) => line.startsWith('reused:'))
		expect(reuseLine).toContain(ESCAPED_FORGED_COLOUR)
		expect(text).not.toContain(FORGED_COLOUR)
	})
})
