/** `lot accept|revised|gone --remove <entry>`: the option that drops an entry of the list instead of writing one. */
export const LOT_REMOVE_OPTION = '--remove'

/** The keys naming an entry in each list `--remove` drops from, in the order it takes them: a case, a file, a move's from and to. */
export const LOT_REMOVE_KEYS = {
	accept: ['case'],
	revised: ['case'],
	gone: ['file'],
	moved: ['from', 'to'],
} as const

/** `lot moved` given a case and a file: both name cases or both name files; `{from}`, `{to}` quoted. */
export const LOT_MOVED_MIXED =
	'lot: moved takes two cases (<file>::<name>) or a file and a file or glob, not {from} and {to}'

/** `lot moved` given a glob as the file the cases moved from; `{from}` quoted. */
export const LOT_MOVED_GLOB_FROM =
	'lot: moved takes the file the cases moved from, not a glob: {from}'

/** How many closest entries a `--remove` of an entry its list does not hold names. */
export const LOT_REMOVE_CLOSEST_LIMIT = 3

/** What `--remove` answers; `{path}` the lot file, `{list}` its list, `{entry}` the entry as given. */
export const LOT_REMOVE_LINES = {
	removed: 'lot: {path} written: removed {list} {entry}{reason}',
	reason: ' ({reason})',
	absent: 'lot: {list} holds no {entry}{closest}; nothing written',
	closest: ' (closest: {entries})',
} as const
