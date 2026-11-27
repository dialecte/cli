import { readFileSync } from 'node:fs'

import { OrchestratorFault } from './orchestrator-fault.ts'
import { parseOrchestratorEvent } from './parse-orchestrator-event.ts'

import type {
	OrchestratorEvent,
	ReadOrchestratorLogParams,
	ReadOrchestratorLogResult,
} from './orchestrator.types.ts'

/**
 * The valid records of `log.jsonl`, in order, duplicates kept, with two counts: `damaged` for a last line without its
 * newline (an append in flight or one that crashed) and for a complete JSON line that is not a valid event; `skipped`
 * for a complete line that is not JSON (the sealed remains of a torn append, or an empty line). No file is no record;
 * any other read failure is thrown.
 */
export function readOrchestratorLog(params: ReadOrchestratorLogParams): ReadOrchestratorLogResult {
	const text = readLog(params)
	if (text === undefined) return { records: [], damaged: 0, skipped: 0 }
	const lines = text.split('\n')
	const tail = lines.pop()
	const records: OrchestratorEvent[] = []
	let damaged = tail === undefined || tail === '' ? 0 : 1
	let skipped = 0
	for (const line of lines) {
		const reading = readLine({ line })
		if (reading === 'skipped') skipped += 1
		else if (reading === 'damaged') damaged += 1
		else records.push(reading)
	}
	return { records, damaged, skipped }
}

function readLog(params: ReadOrchestratorLogParams): string | undefined {
	try {
		return readFileSync(params.path, 'utf8')
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
		throw error
	}
}

/** The event of one complete line; `skipped` when it is not JSON, `damaged` when it is JSON but no valid event. */
function readLine(params: { line: string }): OrchestratorEvent | 'skipped' | 'damaged' {
	try {
		return parseOrchestratorEvent({ text: params.line })
	} catch (error) {
		if (!(error instanceof OrchestratorFault)) throw error
		return error.code === 'not-json' ? 'skipped' : 'damaged'
	}
}
