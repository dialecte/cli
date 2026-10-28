/** What `dialecte members <expression>` prints: the members one step below, or the closest ones one level up. */
import { closestNames } from '../closest-names.ts'
import { MEMBER_SUGGESTION_LIMIT } from './api-json.constants.ts'
import { listMembers } from './list-members.ts'
import { shortSummary } from './short-summary.ts'

import type { CommandOutput } from '../command-output.types.ts'
import type { MethodEntry } from '../discover.types.ts'
import type { Member } from './api-json.types.ts'

export function answerMembers(params: {
	entries: readonly MethodEntry[]
	expression: string
	json: boolean
}): CommandOutput {
	const { expression } = params
	const members = listMembers(params)
	if (params.json)
		return {
			output: `${JSON.stringify({ expression, members }, null, '\t')}\n`,
			exitCode: members.length ? 0 : 1,
		}
	if (members.length)
		return { output: `${[expression, ...members.map(memberLine)].join('\n')}\n`, exitCode: 0 }

	const parent = expression.slice(0, Math.max(0, expression.lastIndexOf('.')))
	const neighbours = parent
		? listMembers({ entries: params.entries, expression: parent }).map((member) => member.name)
		: []
	const closest = closestNames({
		name: expression.slice(expression.lastIndexOf('.') + 1),
		candidates: neighbours,
		limit: MEMBER_SUGGESTION_LIMIT,
	})
	const hint = parent
		? ` - under ${parent}: ${(closest.length ? closest : neighbours).join(', ') || 'nothing'}`
		: ''
	return { output: `nothing at ${expression}${hint}\n`, exitCode: 1 }
}

function memberLine(member: Member): string {
	if (member.kind === 'group')
		return `  ${member.name}.  ${member.methodCount} method${member.methodCount === 1 ? '' : 's'}`
	return member.summary
		? `  ${member.name}()  ${shortSummary(member.summary)}`
		: `  ${member.name}()`
}
