/** A station's name: a lowercase letter, then lowercase letters, digits and dashes. */
export const STATION_NAME_PATTERN = /^[a-z][a-z0-9-]*$/

/** The most characters a station's name holds. */
export const STATION_NAME_LIMIT = 60

/** The most characters a free word (`vendor`, `model`, `tier`, `effort`, `session`) holds. */
export const STATION_WORD_LIMIT = 80

/** The highest `step`, `round` or `attempt`; the lowest is 1. */
export const STATION_COUNT_MAX = 999

/** The most skills one event names, seen and asked together. */
export const STATION_SKILL_LIMIT = 50

/** The fields holding one line of free text, of any length. */
export const STATION_TEXT_FIELDS: readonly string[] = ['agent']

/** The fields holding a free word of at most `STATION_WORD_LIMIT` characters. */
export const STATION_WORD_FIELDS: readonly string[] = [
	'vendor',
	'model',
	'tier',
	'effort',
	'session',
]

/** The fields holding an integer 1-999. */
export const STATION_COUNT_FIELDS: readonly string[] = ['step', 'round', 'attempt']

/** The cost fields: only an end carries them; one of them makes an unpaired end a retry candidate. */
export const STATION_COST_FIELDS: readonly string[] = [
	'tokens',
	'money',
	'duration',
	'exit',
	'verdict',
	'suites',
]

/** The fields only a start carries. */
export const STATION_START_FIELDS: readonly string[] = ['executor']

/** Who runs a station (33 D20); `host` when not said. */
export const STATION_EXECUTORS: readonly string[] = ['host', 'command']

/** The executor of a start that names none. */
export const DEFAULT_EXECUTOR = 'host'

/** The fixed vocabulary of `verdict`. */
export const STATION_VERDICTS: readonly string[] = [
	'approve',
	'back',
	'fix-then-repass',
	'fixed',
	'disagreed',
	'answered',
	'failed',
	'limit',
]

/** A skill the agent read. */
export const SKILL_SEEN = 'seen'

/** A skill the brief asked for. */
export const SKILL_ASKED = 'asked'

/** How a skill was met: seen by the agent, or asked by the brief. */
export const SKILL_HOWS: readonly string[] = [SKILL_SEEN, SKILL_ASKED]

/** The parts of `tokens`, by the flag that gives each. */
export const TOKEN_FLAG_PARTS: Readonly<Record<string, string>> = {
	'tokens-in': 'input',
	'tokens-out': 'output',
	'tokens-cache-read': 'cacheRead',
	'tokens-cache-write': 'cacheWrite',
	'tokens-total': 'total',
}

/** The keys a `--from` skill entry may hold (`hash` is recomputed by the cli). */
export const FROM_SKILL_KEYS: readonly string[] = ['name', 'how', 'hash']

/** The keys of `money`. */
export const MONEY_KEYS: readonly string[] = ['amount', 'currency']

/** The keys a `--from` file may hold: the phase and the station event's host-given fields. */
export const FROM_KEYS: readonly string[] = [
	'phase',
	'run',
	'hostEvent',
	'station',
	...STATION_COUNT_FIELDS,
	...STATION_TEXT_FIELDS,
	...STATION_WORD_FIELDS,
	...STATION_START_FIELDS,
	'skills',
	...STATION_COST_FIELDS,
]

/** The flags of `lot station`, without the dashes. */
export const STATION_FLAGS: readonly string[] = ['json']

/** The value options of `lot station` read by `readArguments` (`--money` takes two words and is read apart). */
export const STATION_VALUE_OPTIONS: readonly string[] = [
	'from',
	'run',
	'event',
	...STATION_COUNT_FIELDS,
	...STATION_TEXT_FIELDS,
	...STATION_WORD_FIELDS,
	...STATION_START_FIELDS,
	...Object.keys(TOKEN_FLAG_PARTS),
	'duration',
	'exit',
	'verdict',
]

/** The options of `lot station` that may be given several times. */
export const STATION_REPEATABLE_OPTIONS: readonly string[] = ['skill', 'skill-asked', 'suite']

/** The option that takes two words: `--money <amount> <currency>`. */
export const MONEY_OPTION = '--money'

/** What starts an option: a currency beginning with it is a forgotten currency, not one. */
export const OPTION_PREFIX = '--'

/** A currency: one word, without white space. */
export const ONE_WORD_PATTERN = /^\S+$/

/** A decimal number as a flag gives it: digits, an optional fraction, an optional leading minus. */
export const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/

/** A suite as `--suite` gives it: `<name>=<runs>`. */
export const SUITE_SEPARATOR = '='
