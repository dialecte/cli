/**
 * The field rules of a station event (33L0 sections 3, 4 "Station events", 5, 6): the flags or a `--from` file read
 * into one checked request, every fault found at once. Reads the `--from` file only; no lot, no store.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { DISPLAY_ESCAPED_RANGES } from '../print/print.constants.ts'
import { readArguments } from '../review-rounds/round-arguments.ts'
import { REPORT_OWNER_LABELS } from './attribute-steps.constants.ts'
import {
	DECIMAL_PATTERN,
	DEFAULT_EXECUTOR,
	FROM_KEYS,
	FROM_SKILL_KEYS,
	MONEY_KEYS,
	MONEY_OPTION,
	ONE_WORD_PATTERN,
	OPTION_PREFIX,
	SKILL_HOWS,
	STATION_COST_FIELDS,
	STATION_COUNT_FIELDS,
	STATION_COUNT_MAX,
	STATION_EXECUTORS,
	STATION_FLAGS,
	STATION_NAME_LIMIT,
	STATION_NAME_PATTERN,
	STATION_REPEATABLE_OPTIONS,
	STATION_SKILL_LIMIT,
	STATION_START_FIELDS,
	STATION_TEXT_FIELDS,
	STATION_VALUE_OPTIONS,
	STATION_VERDICTS,
	STATION_WORD_FIELDS,
	STATION_WORD_LIMIT,
	SUITE_SEPARATOR,
	TOKEN_FLAG_PARTS,
} from './station-event.constants.ts'

import type { RoundArguments } from '../review-rounds/review-rounds.types.ts'
import type {
	NamedSkill,
	StationFaults,
	StationPhase,
	StationRequest,
	StationValues,
} from './station-event.types.ts'

/**
 * Reads the words after `lot station` (the lot, `start|end <station>` or `--from <file.json>`, the flags) into one
 * checked request, or every fault found at once.
 */
export function readStationRequest(params: {
	argv: string[]
	cwd: string
}): StationRequest | StationFaults {
	const money = takeMoney({ argv: params.argv })
	if (typeof money === 'string') return usageFault(money)
	const read = readArguments({
		argv: money.argv,
		valueOptions: STATION_VALUE_OPTIONS,
		flags: STATION_FLAGS,
		repeatable: STATION_REPEATABLE_OPTIONS,
	})
	if (typeof read === 'string') return usageFault(read)
	const [id, ...words] = read.words
	if (id === undefined) return usageFault('lot station takes a lot id: none given')
	const from = read.values.get('from')
	const source =
		from === undefined
			? valuesOfFlags({ read, words, money: money.money })
			: valuesOfFile({ read, words, money: money.money, file: resolve(params.cwd, from) })
	if ('usage' in source) return source
	const faults = [
		...source.faults,
		...(from === undefined ? [] : unknownKeyFaults({ values: source.values })),
		...valueFaults({ values: source.values }),
	]
	if (faults.length > 0) return { faults, usage: false }
	const { phase, run, hostEvent, ...rest } = source.values
	return {
		id,
		phase: phase as StationPhase,
		station: rest.station as string,
		...(run === undefined ? {} : { run: run as string }),
		hostEvent: (hostEvent as string | null | undefined) ?? null,
		fields: fieldsOf({ phase: phase as StationPhase, values: rest }),
		json: read.flags.has('json'),
	}
}

/** True when the text holds a character the display escapes (D4): a control, a line break, a direction mark. */
export function holdsEscapedCharacter(text: string): boolean {
	for (const character of text) {
		const code = character.codePointAt(0) ?? 0
		if (DISPLAY_ESCAPED_RANGES.some(([first, last]) => code >= first && code <= last)) return true
	}
	return false
}

/** A usage error: the words themselves are wrong. */
function usageFault(fault: string): StationFaults {
	return { faults: [fault], usage: true }
}

/** `--money <amount> <currency>` taken out of the words (the last one given wins), or why it cannot be. */
function takeMoney(params: {
	argv: string[]
}): { argv: string[]; money: [string, string] | undefined } | string {
	const argv: string[] = []
	let money: [string, string] | undefined
	for (let index = 0; index < params.argv.length; index++) {
		const word = params.argv[index]
		if (word === '--') {
			argv.push(...params.argv.slice(index))
			break
		}
		if (word !== MONEY_OPTION) {
			argv.push(word)
			continue
		}
		if (index + 2 >= params.argv.length) return `${MONEY_OPTION} needs <amount> <currency>`
		if (params.argv[index + 2].startsWith(OPTION_PREFIX))
			return `${MONEY_OPTION} needs <amount> <currency>: ${params.argv[index + 2]} is an option`
		money = [params.argv[index + 1], params.argv[index + 2]]
		index += 2
	}
	return { argv, money }
}

