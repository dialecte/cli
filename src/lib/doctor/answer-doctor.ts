/** What `dialecte doctor` prints: one line per finding; exit 1 when one of them is a warning. */
import type { CommandOutput } from '../command-output.types.ts'
import type { DoctorLine } from './doctor.types.ts'

export function answerDoctor(params: {
	lines: readonly DoctorLine[]
	json: boolean
}): CommandOutput {
	const exitCode = params.lines.some((line) => line.status === 'warning') ? 1 : 0
	if (params.json)
		return { output: `${JSON.stringify({ lines: params.lines }, null, '\t')}\n`, exitCode }
	return { output: params.lines.map(renderLine).join(''), exitCode }
}

/**
 * What a session start reads: nothing when every line is ok, else one line per warning with its fix. Always exit
 * 0, and `--json` is not offered: the output goes into the agent's context as text.
 */
export function answerDoctorBrief(lines: readonly DoctorLine[]): CommandOutput {
	return {
		output: lines
			.filter((line) => line.status === 'warning')
			.map(renderLine)
			.join(''),
		exitCode: 0,
	}
}

function renderLine(line: DoctorLine): string {
	return line.status === 'ok'
		? `✅ ${line.subject}  ${line.detail}\n`
		: `⚠️  ${line.subject}  ${line.detail}${line.fix ? ` - fix: ${line.fix}` : ''}\n`
}
