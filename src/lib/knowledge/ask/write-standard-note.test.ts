import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import {
	A_YEAR_MS,
	ISO_TIME_PATTERN,
	LOT_STANDARD_FILE,
	NOTE_LOCK_FILE,
} from '../../../../test/ask-answer-fixtures.constants.ts'
import { deadProcessId, writeClaimFile } from '../../../../test/ask-answer-fixtures.ts'
import { readJsonFile } from '../../../../test/ask-command-workspace.ts'
import { writeAskFolder } from '../../../../test/ask-records-fixtures.ts'
import { temporaryFolder } from '../../../../test/scratch-repository.ts'
import { writeTextFile } from '../../../../test/standard-workspace.ts'
import { writeStandardNote } from './write-standard-note.ts'

import { describe, expect, it } from 'vitest'

import type { AskFolderSpec } from '../../../../test/ask-records-fixtures.types.ts'

const NOW = new Date('2026-11-14T12:00:00.000Z')

/** How long the first writer holds its claim while the second tries (milliseconds). */
const RACE_PAUSE_MS = 200

/** Resolves after `milliseconds`. */
function pause(milliseconds: number): Promise<void> {
	return new Promise(function resolveLater(resolve) {
		setTimeout(resolve, milliseconds)
	})
}

/** A lot folder whose `asks` folder holds the asks given; the two paths. */
function lotHoldingAsks(params: { asks: AskFolderSpec[] }): {
	lotHome: string
	asksFolder: string
} {
	const lotHome = temporaryFolder('dialecte-ask-note-lot-')
	const asksFolder = join(lotHome, 'asks')
	for (const spec of params.asks) writeAskFolder({ asksFolder, spec })
	return { lotHome, asksFolder }
}

/** The ask that went outside and is waiting for readers (rung 2, the outside route). */
function outsideAsk(
	params: { ask: string } & Pick<AskFolderSpec, 'verdicts' | 'answer' | 'confirm'>,
): AskFolderSpec {
	return {
		ask: params.ask,
		json: { source: 'outside', rung: 2 },
		verdicts: params.verdicts,
		answer: params.answer,
		confirm: params.confirm,
	}
}

/** An `outside` record also holds whether a person confirmed every outside answer (R1-10); no other record does. */
type NoteRow = { asks: AskFolderSpec[]; state: string; note: string; confirmed?: boolean }

