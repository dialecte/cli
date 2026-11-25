/**
 * Every send of a lot's change request text goes through one function: it reads the change request again just before
 * the host call, renders over that body (the person's part carried, a line the render would drop refused), adds the new
 * body's lines to the lot's append-only sent record before the host call, and sends only when the text reads otherwise.
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { changeRequestUrlOf, recordingHost } from '../../../test/land-lot.ts'
import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { GENERIC_NOUNS } from '../host/host.constants.ts'
import { FILLED_PARTS } from './change-request.constants.ts'
import { composeChangeRequest } from './compose-change-request.ts'
import { readSentBody, sendWithRecord } from './send-with-record.ts'
import { lineHashOf } from './sent-body.ts'

import { describe, expect, it } from 'vitest'

import type { ChangeRequest } from '../host/host.types.ts'
import type { ChangeRequestSources, PreparedChangeRequest } from './change-request.types.ts'

/** A template with every part the renderer fills under its own heading (the first the summary), then the kept part. */
const TEMPLATE = `${FILLED_PARTS.map((part) => `### ${part === 'summary' ? 'Summary' : part}\n\n<!-- dialecte:${part} -->\n`).join('\n')}
<!-- dialecte:kept -->
### For the reviewer

- [ ] The code is reviewed
`

const SOURCES: ChangeRequestSources = {
	messages: ['fix(x): x'],
	summary: 'X lands.',
	treeHash: 'a'.repeat(64),
	release: false,
}

/** The lot's prepared change request for `sources`. */
function preparedOf(sources: ChangeRequestSources = SOURCES): PreparedChangeRequest {
	return { template: TEMPLATE, sources, nouns: GENERIC_NOUNS }
}

/** The body the cli renders for `sources` with no body to carry. */
function bodyOf(sources: ChangeRequestSources = SOURCES): string {
	const text = composeChangeRequest({
		template: TEMPLATE,
		sources,
		nouns: GENERIC_NOUNS,
		kept: undefined,
	})
	if ('refusal' in text) throw new Error(text.refusal)
	return text.body
}

/** Change request 7 with `body`, titled as the lot. */
function changeRequestWith(body: string): ChangeRequest {
	return {
		title: 'fix(x): x',
		body,
		number: 7,
		url: changeRequestUrlOf(7),
		state: 'open',
		draft: true,
		queued: false,
		head: '',
		base: 'main',
	}
}

/** A lot folder, empty. */
function lotFolderOf(): string {
	return temporaryFolder('dialecte-sent-body-')
}

/** The recorded set of change request 7 in `lotFolder`, or the refusal of its record. */
function setOf(lotFolder: string) {
	const read = readSentBody({ lotFolder, changeRequest: 7 })
	return 'refusal' in read ? read.refusal : read.sent
}

describe('sendWithRecord', () => {
	it('a body that already reads the same, no record → nothing sent, its lines recorded', () => {
		const lotFolder = lotFolderOf()
		const body = bodyOf()
		const { host, calls } = recordingHost({ existing: changeRequestWith(body) })

		const result = sendWithRecord({
			host,
			worktree: lotFolder,
			lotFolder,
			prepared: preparedOf(),
			changeRequest: changeRequestWith(body),
		})

		const recorded = setOf(lotFolder)
		expect({
			sent: 'refusal' in result ? result.refusal : result.sent,
			calls,
			recorded:
				recorded instanceof Set &&
				['### Summary', 'X lands.', '### checklist'].every((line) =>
					recorded.has(lineHashOf(line)),
				),
		}).toEqual({ sent: false, calls: ['read 7'], recorded: true })
	})

	it('records changed since the last send → the new lines added before the edit, the old ones kept, sent', () => {
		const lotFolder = lotFolderOf()
		const old = bodyOf()
		const { host, calls, bodies } = recordingHost({ existing: changeRequestWith(old) })
		sendWithRecord({
			host,
			worktree: lotFolder,
			lotFolder,
			prepared: preparedOf(),
			changeRequest: changeRequestWith(old),
		})

		const result = sendWithRecord({
			host,
			worktree: lotFolder,
			lotFolder,
			prepared: preparedOf({ ...SOURCES, summary: 'X lands once.' }),
			changeRequest: changeRequestWith(old),
		})

		const recorded = setOf(lotFolder)
		expect({
			sent: 'refusal' in result ? result.refusal : result.sent,
			edits: calls.filter((call) => call.startsWith('edit')),
			body: bodies.at(-1)?.split('\n')[2],
			both:
				recorded instanceof Set &&
				recorded.has(lineHashOf('X lands.')) &&
				recorded.has(lineHashOf('X lands once.')),
		}).toEqual({ sent: true, edits: ['edit 7 "fix(x): x"'], body: 'X lands once.', both: true })
	})

	it('the host refuses the edit → its refusal; the new lines stay recorded', () => {
		const lotFolder = lotFolderOf()
		const old = bodyOf()
		const { host } = recordingHost({ existing: changeRequestWith(old), editRefusal: 'gh: no' })

		const result = sendWithRecord({
			host,
			worktree: lotFolder,
			lotFolder,
			prepared: preparedOf({ ...SOURCES, summary: 'X lands once.' }),
			changeRequest: changeRequestWith(old),
		})

		const recorded = setOf(lotFolder)
		expect({
			result,
			kept: recorded instanceof Set && recorded.has(lineHashOf('X lands once.')),
		}).toEqual({ result: { refusal: 'gh: no' }, kept: true })
	})

	it('a person part edited between the first read and the send → the send carries it', () => {
		const lotFolder = lotFolderOf()
		const old = bodyOf()
		const edited = `${old}\n\nA reviewer note.`
		const { host, bodies } = recordingHost({ existing: changeRequestWith(edited) })

		const result = sendWithRecord({
			host,
			worktree: lotFolder,
			lotFolder,
			prepared: preparedOf({ ...SOURCES, summary: 'X lands once.' }),
			changeRequest: changeRequestWith(old),
		})

		expect([
			'refusal' in result ? result.refusal : result.sent,
			bodies.at(-1)?.endsWith('A reviewer note.'),
		]).toEqual([true, true])
	})

	it('a line added above the kept heading between the first read and the send → refused, nothing sent', () => {
		const lotFolder = lotFolderOf()
		const old = bodyOf()
		const { host: first } = recordingHost({ existing: changeRequestWith(old) })
		sendWithRecord({
			host: first,
			worktree: lotFolder,
			lotFolder,
			prepared: preparedOf(),
			changeRequest: changeRequestWith(old),
		})
		const edited = old.replace('X lands.\n', 'X lands.\n\nA note by hand.\n')
		const { host, calls } = recordingHost({ existing: changeRequestWith(edited) })

		const result = sendWithRecord({
			host,
			worktree: lotFolder,
			lotFolder,
			prepared: preparedOf({ ...SOURCES, summary: 'X lands once.' }),
			changeRequest: changeRequestWith(old),
		})

		expect({
			refused: 'refusal' in result && result.refusal.includes("('A note by hand.')"),
			calls,
		}).toEqual({ refused: true, calls: ['read 7'] })
	})

	it('the change request closed at the second read → refused naming its state, nothing sent', () => {
		const lotFolder = lotFolderOf()
		const body = bodyOf()
		const { host, calls } = recordingHost({
			existing: { ...changeRequestWith(body), state: 'merged' },
		})

		const result = sendWithRecord({
			host,
			worktree: lotFolder,
			lotFolder,
			prepared: preparedOf({ ...SOURCES, summary: 'X lands once.' }),
			changeRequest: changeRequestWith(body),
		})

		expect([result, calls]).toEqual([
			{ refusal: 'the change request #7 is merged now: nothing sent' },
			['read 7'],
		])
	})

	it('a send whose lines are all recorded → the record left as it is', () => {
		const lotFolder = lotFolderOf()
		const body = bodyOf()
		const { host } = recordingHost({ existing: changeRequestWith(body) })
		function send() {
			return sendWithRecord({
				host,
				worktree: lotFolder,
				lotFolder,
				prepared: preparedOf(),
				changeRequest: changeRequestWith(body),
			})
		}
		send()
		const once = readFileSync(join(lotFolder, 'sent-body.jsonl'), 'utf8')

		send()

		expect(readFileSync(join(lotFolder, 'sent-body.jsonl'), 'utf8')).toBe(once)
	})

	it('the record cannot be written → refused naming it, nothing sent', () => {
		const lotFolder = lotFolderOf()
		mkdirSync(join(lotFolder, 'sent-body.jsonl'))
		const body = bodyOf()
		const { host, calls } = recordingHost({ existing: changeRequestWith(body) })

		const result = sendWithRecord({
			host,
			worktree: lotFolder,
			lotFolder,
			prepared: preparedOf({ ...SOURCES, summary: 'X lands once.' }),
			changeRequest: changeRequestWith(body),
		})

		expect({
			refused:
				'refusal' in result &&
				result.refusal.startsWith(`${join(lotFolder, 'sent-body.jsonl')} cannot`),
			calls,
		}).toEqual({ refused: true, calls: ['read 7'] })
	})

	it('the change request gone at the second read → refused, nothing sent', () => {
		const lotFolder = lotFolderOf()
		const { host, calls } = recordingHost({})

		const result = sendWithRecord({
			host,
			worktree: lotFolder,
			lotFolder,
			prepared: preparedOf(),
			changeRequest: changeRequestWith(bodyOf()),
		})

		expect([result, calls]).toEqual([
			{ refusal: 'the change request #7 cannot be read again before the send: nothing sent' },
			['read 7'],
		])
	})
})

describe('readSentBody', () => {
	it('a record holding a row of an unknown schema → refused naming the file and the way out', () => {
		const lotFolder = lotFolderOf()
		const file = join(lotFolder, 'sent-body.jsonl')
		writeFileSync(file, `${JSON.stringify({ schema: 2, changeRequest: 7, at: 'a', lines: [] })}\n`)

		expect(readSentBody({ lotFolder, changeRequest: 7 })).toEqual({
			refusal: `${file} cannot be read (line 1 is no row of schema 1): remove it, and the next render checks the body's headings and records again; nothing sent`,
		})
	})

	it('a torn last line (a crash mid-append) → skipped, the whole rows read', () => {
		const lotFolder = lotFolderOf()
		const file = join(lotFolder, 'sent-body.jsonl')
		writeFileSync(
			file,
			`${JSON.stringify({ schema: 1, changeRequest: 7, at: 'a', lines: [lineHashOf('x')] })}\n`,
		)
		appendFileSync(file, '{"schema":1,"changeRe')

		expect(readSentBody({ lotFolder, changeRequest: 7 })).toEqual({
			sent: new Set([lineHashOf('x')]),
		})
	})

	it('a torn line a later append left in the middle → skipped, the whole rows around it read', () => {
		const lotFolder = lotFolderOf()
		const file = join(lotFolder, 'sent-body.jsonl')
		function row(hash: string) {
			return JSON.stringify({ schema: 1, changeRequest: 7, at: 'a', lines: [hash] })
		}
		writeFileSync(file, `${row(lineHashOf('x'))}\n{"schema":1,"changeRe\n${row(lineHashOf('y'))}\n`)

		expect(readSentBody({ lotFolder, changeRequest: 7 })).toEqual({
			sent: new Set([lineHashOf('x'), lineHashOf('y')]),
		})
	})

	it('no record → no set', () => {
		expect(readSentBody({ lotFolder: lotFolderOf(), changeRequest: 7 })).toEqual({
			sent: undefined,
		})
	})
})
