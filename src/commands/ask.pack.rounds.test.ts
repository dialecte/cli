import { join } from 'node:path'

import { namesIn } from '../../test/ask-command-workspace.ts'
import {
	HAND_WRITTEN_NONCE_LIST,
	HIGH_EFFORT,
	PACK_FILE,
	ROUND_ONE,
	ROUND_TWO,
	ROUNDS_FOLDER,
} from '../../test/ask-pack-fixtures.constants.ts'
import {
	askedForPack,
	packedWith,
	readRoundFile,
	writeRoundOne,
} from '../../test/ask-pack-fixtures.ts'
import { STANDARD_DISK_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'
import { writeAcceptedReports } from '../lib/knowledge/ask/accepted-reports-file.ts'

import { describe, expect, it } from 'vitest'

import type { PackJson } from '../../test/ask-pack-fixtures.types.ts'
import type { PackRecord } from '../lib/knowledge/ask/ask.types.ts'

describe('ask pack: the second round after a first verdict that asked for another (case 30)', () => {
	it(
		'readers get no slice a reader of the same letter had in the first round, and fresh nonces',
		async () => {
			const asked = await askedForPack()
			writeRoundOne({ asked, given: 'first' })

			await packedWith({ workspace: asked.workspace, argv: [asked.ask], exitCode: 0 })

			const pack = readRoundFile({ asked, round: ROUND_TWO, name: PACK_FILE }) as PackRecord
			const [first] = asked.sliceIds
			expect({
				round: pack.round,
				letters: pack.readers.map((reader) => reader.letter),
				repeated: pack.readers.map((reader) => reader.slices.includes(first ?? '')),
				filled: pack.readers.map((reader) => reader.slices.length > 0),
				fresh: pack.readers.map((reader) => HAND_WRITTEN_NONCE_LIST.includes(reader.nonce)),
			}).toEqual({
				round: 2,
				letters: ['A', 'B'],
				repeated: [false, false],
				filled: [true, true],
				fresh: [false, false],
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a slice found only by an angle the first verdict verified is withheld: nothing else is left, so the round is skipped',
		async () => {
			const asked = await askedForPack()
			const [, secondAngles] = asked.sliceAngles
			writeRoundOne({ asked, given: 'first', verifiedAngles: secondAngles })

			const answer = await packedWith({
				workspace: asked.workspace,
				argv: [asked.ask, '--json'],
				exitCode: 1,
			})

			expect({
				verified: (secondAngles ?? []).length > 0,
				readers: (JSON.parse(answer.output) as PackJson).readers,
			}).toEqual({ verified: true, readers: [] })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'the first round folder is left as it was',
		async () => {
			const asked = await askedForPack()
			writeRoundOne({ asked, given: 'first' })

			await packedWith({ workspace: asked.workspace, argv: [asked.ask], exitCode: 0 })

			expect(namesIn(join(asked.asksFolder, asked.ask, ROUNDS_FOLDER))).toEqual([
				ROUND_ONE,
				ROUND_TWO,
			])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'nothing new to give at medium -> exit 1, the state needs-person and the next command named; no second round of readers is opened: the round folder holds only its skipped record',
		async () => {
			const asked = await askedForPack()
			writeRoundOne({ asked, given: 'all' })

			const answer = await packedWith({
				workspace: asked.workspace,
				argv: [asked.ask, '--json'],
				exitCode: 1,
			})

			expect({
				json: JSON.parse(answer.output) as PackJson,
				rounds: namesIn(join(asked.asksFolder, asked.ask, ROUNDS_FOLDER)),
				second: namesIn(join(asked.asksFolder, asked.ask, ROUNDS_FOLDER, ROUND_TWO)),
			}).toMatchObject({
				json: {
					schema: 1,
					ask: asked.ask,
					round: 2,
					state: 'needs-person',
					readers: [],
					next: expect.stringContaining(`ask answer ${asked.ask}`),
				},
				rounds: [ROUND_ONE, ROUND_TWO],
				second: ['skipped.json'],
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'nothing new to give at high, no accepted report answering -> exit 1, needs-person: the adjudicator is never asked for nothing',
		async () => {
			const asked = await askedForPack({ argv: ['--effort', HIGH_EFFORT] })
			writeRoundOne({ asked, given: 'all', high: true })
			writeAcceptedReports({
				folder: join(asked.asksFolder, asked.ask, ROUNDS_FOLDER, ROUND_ONE),
				ask: asked.ask,
				round: 1,
				reports: [],
			})

			await packedWith({ workspace: asked.workspace, argv: [asked.ask], exitCode: 1 })

			expect(
				namesIn(join(asked.asksFolder, asked.ask, ROUNDS_FOLDER, ROUND_TWO)).includes(
					'adjudicator.json',
				),
			).toBe(false)
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'nothing new to give, text output -> names the ask, says there is nothing left to give and the next command',
		async () => {
			const asked = await askedForPack()
			writeRoundOne({ asked, given: 'all' })

			const answer = await packedWith({
				workspace: asked.workspace,
				argv: [asked.ask],
				exitCode: 1,
			})

			expect([
				answer.output.includes(asked.ask),
				/nothing/iu.test(answer.output),
				answer.output.includes(`ask answer ${asked.ask}`),
			]).toEqual([true, true, true])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})
