/**
 * `dialecte mutants record (--key <k>... | --file <f>) --family <family> --reason <text> [--removable] [--json]`:
 * the committed record of each survivor named, then its ledger item moved to `recorded`.
 */
import {
	OPTION_PREFIX,
	RECORD_KEY_OPTION,
	RECORD_OPTIONS,
} from '../lib/mutation/mutation-agent.constants.ts'
import { MUTATION_RECORDS_PATH } from '../lib/mutation/mutation.constants.ts'
import { recordKeys } from '../lib/mutation/records-write.ts'
import { answered, asksJson, optionWordsOf, refused, usageResult } from './mutants-output.ts'

import type { CommandResult } from '../lib/command-result.types.ts'
import type { RecordArguments, RecordedItem } from '../lib/mutation/mutation-agent.types.ts'
import type { MutationFamily, OwnerCheck } from '../lib/mutation/mutation.types.ts'

/** Records the survivors named by key or file under one family and reason. */
export function recordVerb(params: { root: string; argv: string[] } & OwnerCheck): CommandResult {
	const { root, argv } = params
	const json = asksJson(argv)
	const read = readRecordArguments(argv)
	if (typeof read === 'string') return usageResult({ verb: 'record', json, read })
	const { keys, values, flags } = read
	const file = values.get('file')
	const family = values.get('family')
	const reason = values.get('reason')
	const removable = flags.has('removable')
	if (keys.length > 0 === (file !== undefined) || family === undefined || reason === undefined)
		return usageResult({ verb: 'record', json })
	const result = recordKeys({
		root,
		...(file === undefined ? { keys } : { file }),
		// checked by recordKeys: an unknown family is refused, naming the families
		family: family as MutationFamily,
		reason,
		removable,
	})
	if (!result.ok) return refused({ verb: 'record', json, reason: result.reason })
	const count = result.items.length
	const lines = [
		`mutants record: ${count} survivor${count === 1 ? '' : 's'} recorded as ${result.family} in ${MUTATION_RECORDS_PATH}`,
		...result.items.map(renderItem),
	]
	return answered({
		verb: 'record',
		json,
		lines,
		fields: { family: result.family, path: MUTATION_RECORDS_PATH, items: result.items },
	})
}

/**
 * The words of `record`, walked once by `RECORD_OPTIONS`: `--key` takes every word after it up to the next option
 * (and repeats); the other value options take the next word unless it is one of the verb's option words; the flags
 * take none (`--json` is read by `asksJson`). Answers why the words are refused: an unknown option, a value option
 * without its value or given an option word, a word no `--key` takes.
 */
function readRecordArguments(argv: readonly string[]): RecordArguments | string {
	const read: RecordArguments = { keys: [], values: new Map(), flags: new Set() }
	const optionWords = optionWordsOf(RECORD_OPTIONS)
	let takingKeys = false
	for (let index = 0; index < argv.length; index++) {
		const word = argv[index]
		if (!word.startsWith(OPTION_PREFIX)) {
			if (!takingKeys) return `unexpected word ${word}`
			read.keys.push(word)
			continue
		}
		takingKeys = false
		const name = word.slice(OPTION_PREFIX.length)
		const next = argv[index + 1]
		if (RECORD_OPTIONS.flags.includes(name)) read.flags.add(name)
		else if (!RECORD_OPTIONS.values.includes(name)) return `unknown option ${word}`
		else if (name === RECORD_KEY_OPTION) {
			if (next === undefined || next.startsWith(OPTION_PREFIX)) return `${word} needs a value`
			takingKeys = true
		} else {
			if (next === undefined) return `${word} needs a value`
			if (optionWords.includes(next)) return `${word} needs a value, not the option ${next}`
			read.values.set(name, next)
			index++
		}
	}
	return read
}

function renderItem(item: RecordedItem): string {
	const change = item.from === item.to ? `${item.from}, unchanged` : `${item.from} → ${item.to}`
	return `  ${item.key}  ${item.file}:${item.line}  ${change}`
}
