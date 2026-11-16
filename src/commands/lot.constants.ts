/**
 * The exits of the host verbs that print on standard error (33S section 6, the inbox's convention): a usage error
 * or a refusal (2), `answer`'s hook that threw after the answer was recorded (1), and `report`'s, `station`'s and
 * `export`'s failures (1: no such lot or feature, not recorded, not copied). Every other exit of these
 * verbs is an answer a host reads, printed on standard output; a lot verb not listed prints every non-zero exit on
 * standard error. `inbox` follows the same rule: its exit 1 (nothing waits) is an answer.
 */
export const HOST_VERB_ERROR_EXITS: Readonly<Record<string, readonly number[]>> = {
	inbox: [2],
	status: [2],
	wait: [2],
	answer: [1, 2],
	result: [2],
	stop: [2],
	report: [1, 2],
	station: [1, 2],
	export: [1, 2],
}

/** `lot accept|revised|gone --remove <entry>`: the option that drops an entry of the list instead of writing one. */
export const LOT_REMOVE_OPTION = '--remove'

/** The key naming an entry in each list `--remove` drops from: a case, a file, the case or files a move reached. */
export const LOT_REMOVE_KEYS = {
	accept: 'case',
	revised: 'case',
	gone: 'file',
	moved: 'to',
} as const

/** `lot moved` given a case and a file: both name cases or both name files; `{from}`, `{to}` quoted. */
export const LOT_MOVED_MIXED =
	'lot: moved takes two cases (<file>::<name>) or two files or globs, not {from} and {to}'

/** How many closest entries a `--remove` of an entry its list does not hold names. */
export const LOT_REMOVE_CLOSEST_LIMIT = 3

/** What `--remove` answers; `{path}` the lot file, `{list}` its list, `{entry}` the entry as given. */
export const LOT_REMOVE_LINES = {
	removed: 'lot: {path} written: removed {list} {entry}{reason}',
	reason: ' ({reason})',
	absent: 'lot: {list} holds no {entry}{closest}; nothing written',
	closest: ' (closest: {entries})',
} as const