/** The values the flags give: `start|end <station>` and every option, numbers read from their words. */
function valuesOfFlags(params: {
	read: RoundArguments
	words: string[]
	money: [string, string] | undefined
}): { values: StationValues; faults: string[] } | StationFaults {
	const { read, words } = params
	if (words.length === 0)
		return usageFault('lot station needs start <station>, end <station> or --from <file.json>')
	const [phase, station, ...extra] = words
	if (phase !== 'start' && phase !== 'end')
		return usageFault(`lot station: ${phase} is neither start nor end`)
	if (station === undefined) return usageFault(`lot station ${phase} needs a station`)
	if (extra.length > 0)
		return usageFault(`lot station takes one station, not also ${extra.join(' ')}`)
	const values: StationValues = { phase, station }
	const faults: string[] = []
	for (const [name, value] of read.values) {
		if (name === 'event') values.hostEvent = value
		else if (name === 'run') values.run = value
		else if (Object.hasOwn(TOKEN_FLAG_PARTS, name)) continue
		else values[name] = isNumberField(name) ? numberOrText(value) : value
	}
	const tokens = tokensOfFlags({ read })
	if (tokens !== undefined) values.tokens = tokens
	if (params.money !== undefined)
		values.money = { amount: numberOrText(params.money[0]), currency: params.money[1] }
	const skills = skillsOfFlags({ read })
	if (skills.length > 0) values.skills = skills
	const suites = read.lists.get('suite')
	if (suites !== undefined) {
		const named = suitesOfFlags({ suites })
		values.suites = named.suites
		faults.push(...named.faults)
	}
	return { values, faults }
}

/** The values a `--from` file holds, or why it cannot be read; no other word or option beside it. */
function valuesOfFile(params: {
	read: RoundArguments
	words: string[]
	money: [string, string] | undefined
	file: string
}): { values: StationValues; faults: string[] } | StationFaults {
	const { read } = params
	const others = read.values.size > 1 || read.lists.size > 0 || params.money !== undefined
	if (params.words.length > 0 || others)
		return usageFault('lot station --from <file.json> takes no other word or option but --json')
	let text: string
	try {
		text = readFileSync(params.file, 'utf8')
	} catch (error) {
		return {
			faults: [`lot station: cannot read ${params.file}: ${(error as Error).message}`],
			usage: false,
		}
	}
	let parsed: unknown
	try {
		parsed = JSON.parse(text)
	} catch (error) {
		return {
			faults: [`lot station: ${params.file} is no JSON: ${(error as Error).message}`],
			usage: false,
		}
	}
	if (!isPlainObject(parsed))
		return {
			faults: [`lot station: ${params.file} holds no JSON object`],
			usage: false,
		}
	return { values: parsed, faults: [] }
}

/** The keys of a `--from` file that are no station field. */
function unknownKeyFaults(params: { values: StationValues }): string[] {
	return Object.keys(params.values)
		.filter((key) => !FROM_KEYS.includes(key))
		.map((key) => `unknown key ${shown(key)}`)
}

/** Every fault of the values, by the rules of spec section 4 and D4. */
function valueFaults(params: { values: StationValues }): string[] {
	const { values } = params
	const faults: string[] = []
	const phase = values.phase
	if (phase !== 'start' && phase !== 'end') faults.push(`phase ${shown(phase)}: start or end`)
	faults.push(...stationNameFaults({ station: values.station }))
	for (const name of STATION_COUNT_FIELDS)
		if (values[name] !== undefined && !isIntegerWithin({ value: values[name], min: 1 }))
			faults.push(`${name} ${shown(values[name])}: an integer 1-${STATION_COUNT_MAX}`)
	for (const name of STATION_TEXT_FIELDS)
		if (values[name] !== undefined) faults.push(...textFaults({ what: name, value: values[name] }))
	for (const name of STATION_WORD_FIELDS)
		if (values[name] !== undefined)
			faults.push(...textFaults({ what: name, value: values[name], limit: STATION_WORD_LIMIT }))
	if (values.hostEvent !== undefined && values.hostEvent !== null)
		faults.push(...textFaults({ what: 'event', value: values.hostEvent }))
	if (values.run !== undefined) faults.push(...textFaults({ what: 'run', value: values.run }))
	if (values.executor !== undefined && !STATION_EXECUTORS.includes(values.executor as string))
		faults.push(`executor ${shown(values.executor)}: ${STATION_EXECUTORS.join(' or ')}`)
	if (values.skills !== undefined) faults.push(...skillsFaults({ skills: values.skills }))
	faults.push(...costFaults({ values }))
	if (phase === 'start') {
		for (const name of [...STATION_COST_FIELDS, 'run'])
			if (values[name] !== undefined) faults.push(`${name}: an end field, not a start's`)
	}
	if (phase === 'end')
		for (const name of STATION_START_FIELDS)
			if (values[name] !== undefined) faults.push(`${name}: a start field, not an end's`)
	return faults
}

