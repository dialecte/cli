import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { readOrchestratorLog } from './read-orchestrator-log.ts'

import { describe, expect, it } from 'vitest'

const EVENT = {
	schema: 1,
	id: 'event-a',
	at: '2026-11-26T09:00:00.000Z',
	kind: 'station',
	subject: 'lot-a',
	facts: { state: 'working' },
} as const

const LATER_EVENT = {
	schema: 1,
	id: 'event-b',
	at: '2026-11-26T09:01:00.000Z',
	kind: 'station',
	subject: 'lot-b',
	facts: { state: 'ready' },
} as const

/** The reading of a log holding `text` (no file when undefined), or what the reader threw. */
function readingOf(params: { text: string | undefined }): unknown {
	const path = join(temporaryFolder('dialecte-orchestrator-log-'), 'log.jsonl')
	if (params.text !== undefined) writeFileSync(path, params.text)
	try {
		return readOrchestratorLog({ path })
	} catch (error) {
		return { thrown: error instanceof Error ? error.message : String(error) }
	}
}

describe('readOrchestratorLog', function readorchestratorlog() {
	const CASES: Record<string, { text: string | undefined; expected: unknown }> = {
		'no log file -> no record, nothing damaged, nothing skipped': {
			text: undefined,
			expected: { records: [], damaged: 0, skipped: 0 },
		},
		'a valid line then a torn tail without its newline -> the record, one damaged, nothing skipped':
			{
				text: `${JSON.stringify(EVENT)}\n{"schema":1,"id":"event-`,
				expected: { records: [EVENT], damaged: 1, skipped: 0 },
			},
		'a valid line then a complete JSON line that is not a valid event -> the record, one damaged': {
			text: `${JSON.stringify(EVENT)}\n{"schema":1,"id":"event-b"}\n`,
			expected: { records: [EVENT], damaged: 1, skipped: 0 },
		},
		'a sealed torn line (complete, not JSON) between two valid lines -> both records, one skipped, nothing damaged':
			{
				text: `${JSON.stringify(EVENT)}\n{"schema":1,"id":"event-\n${JSON.stringify(LATER_EVENT)}\n`,
				expected: { records: [EVENT, LATER_EVENT], damaged: 0, skipped: 1 },
			},
		'a valid line then an empty line -> the record, one skipped, nothing damaged': {
			text: `${JSON.stringify(EVENT)}\n\n`,
			expected: { records: [EVENT], damaged: 0, skipped: 1 },
		},
		'a whole valid event as the last line without its newline -> damage while it is the tail, no record':
			{
				text: `${JSON.stringify(EVENT)}\n${JSON.stringify(LATER_EVENT)}`,
				expected: { records: [EVENT], damaged: 1, skipped: 0 },
			},
		'complete JSON lines that are not objects (null, [], 7) -> three damaged, no throw, nothing skipped':
			{
				text: `null\n[]\n7\n${JSON.stringify(EVENT)}\n`,
				expected: { records: [EVENT], damaged: 3, skipped: 0 },
			},
		'the same event twice -> two records, nothing damaged, nothing skipped': {
			text: `${JSON.stringify(EVENT)}\n${JSON.stringify(EVENT)}\n`,
			expected: { records: [EVENT, EVENT], damaged: 0, skipped: 0 },
		},
	}

	it.each(Object.entries(CASES))('%s', function checksCase(_title, testCase) {
		expect(readingOf({ text: testCase.text })).toEqual(testCase.expected)
	})

	it('directory at log path -> explicit EISDIR read failure instead of clean missing result', function directoryAtLogPathExplicit() {
		const path = join(temporaryFolder('dialecte-orchestrator-log-'), 'log.jsonl')
		mkdirSync(path)
		let failure: unknown

		try {
			readOrchestratorLog({ path })
		} catch (error) {
			failure = error
		}

		expect(failure).toMatchObject({ code: 'EISDIR' })
	})
})
