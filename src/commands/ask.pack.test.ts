import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import {
	RUNG_ONE_QUESTION,
	SECOND_ASK,
	SEMANTIC_QUESTION,
	SLICE_SENTENCE,
} from '../../test/ask-command-workspace.constants.ts'
import {
	askedJson,
	askRecordPath,
	namesIn,
	readJsonFile,
} from '../../test/ask-command-workspace.ts'
import { workspaceFactsFolder } from '../../test/ask-fix-1-fixtures.ts'
import {
	HIGH_EFFORT,
	OUT_FOLDER,
	PACK_FILE,
	PACK_TAG_FILE_MOVED,
	READER_FILES,
	REQUEST_FILE,
	ROUND_ONE,
	ROUNDS_FOLDER,
	UNKNOWN_ASK,
} from '../../test/ask-pack-fixtures.constants.ts'
import {
	askedForPack,
	askedOutside,
	packedWith,
	readRoundFile,
	reaskedForPack,
	reaskTwinForPack,
	roundFolderOf,
	snapshotOf,
	writeRoundOne,
} from '../../test/ask-pack-fixtures.ts'
import { readHistoryFile } from '../../test/fact-fixtures.ts'
import { DECLARED_FOLDER, DECLARED_NAME } from '../../test/standard-selection.constants.ts'
import { writeTextFile } from '../../test/standard-workspace.ts'
import { STANDARD_DISK_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'

import { describe, expect, it } from 'vitest'

import type { AskedForPack, BriefJson, PackJson } from '../../test/ask-pack-fixtures.types.ts'
import type { PackRecord } from '../lib/knowledge/ask/ask.types.ts'

describe('ask pack: a documents ask at medium opens the first round with readers A and B', () => {
	it(
		'pack A-0001 -> exit 0; the first round folder holds pack.json and the brief of A and of B, in markdown and json',
		async () => {
			const asked = await askedForPack()

			await packedWith({ workspace: asked.workspace, argv: [asked.ask], exitCode: 0 })

			expect(namesIn(roundFolderOf({ asked, round: ROUND_ONE }))).toEqual([
				PACK_FILE,
				...READER_FILES.A,
				...READER_FILES.B,
			])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'pack.json holds the ask, the round, the route and the readers; reader A is given exactly the ask list (the wider search adds nothing here)',
		async () => {
			const asked = await askedForPack()

			await packedWith({ workspace: asked.workspace, argv: [asked.ask], exitCode: 0 })

			const pack = readRoundFile({ asked, round: ROUND_ONE, name: PACK_FILE }) as PackRecord
			expect({
				header: { schema: pack.schema, ask: pack.ask, round: pack.round },
				route: { outside: pack.outside, web: pack.web },
				letters: pack.readers.map((reader) => reader.letter),
				aSlices: pack.readers[0]?.slices,
			}).toEqual({
				header: { schema: 1, ask: asked.ask, round: 1 },
				route: { outside: false, web: false },
				letters: ['A', 'B'],
				aSlices: asked.sliceIds,
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'each brief carries the nonce pack.json records for its reader, and no two readers share one',
		async () => {
			const asked = await askedForPack()

			await packedWith({ workspace: asked.workspace, argv: [asked.ask], exitCode: 0 })

			const pack = readRoundFile({ asked, round: ROUND_ONE, name: PACK_FILE }) as PackRecord
			const briefNonces = [READER_FILES.A[0], READER_FILES.B[0]].map(
				(name) => (readRoundFile({ asked, round: ROUND_ONE, name }) as BriefJson).nonce,
			)
			expect({
				same: briefNonces,
				distinct: new Set(briefNonces).size,
				filled: briefNonces.every((nonce) => nonce !== ''),
			}).toEqual({
				same: pack.readers.map((reader) => reader.nonce),
				distinct: 2,
				filled: true,
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'reader-A.md holds the question and the text of the slice with its original line number; its json names ask, round, letter',
		async () => {
			const asked = await askedForPack()

			await packedWith({ workspace: asked.workspace, argv: [asked.ask], exitCode: 0 })

			const markdown = existsSync(
				join(roundFolderOf({ asked, round: ROUND_ONE }), READER_FILES.A[1]),
			)
				? readFileSync(join(roundFolderOf({ asked, round: ROUND_ONE }), READER_FILES.A[1]), 'utf8')
				: ''
			expect({
				line: markdown
					.split('\n')
					.some((line) => line.includes(SLICE_SENTENCE) && /\b2\b/u.test(line)),
				json: readRoundFile({ asked, round: ROUND_ONE, name: READER_FILES.A[0] }),
			}).toMatchObject({
				line: true,
				json: { ask: asked.ask, round: 1, reader: 'A', outside: null },
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'the slices of each brief json are the slices pack.json records for that reader',
		async () => {
			const asked = await askedForPack()

			await packedWith({ workspace: asked.workspace, argv: [asked.ask], exitCode: 0 })

			const pack = readRoundFile({ asked, round: ROUND_ONE, name: PACK_FILE }) as PackRecord
			expect(
				[READER_FILES.A[0], READER_FILES.B[0]].map((name) =>
					(readRoundFile({ asked, round: ROUND_ONE, name }) as BriefJson).slices.map(
						(slice) => slice.id,
					),
				),
			).toEqual(pack.readers.map((reader) => reader.slices))
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'--json -> schema 1, the ask, the round, the state, one entry per reader with its brief and slices, and what is next',
		async () => {
			const asked = await askedForPack()

			const answer = await packedWith({
				workspace: asked.workspace,
				argv: [asked.ask, '--json'],
				exitCode: 0,
			})

			expect(JSON.parse(answer.output) as PackJson).toMatchObject({
				schema: 1,
				ask: asked.ask,
				round: 1,
				state: 'needs-readers',
				readers: [
					{
						letter: 'A',
						brief: expect.stringMatching(/reader-A\.md$/u),
						slices: expect.any(Array),
					},
					{
						letter: 'B',
						brief: expect.stringMatching(/reader-B\.md$/u),
						slices: expect.any(Array),
					},
				],
				next: expect.stringContaining('verdict'),
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'--out <dir> -> the briefs are copied there too, and the ask folder keeps the originals',
		async () => {
			const asked = await askedForPack()
			const out = join(asked.workspace.base, OUT_FOLDER)

			await packedWith({
				workspace: asked.workspace,
				argv: [asked.ask, '--out', out],
				exitCode: 0,
			})

			expect({
				copies: namesIn(out),
				originals: namesIn(roundFolderOf({ asked, round: ROUND_ONE })),
			}).toEqual({
				copies: [...READER_FILES.A, ...READER_FILES.B],
				originals: [PACK_FILE, ...READER_FILES.A, ...READER_FILES.B],
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('ask pack: the pool is wider than the ask list, and the ask may live in a hand-over folder', () => {
	it(
		'an ask made with --limit 1 -> the pack finds more slices than the ask listed, the listed one first',
		async () => {
			const asked = await askedForPack({ argv: ['--limit', '1'], single: true })

			await packedWith({ workspace: asked.workspace, argv: [asked.ask], exitCode: 0 })

			const pack = readRoundFile({ asked, round: ROUND_ONE, name: PACK_FILE }) as PackRecord
			expect({
				first: pack.readers[0]?.slices[0],
				wider: (pack.readers[0]?.slices.length ?? 0) > 1,
			}).toEqual({ first: asked.sliceIds[0], wider: true })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'pack --lot <hand-over folder> finds the ask kept there and opens its round there',
		async () => {
			const asked = await askedForPack({ inHandover: true })

			await packedWith({
				workspace: asked.workspace,
				argv: [asked.ask, ...asked.lotArgv],
				exitCode: 0,
			})

			expect(namesIn(roundFolderOf({ asked, round: ROUND_ONE }))).toEqual([
				PACK_FILE,
				...READER_FILES.A,
				...READER_FILES.B,
			])
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('ask pack: a high ask opens A, B and C, C without the top-ranked slice', () => {
	it(
		'--effort high on the ask -> three readers; C is given none of the slice A ranks first',
		async () => {
			const asked = await askedForPack({ argv: ['--effort', HIGH_EFFORT] })

			await packedWith({ workspace: asked.workspace, argv: [asked.ask], exitCode: 0 })

			const pack = readRoundFile({ asked, round: ROUND_ONE, name: PACK_FILE }) as PackRecord
			const [first] = pack.readers[0]?.slices ?? []
			expect({
				letters: pack.readers.map((reader) => reader.letter),
				cHolds: pack.readers[2]?.slices.includes(first ?? ''),
				cNotEmpty: (pack.readers[2]?.slices.length ?? 0) > 0,
			}).toEqual({ letters: ['A', 'B', 'C'], cHolds: false, cNotEmpty: true })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('ask pack: the same open round gives the same briefs and nothing is rewritten (K3-d)', () => {
	it(
		'pack again on the open round -> the same files, the same text, the same modification times, the same output',
		async () => {
			const asked = await askedForPack()
			const first = await packedWith({
				workspace: asked.workspace,
				argv: [asked.ask, '--json'],
				exitCode: 0,
			})
			const before = snapshotOf(roundFolderOf({ asked, round: ROUND_ONE }))

			const second = await packedWith({
				workspace: asked.workspace,
				argv: [asked.ask, '--json'],
				exitCode: 0,
			})

			expect({
				output: second.output,
				folder: snapshotOf(roundFolderOf({ asked, round: ROUND_ONE })),
				rounds: namesIn(join(asked.asksFolder, asked.ask, ROUNDS_FOLDER)),
			}).toEqual({ output: first.output, folder: before, rounds: [ROUND_ONE] })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('ask pack: what it refuses, exit 2, naming the fix (D15)', () => {
	it(
		'--outside on a documents ask -> exit 2, naming pack without --outside; nothing is written',
		async () => {
			const asked = await askedForPack()

			const answer = await packedWith({
				workspace: asked.workspace,
				argv: [asked.ask, '--outside'],
				exitCode: 2,
			})

			expect({
				fix: new RegExp(`dialecte ask pack ${asked.ask}(?!\\d| --outside)`, 'u').test(
					answer.output,
				),
				rounds: existsSync(join(asked.asksFolder, asked.ask, ROUNDS_FOLDER)),
			}).toEqual({ fix: true, rounds: false })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'pack on an ask that went outside, without --outside -> exit 2, naming pack --outside',
		async () => {
			const asked = await askedOutside()

			const answer = await packedWith({
				workspace: asked.workspace,
				argv: [asked.ask],
				exitCode: 2,
			})

			expect(answer.output).toContain(`dialecte ask pack ${asked.ask} --outside`)
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'an ask id no folder holds -> exit 2 naming the id; nothing is written',
		async () => {
			const asked = await askedForPack()

			const answer = await packedWith({
				workspace: asked.workspace,
				argv: [UNKNOWN_ASK],
				exitCode: 2,
			})

			expect({
				named: answer.output.includes(UNKNOWN_ASK),
				asks: namesIn(asked.asksFolder).includes(UNKNOWN_ASK),
			}).toEqual({ named: true, asks: false })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'no ask id -> exit 2 with the usage',
		async () => {
			const asked = await askedForPack()

			const answer = await packedWith({ workspace: asked.workspace, argv: [], exitCode: 2 })

			expect(answer.output).toContain('ask pack')
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'an answered ask -> exit 2 saying it is answered; no round is opened',
		async () => {
			const asked = await askedForPack()
			await askedJson({ workspace: asked.workspace, argv: [RUNG_ONE_QUESTION], exitCode: 0 })

			const answer = await packedWith({
				workspace: asked.workspace,
				argv: [SECOND_ASK],
				exitCode: 2,
			})

			expect({
				said: /answered/iu.test(answer.output),
				rounds: existsSync(join(asked.asksFolder, SECOND_ASK, ROUNDS_FOLDER)),
			}).toEqual({ said: true, rounds: false })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'an ask whose latest verdict.json says answered -> exit 2 saying it is answered; no new round is opened',
		async () => {
			const asked = await askedForPack()
			writeRoundOne({ asked, given: 'all', answered: true })

			const answer = await packedWith({
				workspace: asked.workspace,
				argv: [asked.ask],
				exitCode: 2,
			})

			expect({
				said: /answered/iu.test(answer.output),
				rounds: namesIn(join(asked.asksFolder, asked.ask, ROUNDS_FOLDER)),
			}).toEqual({ said: true, rounds: [ROUND_ONE] })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'a manifest file whose sha256 moved since the ask -> exit 2 naming ask again; no round is opened',
		async () => {
			const asked = await askedForPack()
			writeTextFile({
				path: join(asked.workspace.root, DECLARED_FOLDER, 'tag.md'),
				text: PACK_TAG_FILE_MOVED,
			})

			const answer = await packedWith({
				workspace: asked.workspace,
				argv: [asked.ask],
				exitCode: 2,
			})

			expect({
				said: ['file-changed', 'ask again'].map((part) => answer.output.includes(part)),
				rounds: existsSync(join(asked.asksFolder, asked.ask, ROUNDS_FOLDER)),
			}).toEqual({ said: [true, true], rounds: false })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'an ask folder without request.json (made before the readers) -> exit 2 naming dialecte ask "<question>" again',
		async () => {
			const asked = await askedForPack()
			rmSync(join(asked.asksFolder, asked.ask, REQUEST_FILE), { force: true })

			const answer = await packedWith({
				workspace: asked.workspace,
				argv: [asked.ask],
				exitCode: 2,
			})

			expect(answer.output).toContain(`dialecte ask "${SEMANTIC_QUESTION}"`)
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

describe('ask pack --outside [--web]: the outside route (Q16)', () => {
	it(
		'pack --outside on an outside ask -> exit 0, the first round, briefs with no slice and the public name; the web is not allowed',
		async () => {
			const asked = await askedOutside()

			await packedWith({ workspace: asked.workspace, argv: [asked.ask, '--outside'], exitCode: 0 })

			expect({
				pack: readRoundFile({ asked, round: ROUND_ONE, name: PACK_FILE }),
				brief: readRoundFile({ asked, round: ROUND_ONE, name: READER_FILES.A[0] }),
			}).toMatchObject({
				pack: {
					schema: 1,
					ask: asked.ask,
					round: 1,
					outside: true,
					web: false,
					readers: [
						{ letter: 'A', slices: [] },
						{ letter: 'B', slices: [] },
					],
				},
				brief: { reader: 'A', outside: { name: DECLARED_NAME, web: false }, slices: [] },
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'--web -> the pack records web: true and each brief says the web is allowed',
		async () => {
			const asked = await askedOutside()

			await packedWith({
				workspace: asked.workspace,
				argv: [asked.ask, '--outside', '--web'],
				exitCode: 0,
			})

			expect({
				pack: readRoundFile({ asked, round: ROUND_ONE, name: PACK_FILE }),
				brief: readRoundFile({ asked, round: ROUND_ONE, name: READER_FILES.B[0] }),
			}).toMatchObject({
				pack: { outside: true, web: true },
				brief: { reader: 'B', outside: { name: DECLARED_NAME, web: true } },
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'two outside readers do not share a nonce',
		async () => {
			const asked = await askedOutside()

			await packedWith({ workspace: asked.workspace, argv: [asked.ask, '--outside'], exitCode: 0 })

			const pack = readRoundFile({ asked, round: ROUND_ONE, name: PACK_FILE }) as PackRecord
			expect(new Set(pack.readers.map((reader) => reader.nonce)).size).toBe(2)
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})

/** What reader A's json brief of round 1 lists, as the re-ask cases read it. */
type ReaderABrief = { angles: unknown[]; slices: { id: string }[] }

/** Reader A's json brief of round 1 of the ask. */
function briefOfReaderA(params: { asked: AskedForPack }): ReaderABrief {
	return readRoundFile({
		asked: params.asked,
		round: ROUND_ONE,
		name: READER_FILES.A[0],
	}) as ReaderABrief
}

describe('ask pack: a re-ask of an unchecked fact is packed like any ask (D33)', () => {
	it(
		'the re-ask ask.json holds no angle and no slice, yet the briefs list the angles and the slices rebuilt from its request',
		async () => {
			const asked = await reaskedForPack()
			const twin = await reaskTwinForPack()

			await packedWith({ workspace: asked.workspace, argv: [asked.ask], exitCode: 0 })
			await packedWith({ workspace: twin.workspace, argv: [twin.ask], exitCode: 0 })

			const reasked = briefOfReaderA({ asked })
			expect({
				recorded: readJsonFile(askRecordPath({ asksFolder: asked.asksFolder, ask: asked.ask })),
				filled: reasked.angles.length > 0 && reasked.slices.length > 0,
				angles: reasked.angles,
				slices: reasked.slices.map((slice) => slice.id),
			}).toMatchObject({
				recorded: { reask: 'F-0001', state: 'needs-readers' },
				filled: true,
				angles: briefOfReaderA({ asked: twin }).angles,
				slices: briefOfReaderA({ asked: twin }).slices.map((slice) => slice.id),
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)

	it(
		'packing the re-ask reads and writes no fact: the unchecked fact keeps the history it had',
		async () => {
			const asked = await reaskedForPack()
			const folder = workspaceFactsFolder({ workspace: asked.workspace })
			const before = {
				history: readHistoryFile({ folder, id: 'F-0001' }),
				facts: namesIn(folder),
			}

			await packedWith({ workspace: asked.workspace, argv: [asked.ask], exitCode: 0 })

			expect({
				history: readHistoryFile({ folder, id: 'F-0001' }),
				facts: namesIn(folder),
			}).toEqual(before)
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})