const NOTE_ROWS: Record<string, NoteRow> = {
	'an ask that needs readers on the documents -> consulted, the note naming it': {
		asks: [{ ask: 'A-0001' }],
		state: 'consulted',
		note: 'asks A-0001 needs-readers',
	},
	"the latest state of each ask, a verdict's answer included -> consulted, the note naming the fact":
		{
			asks: [
				{ ask: 'A-0001', verdicts: [{ round: 1, state: 'answered', fact: 'F-0001' }] },
				{ ask: 'A-0002' },
			],
			state: 'consulted',
			note: 'asks A-0001 answered F-0001 · A-0002 needs-readers',
		},
	"a person's answer to an ask on the documents -> consulted, answered with the person's fact": {
		asks: [
			{
				ask: 'A-0001',
				verdicts: [{ round: 1, state: 'needs-person', fact: null }],
				answer: { fact: 'F-0004' },
			},
		],
		state: 'consulted',
		note: 'asks A-0001 answered F-0004',
	},
	'an ask answered at rung 1 beside an ask on the documents -> consulted': {
		asks: [
			{ ask: 'A-0001', json: { state: 'answered', rung: 1, source: null, fact: 'F-0001' } },
			{ ask: 'A-0002' },
		],
		state: 'consulted',
		note: 'asks A-0001 answered F-0001 · A-0002 needs-readers',
	},
	'every ask past rung 2 went outside -> outside, the note ends (all unchecked)': {
		asks: [
			outsideAsk({ ask: 'A-0001' }),
			outsideAsk({ ask: 'A-0002', verdicts: [{ round: 1, state: 'answered', fact: 'F-0002' }] }),
		],
		state: 'outside',
		note: 'asks A-0001 needs-readers · A-0002 answered F-0002 (all unchecked)',
		confirmed: false,
	},
	'an ask answered at rung 1 beside an outside ask -> outside (rung 1 asks are not past rung 2)': {
		asks: [
			{ ask: 'A-0001', json: { state: 'answered', rung: 1, source: null, fact: 'F-0001' } },
			outsideAsk({ ask: 'A-0002' }),
		],
		state: 'outside',
		note: 'asks A-0001 answered F-0001 · A-0002 needs-readers (all unchecked)',
		confirmed: false,
	},
	'a --person-only ask beside an outside ask -> outside, the person-only ask listed and not counted as outside':
		{
			asks: [
				outsideAsk({ ask: 'A-0001' }),
				{ ask: 'A-0002', json: { state: 'needs-person', rung: 2, source: null, fact: null } },
			],
			state: 'outside',
			note: 'asks A-0001 needs-readers · A-0002 needs-person (all unchecked)',
			confirmed: false,
		},
	'an outside ask beside an ask on the documents -> outside whenever any ask went outside, both listed, unchecked':
		{
			asks: [outsideAsk({ ask: 'A-0001' }), { ask: 'A-0002' }],
			state: 'outside',
			note: 'asks A-0001 needs-readers · A-0002 needs-readers (all unchecked)',
			confirmed: false,
		},
	'every outside ask answered by a person -> outside, the note ends (all confirmed)': {
		asks: [
			outsideAsk({
				ask: 'A-0001',
				verdicts: [{ round: 1, state: 'needs-person', fact: null }],
				answer: { fact: 'F-0003' },
			}),
		],
		state: 'outside',
		note: 'asks A-0001 answered F-0003 (all confirmed)',
		confirmed: true,
	},
	'one outside ask confirmed by a person and one answered by outside readers -> the note ends (all unchecked)':
		{
			asks: [
				outsideAsk({
					ask: 'A-0001',
					verdicts: [{ round: 1, state: 'needs-person', fact: null }],
					answer: { fact: 'F-0003' },
				}),
				outsideAsk({ ask: 'A-0002', verdicts: [{ round: 1, state: 'answered', fact: 'F-0004' }] }),
			],
			state: 'outside',
			note: 'asks A-0001 answered F-0003 · A-0002 answered F-0004 (all unchecked)',
			confirmed: false,
		},
	'one outside ask confirmed by a person and one still waiting for readers -> the note ends (all unchecked)':
		{
			asks: [
				outsideAsk({
					ask: 'A-0001',
					verdicts: [{ round: 1, state: 'needs-person', fact: null }],
					answer: { fact: 'F-0003' },
				}),
				outsideAsk({ ask: 'A-0002' }),
			],
			state: 'outside',
			note: 'asks A-0001 answered F-0003 · A-0002 needs-readers (all unchecked)',
			confirmed: false,
		},
}

describe('writeStandardNote: a lot whose asks all stopped before rung 3 records nothing', () => {
	const STOPPED_EARLY: AskFolderSpec[] = [
		{ ask: 'A-0001', json: { state: 'answered', rung: 1, source: null, fact: 'F-0001' } },
		{ ask: 'A-0002', json: { state: 'needs-person', rung: 2, source: null, fact: null } },
	]

	it('asks all answered at rung 1 or sent to the person, no standard.json before -> none after', async () => {
		const { lotHome, asksFolder } = lotHoldingAsks({ asks: STOPPED_EARLY })

		await expect(
			writeStandardNote({ lotHome, asksFolder, now: () => NOW }),
		).resolves.toBeUndefined()

		expect(existsSync(join(lotHome, LOT_STANDARD_FILE))).toBe(false)
	})

	it('the same asks, a standard.json already there -> left byte for byte', async () => {
		const { lotHome, asksFolder } = lotHoldingAsks({ asks: STOPPED_EARLY })
		const before =
			'{"state":"consulted","note":"asks A-0009 needs-readers","at":"2026-11-01T00:00:00.000Z"}\n'
		writeTextFile({ path: join(lotHome, LOT_STANDARD_FILE), text: before })

		await expect(
			writeStandardNote({ lotHome, asksFolder, now: () => NOW }),
		).resolves.toBeUndefined()

		expect(readFileSync(join(lotHome, LOT_STANDARD_FILE), 'utf8')).toBe(before)
	})
})

