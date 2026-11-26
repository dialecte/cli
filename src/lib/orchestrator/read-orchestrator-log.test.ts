import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { temporaryFolder } from '../../../test/scratch-repository.ts'
import { readOrchestratorLog } from './read-orchestrator-log.ts'

import { describe, expect, it } from 'vitest'

import type { ReadOrchestratorLogResult } from './orchestrator.types.ts'

describe('readOrchestratorLog', () => {
	const CASES: Record<string, () => void> = {
		'valid complete line and newline-terminated wrong-structure JSON -> one record and exactly one damaged count':
			() => {
				const path = join(temporaryFolder('dialecte-orchestrator-log-'), 'log.jsonl')
				const event = {
					schema: 1,
					id: 'event-a',
					at: '2026-11-26T09:00:00.000Z',
					kind: 'station',
					subject: 'lot-a',
					facts: { state: 'working' },
				} as const
				writeFileSync(path, `${JSON.stringify(event)}\n{"schema":1,"id":"event-b"}\n`)
				let result: ReadOrchestratorLogResult | undefined

				expect(() => {
					result = readOrchestratorLog({ path })
				}).not.toThrow()
				expect(result).toEqual({ records: [event], damaged: 1 })
			},
		'valid complete line with torn invalid tail -> complete records and exactly one damaged count':
			() => {
				const path = join(temporaryFolder('dialecte-orchestrator-log-'), 'log.jsonl')
				const event = {
					schema: 1,
					id: 'event-a',
					at: '2026-11-26T09:00:00.000Z',
					kind: 'station',
					subject: 'lot-a',
					facts: { state: 'working' },
				} as const
				writeFileSync(path, `${JSON.stringify(event)}\n{"schema":1,"id":"event-`)
				let result: ReadOrchestratorLogResult | undefined

				expect(() => {
					result = readOrchestratorLog({ path })
				}).not.toThrow()
				expect(result).toEqual({ records: [event], damaged: 1 })
			},
		'valid complete line with blank newline row -> complete records and exactly one damaged count':
			() => {
				const path = join(temporaryFolder('dialecte-orchestrator-log-'), 'log.jsonl')
				const event = {
					schema: 1,
					id: 'event-a',
					at: '2026-11-26T09:00:00.000Z',
					kind: 'station',
					subject: 'lot-a',
					facts: { state: 'working' },
				} as const
				writeFileSync(path, `${JSON.stringify(event)}\n\n`)
				let result: ReadOrchestratorLogResult | undefined

				expect(() => {
					result = readOrchestratorLog({ path })
				}).not.toThrow()
				expect(result).toEqual({ records: [event], damaged: 1 })
			},
		'directory at log path -> explicit EISDIR read failure instead of clean missing result': () => {
			const path = join(temporaryFolder('dialecte-orchestrator-log-'), 'log.jsonl')
			mkdirSync(path)
			let failure: unknown

			try {
				readOrchestratorLog({ path })
			} catch (error) {
				failure = error
			}

			expect(failure).toMatchObject({ code: 'EISDIR' })
		},
	}

	it.each(Object.entries(CASES))('%s', (_title, run) => run())
})
