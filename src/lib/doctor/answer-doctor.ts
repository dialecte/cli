/** What `dialecte doctor` prints: one line per finding; exit 1 when one of them is a warning or an error. */
import { endedOf, jsonOf, textOf } from '../print/print.ts'

import type { LookupCommandOutput } from '../command-output.types.ts'
import type { DoctorLine } from './doctor.types.ts'

export function answerDoctor(params: {
	lines: readonly DoctorLine[]
	json: boolean
}): LookupCommandOutput {
	const exitCode = params.lines.some((line) => line.status !== 'ok') ? 1 : 0
	if (params.json) return { output: endedOf(jsonOf({ lines: params.lines }, '\t')), exitCode }
	return { output: endedTextOf(params.lines.map(renderLine)), exitCode }
}

/**
 * What a session start reads: nothing when every line is ok, else one line per warning or error with its fix. Always exit
 * 0, and `--json` is not offered: the output goes into the agent's context as text.
 */
export function answerDoctorBrief(lines: readonly DoctorLine[]): LookupCommandOutput {
	return {
		output: endedTextOf(lines.filter((line) => line.status !== 'ok').map(renderLine)),
		exitCode: 0,
	}
}

/** The lines, each ended by a line feed; no line at all is the empty text. */
function endedTextOf(lines: readonly string[]): LookupCommandOutput['output'] {
	return textOf(lines.length === 0 ? [] : [...lines, ''])
}

function renderLine(line: DoctorLine): string {
	if (line.status === 'ok') return `✅ ${line.subject}  ${line.detail}`
	const fix = line.fix ? ` - fix: ${line.fix}` : ''
	return line.status === 'error'
		? `❌ ${line.subject}  ${line.detail}${fix}`
		: `⚠️  ${line.subject}  ${line.detail}${fix}`
}
