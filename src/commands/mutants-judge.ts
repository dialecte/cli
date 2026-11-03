/** `dialecte mutants judge [--file <f>] [--json]`: the packets of the package's pending survivors, to judge them. */
import { judgePackets, renderPacket } from '../lib/mutation/judge-packet.ts'
import { JUDGE_OPTIONS, LEADING_DOT_SLASH } from '../lib/mutation/mutation-agent.constants.ts'
import { packageNameOf } from '../lib/mutation/run-store.ts'
import { readArguments } from '../lib/review-rounds/round-arguments.ts'
import { answered, asksJson, optionWordsOf, usageResult } from './mutants-output.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { OwnerCheck } from '../lib/mutation/mutation.types.ts'

/** Prints every packet of the package's `new` survivors (or of one file's), as text or one JSON object. */
export function judgeVerb(params: { root: string; argv: string[] } & OwnerCheck): CommandResult {
	const { root, argv } = params
	const json = asksJson(argv)
	const read = readArguments({
		argv,
		valueOptions: JUDGE_OPTIONS.values,
		flags: JUDGE_OPTIONS.flags,
	})
	if (typeof read === 'string' || read.words.length > 0)
		return usageResult({ verb: 'judge', json, read })
	const given = read.values.get('file')
	if (given !== undefined && optionWordsOf(JUDGE_OPTIONS).includes(given))
		return usageResult({
			verb: 'judge',
			json,
			read: `--file needs a file, not the option ${given}`,
		})
	const file = given?.replace(LEADING_DOT_SLASH, '')
	const packageName = packageNameOf(root)
	const packets = judgePackets({ root, ...(file === undefined ? {} : { file }) })
	const text =
		packets.length > 0
			? packets.map((packet) => renderPacket({ packet })).join('\n\n')
			: `mutants judge: nothing pending ${file === undefined ? `for ${packageName}` : `in ${file}`}`
	return answered({ verb: 'judge', json, text, fields: { package: packageName, packets } })
}