/** The faults of a station's name: `[a-z][a-z0-9-]*`, at most 60 characters, and none of the report's owner labels. */
function stationNameFaults(params: { station: unknown }): string[] {
	const { station } = params
	if (typeof station === 'string' && REPORT_OWNER_LABELS.includes(station))
		return [
			`station ${shown(station)}: a name the report gives steps (${REPORT_OWNER_LABELS.join(', ')}), not a station's`,
		]
	if (
		typeof station === 'string' &&
		STATION_NAME_PATTERN.test(station) &&
		station.length <= STATION_NAME_LIMIT
	)
		return []
	return [
		`station ${shown(station)}: a lowercase letter, then lowercase letters, digits and dashes, at most ${STATION_NAME_LIMIT}`,
	]
}

/** The faults of a text field: a string without escaped characters (D4), at most `limit` characters when given. */
function textFaults(params: { what: string; value: unknown; limit?: number }): string[] {
	const { what, value, limit } = params
	if (typeof value !== 'string') return [`${what} ${shown(value)}: a text`]
	if (holdsEscapedCharacter(value))
		return [`${what} ${shown(value)}: holds a control, line break or direction character`]
	if (limit !== undefined && value.length > limit)
		return [`${what} of ${value.length} characters: at most ${limit}`]
	return []
}

/** The faults of the skills: a list of at most 50 `{ name, how }`. */
function skillsFaults(params: { skills: unknown }): string[] {
	const { skills } = params
	if (!Array.isArray(skills)) return [`skills ${shown(skills)}: a list of { name, how }`]
	const faults: string[] =
		skills.length > STATION_SKILL_LIMIT
			? [`${skills.length} skills: at most ${STATION_SKILL_LIMIT}`]
			: []
	for (const skill of skills) {
		if (!isPlainObject(skill)) {
			faults.push(`skill ${shown(skill)}: { name, how }`)
			continue
		}
		for (const key of Object.keys(skill))
			if (!FROM_SKILL_KEYS.includes(key)) faults.push(`skill: unknown key ${shown(key)}`)
		faults.push(...textFaults({ what: 'skill', value: skill.name }))
		if (skill.name === '') faults.push('skill: an empty name')
		if (!SKILL_HOWS.includes(skill.how as string))
			faults.push(`skill how ${shown(skill.how)}: ${SKILL_HOWS.join(' or ')}`)
	}
	return faults
}

/** The faults of the cost fields: tokens, money, duration, exit, verdict, suites. */
function costFaults(params: { values: StationValues }): string[] {
	const { tokens, money, duration, exit, verdict, suites } = params.values
	const faults: string[] = []
	if (tokens !== undefined) faults.push(...tokensFaults({ tokens }))
	if (money !== undefined) faults.push(...moneyFaults({ money }))
	if (duration !== undefined && !isNonNegativeNumber(duration))
		faults.push(`duration ${shown(duration)}: a non-negative number of seconds`)
	if (exit !== undefined && !Number.isInteger(exit)) faults.push(`exit ${shown(exit)}: an integer`)
	if (verdict !== undefined && !STATION_VERDICTS.includes(verdict as string))
		faults.push(`verdict ${shown(verdict)}: one of ${STATION_VERDICTS.join(', ')}`)
	if (suites !== undefined) faults.push(...suitesFaults({ suites }))
	return faults
}

/** The faults of `tokens`: its parts only, each a non-negative integer or null. */
function tokensFaults(params: { tokens: unknown }): string[] {
	const { tokens } = params
	if (!isPlainObject(tokens)) return [`tokens ${shown(tokens)}: an object of token counts`]
	const parts = Object.values(TOKEN_FLAG_PARTS)
	const faults: string[] = []
	for (const [part, value] of Object.entries(tokens)) {
		if (!parts.includes(part)) faults.push(`tokens: unknown part ${shown(part)}`)
		else if (value !== null && !isIntegerWithin({ value, min: 0, max: Infinity }))
			faults.push(`tokens ${part} ${shown(value)}: a non-negative integer`)
	}
	return faults
}

/** The faults of `money`: a non-negative amount and a currency of one word (D4). */
function moneyFaults(params: { money: unknown }): string[] {
	const { money } = params
	if (!isPlainObject(money)) return [`money ${shown(money)}: { amount, currency }`]
	const faults: string[] = []
	for (const key of Object.keys(money))
		if (!MONEY_KEYS.includes(key)) faults.push(`money: unknown key ${shown(key)}`)
	if (!isNonNegativeNumber(money.amount))
		faults.push(`money amount ${shown(money.amount)}: a non-negative number`)
	faults.push(...textFaults({ what: 'currency', value: money.currency }))
	if (typeof money.currency === 'string' && !ONE_WORD_PATTERN.test(money.currency))
		faults.push(`currency ${shown(money.currency)}: one word`)
	return faults
}

