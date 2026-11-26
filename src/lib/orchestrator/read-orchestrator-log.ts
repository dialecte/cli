import { readFileSync } from 'node:fs'

import { isMapping } from '../config/config-checks.ts'

import type { ReadOrchestratorLogParams, ReadOrchestratorLogResult } from './orchestrator.types.ts'
import type { OrchestratorEvent } from './orchestrator.types.ts'

export function readOrchestratorLog(params: ReadOrchestratorLogParams): ReadOrchestratorLogResult {
	const text = readLog(params)
	if (text === undefined) return { records: [], damaged: 0 }
	const lines = text.split('\n')
	const torn = lines.pop()
	const records: OrchestratorEvent[] = []
	let damaged = torn === undefined || torn === '' ? 0 : 1
	for (const line of lines) {
		if (line === '') {
			damaged += 1
			continue
		}
		const event = parseEvent(line)
		if (event === undefined) damaged += 1
		else records.push(event)
	}
	return { records, damaged }
}

function readLog(params: ReadOrchestratorLogParams): string | undefined {
	try {
		return readFileSync(params.path, 'utf8')
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
		throw error
	}
}

function parseEvent(line: string): OrchestratorEvent | undefined {
	let value: unknown
	try {
		value = JSON.parse(line)
	} catch {
		return undefined
	}
	if (!isMapping(value)) return undefined
	const allowed = ['schema', 'id', 'at', 'kind', 'subject', 'facts']
	if (Object.keys(value).some((field) => !allowed.includes(field))) return undefined
	if (
		value.schema !== 1 ||
		typeof value.id !== 'string' ||
		typeof value.at !== 'string' ||
		typeof value.kind !== 'string' ||
		typeof value.subject !== 'string' ||
		!isMapping(value.facts)
	)
		return undefined
	return {
		schema: 1,
		id: value.id,
		at: value.at,
		kind: value.kind,
		subject: value.subject,
		facts: { ...value.facts },
	}
}
