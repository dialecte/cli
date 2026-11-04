/** What `dialecte doctor` prints: one line per finding; exit 1 when one of them is a warning or an error. */
import type { CommandOutput } from '../command-output.types.ts'
import type { DoctorLine } from './doctor.types.ts'

export function answerDoctor(params: {
	lines: readonly DoctorLine[]
	json: boolean
}): CommandOutput {
	const exitCode = params.lines.some((line) => line.status !== 'ok') ? 1 : 0
	if (params.json)
		return { output: `${JSON.stringify({ lines: params.lines }, null, '\t')}\n`, exitCode }
	return { output: params.lines.map(renderLine).join(''), exitCode }
}

/**
 * What a session start reads: nothing when every line is ok, else one line per warning or error with its fix. Always exit
 * 0, and `--json` is not offered: the output goes into the agent's context as text.
 */
export function answerDoctorBrief(lines: readonly DoctorLine[]): CommandOutput {
	return {
		output: lines
			.filter((line) => line.status !== 'ok')
			.map(renderLine)
			.join(''),
		exitCode: 0,
	}
}

function renderLine(line: DoctorLine): string {
	if (line.status === 'ok') return `✅ ${line.subject}  ${line.detail}\n`
	const fix = line.fix ? ` - fix: ${line.fix}` : ''
	return line.status === 'error'
		? `❌ ${line.subject}  ${line.detail}${fix}\n`
		: `⚠️  ${line.subject}  ${line.detail}${fix}\n`
}