describe('writeStandardNote: a lot mixing an ask on the documents and an outside ask', () => {
	it('the outside ask answered by outside readers and then confirmed by a person -> outside, confirmed', async () => {
		const { lotHome, asksFolder } = lotHoldingAsks({
			asks: [
				{ ask: 'A-0001' },
				outsideAsk({
					ask: 'A-0002',
					verdicts: [{ round: 1, state: 'answered', fact: 'F-0002' }],
					confirm: { fact: 'F-0003' },
				}),
			],
		})

		await writeStandardNote({ lotHome, asksFolder, now: () => NOW })

		expect(readJsonFile(join(lotHome, LOT_STANDARD_FILE))).toMatchObject({
			state: 'outside',
			note: expect.stringContaining('(all confirmed)'),
			confirmed: true,
		})
	})
})

describe('writeStandardNote: the lot note recomputed from the latest state of every ask (D12)', () => {
	it.each(Object.entries(NOTE_ROWS))('%s', async (_title, row) => {
		const { lotHome, asksFolder } = lotHoldingAsks({ asks: row.asks })

		await expect(
			writeStandardNote({ lotHome, asksFolder, now: () => NOW }),
		).resolves.toBeUndefined()

		expect(readJsonFile(join(lotHome, LOT_STANDARD_FILE))).toEqual({
			state: row.state,
			note: row.note,
			at: NOW.toISOString(),
			...(row.confirmed === undefined ? {} : { confirmed: row.confirmed }),
		})
	})

	it('the time of the record is read from the clock given, as an ISO time stamp', async () => {
		const { lotHome, asksFolder } = lotHoldingAsks({ asks: [{ ask: 'A-0001' }] })

		await expect(
			writeStandardNote({ lotHome, asksFolder, now: undefined }),
		).resolves.toBeUndefined()

		expect(readJsonFile(join(lotHome, LOT_STANDARD_FILE))).toMatchObject({
			at: expect.stringMatching(ISO_TIME_PATTERN),
		})
	})
})

/** Claims a writer must wait for: held by a live process however old, or just made by a process that is gone. */
const HELD_CLAIMS: Record<string, { pid: () => number; ageMs: number }> = {
	'a claim held by a live process (this one), just made': { pid: () => process.pid, ageMs: 0 },
	'a claim left by a process that is gone, just made': { pid: deadProcessId, ageMs: 0 },
}

