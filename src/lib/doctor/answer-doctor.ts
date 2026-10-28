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

function renderLine(line: DoctorLine): string {
	return line.status === 'ok'
		? `✅ ${line.subject}  ${line.detail}\n`
		: `⚠️  ${line.subject}  ${line.detail}${line.fix ? ` - fix: ${line.fix}` : ''}\n`
}