/** The faults of `suites`: each name a text (D4), each run count a non-negative integer. */
function suitesFaults(params: { suites: unknown }): string[] {
	const { suites } = params
	if (!isPlainObject(suites)) return [`suites ${shown(suites)}: { "<name>": <runs> }`]
	const faults: string[] = []
	for (const [name, runs] of Object.entries(suites)) {
		faults.push(...textFaults({ what: 'suite', value: name }))
		if (name === '') faults.push('suite: an empty name')
		if (!isIntegerWithin({ value: runs, min: 0, max: Infinity }))
			faults.push(`suite ${shown(name)} runs ${shown(runs)}: a non-negative integer`)
	}
	return faults
}

/** The station fields as written: `station` first, then the others in the order of the rules; tokens whole. */
function fieldsOf(params: { phase: StationPhase; values: StationValues }): Record<string, unknown> {
	const { values } = params
	const fields: Record<string, unknown> = {}
	for (const key of FROM_KEYS) {
		if (values[key] === undefined) continue
		fields[key] = key === 'skills' ? namedSkillsOf(values.skills as NamedSkill[]) : values[key]
	}
	if (params.phase === 'start' && fields.executor === undefined) fields.executor = DEFAULT_EXECUTOR
	if (fields.tokens !== undefined) fields.tokens = wholeTokensOf(fields.tokens as StationValues)
	return fields
}

/** Every token part, a missing one null (rule 3: unknown, never 0). */
function wholeTokensOf(tokens: StationValues): Record<string, unknown> {
	const whole: Record<string, unknown> = {}
	for (const part of Object.values(TOKEN_FLAG_PARTS)) whole[part] = tokens[part] ?? null
	return whole
}

/** The skills reduced to their name and how (a hash given in a file is read again by the cli). */
function namedSkillsOf(skills: NamedSkill[]): NamedSkill[] {
	return skills.map(function nameAndHow(skill) {
		return { name: skill.name, how: skill.how }
	})
}

/** `tokens` from the token flags, undefined when none is given. */
function tokensOfFlags(params: { read: RoundArguments }): StationValues | undefined {
	let tokens: StationValues | undefined
	for (const [flag, part] of Object.entries(TOKEN_FLAG_PARTS)) {
		const value = params.read.values.get(flag)
		if (value === undefined) continue
		tokens ??= {}
		tokens[part] = numberOrText(value)
	}
	return tokens
}

/** The skills of `--skill` (seen) then `--skill-asked` (asked), each in the order given. */
function skillsOfFlags(params: { read: RoundArguments }): NamedSkill[] {
	const [seen, asked] = SKILL_HOWS
	return [
		...(params.read.lists.get('skill') ?? []).map((name) => ({ name, how: seen })),
		...(params.read.lists.get('skill-asked') ?? []).map((name) => ({ name, how: asked })),
	]
}

/** The suites of `--suite <name>=<runs>`, and a fault for a word without `=`. */
function suitesOfFlags(params: { suites: string[] }): {
	suites: StationValues
	faults: string[]
} {
	const suites: StationValues = {}
	const faults: string[] = []
	for (const word of params.suites) {
		const at = word.lastIndexOf(SUITE_SEPARATOR)
		if (at === -1) {
			faults.push(`suite ${shown(word)}: <name>=<runs>`)
			continue
		}
		suites[word.slice(0, at)] = numberOrText(word.slice(at + 1))
	}
	return { suites, faults }
}

/** True for a field a flag gives as a number. */
function isNumberField(name: string): boolean {
	return STATION_COUNT_FIELDS.includes(name) || name === 'duration' || name === 'exit'
}

/** A flag's word as a number when it is a decimal, else as it is (the rules then refuse it, naming it). */
function numberOrText(word: string): number | string {
	return DECIMAL_PATTERN.test(word) ? Number(word) : word
}

/** True for an integer from `min` to `max` (999 unless said). */
function isIntegerWithin(params: { value: unknown; min: number; max?: number }): boolean {
	const { value, min, max = STATION_COUNT_MAX } = params
	return Number.isInteger(value) && (value as number) >= min && (value as number) <= max
}

/** True for a finite number of zero or more. */
function isNonNegativeNumber(value: unknown): boolean {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

/** True for an object that is no list and not null. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** A value as a fault names it: a text as written (the print boundary escapes it), anything else as JSON. */
function shown(value: unknown): string {
	return typeof value === 'string' ? value : String(JSON.stringify(value))
}