describe('writeStandardNote: one writer at a time, under a claim file (D12, K3-c)', () => {
	it("a second writer that starts while the first holds the claim (after the first read the asks) -> the final note holds the second ask's latest state", async () => {
		const { lotHome, asksFolder } = lotHoldingAsks({ asks: [{ ask: 'A-0001' }, { ask: 'A-0002' }] })
		let second: Promise<void> | undefined
		const seen = { claimHeld: false, secondEndedWhileHeld: true }

		await expect(
			writeStandardNote({
				lotHome,
				asksFolder,
				now: () => NOW,
				lock: {
					async afterRead() {
						seen.claimHeld = existsSync(join(lotHome, NOTE_LOCK_FILE))
						writeAskFolder({
							asksFolder,
							spec: { ask: 'A-0002', verdicts: [{ round: 1, state: 'answered', fact: 'F-0002' }] },
						})
						let ended = false
						second = writeStandardNote({ lotHome, asksFolder, now: () => NOW }).then(() => {
							ended = true
						})
						await pause(RACE_PAUSE_MS)
						seen.secondEndedWhileHeld = ended
					},
				},
			}),
		).resolves.toBeUndefined()
		await expect(second).resolves.toBeUndefined()

		expect({
			seen,
			note: readJsonFile(join(lotHome, LOT_STANDARD_FILE)),
		}).toMatchObject({
			seen: { claimHeld: true, secondEndedWhileHeld: false },
			note: { note: 'asks A-0001 needs-readers · A-0002 answered F-0002' },
		})
	})

	it('the claim file is gone once the writers ended', async () => {
		const { lotHome, asksFolder } = lotHoldingAsks({ asks: [{ ask: 'A-0001' }] })

		await expect(
			writeStandardNote({ lotHome, asksFolder, now: () => NOW }),
		).resolves.toBeUndefined()

		expect(existsSync(join(lotHome, NOTE_LOCK_FILE))).toBe(false)
	})

	it('a claim left by a process that is gone, older than any stale limit -> taken over: the note is written and the claim removed', async () => {
		const { lotHome, asksFolder } = lotHoldingAsks({ asks: [{ ask: 'A-0001' }] })
		writeClaimFile({ path: join(lotHome, NOTE_LOCK_FILE), pid: deadProcessId(), ageMs: A_YEAR_MS })

		await expect(
			writeStandardNote({ lotHome, asksFolder, now: () => NOW }),
		).resolves.toBeUndefined()

		expect({
			note: readJsonFile(join(lotHome, LOT_STANDARD_FILE)),
			claimLeft: existsSync(join(lotHome, NOTE_LOCK_FILE)),
		}).toEqual({
			note: { state: 'consulted', note: 'asks A-0001 needs-readers', at: NOW.toISOString() },
			claimLeft: false,
		})
	})

	it('a claim held by a live process (this one) that recorded its start time, a year old (past the 10-minute cap) -> taken over: the note is written and the claim removed', async () => {
		const { lotHome, asksFolder } = lotHoldingAsks({ asks: [{ ask: 'A-0001' }] })
		writeClaimFile({ path: join(lotHome, NOTE_LOCK_FILE), pid: process.pid, ageMs: A_YEAR_MS })

		await expect(
			writeStandardNote({ lotHome, asksFolder, now: () => NOW }),
		).resolves.toBeUndefined()

		expect({
			note: readJsonFile(join(lotHome, LOT_STANDARD_FILE)),
			claimLeft: existsSync(join(lotHome, NOTE_LOCK_FILE)),
		}).toEqual({
			note: { state: 'consulted', note: 'asks A-0001 needs-readers', at: NOW.toISOString() },
			claimLeft: false,
		})
	})

	it.each(Object.entries(HELD_CLAIMS))(
		'%s -> waited for: the note is written only after the claim is released',
		async (_title, held) => {
			const { lotHome, asksFolder } = lotHoldingAsks({ asks: [{ ask: 'A-0001' }] })
			const claim = join(lotHome, NOTE_LOCK_FILE)
			writeClaimFile({ path: claim, pid: held.pid(), ageMs: held.ageMs })
			const seen = { noteBeforeRelease: true }
			setTimeout(function releaseClaim() {
				seen.noteBeforeRelease = existsSync(join(lotHome, LOT_STANDARD_FILE))
				rmSync(claim)
			}, 300)

			await expect(
				writeStandardNote({ lotHome, asksFolder, now: () => NOW }),
			).resolves.toBeUndefined()

			expect({
				noteBeforeRelease: seen.noteBeforeRelease,
				note: readJsonFile(join(lotHome, LOT_STANDARD_FILE)),
			}).toEqual({
				noteBeforeRelease: false,
				note: { state: 'consulted', note: 'asks A-0001 needs-readers', at: NOW.toISOString() },
			})
		},
	)
})
