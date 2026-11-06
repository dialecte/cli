/** The help the cli prints, rendered from the declared command map. */
import {
	COMMAND_FAMILIES,
	COMMAND_MAP,
	FAMILY_COLUMN_WIDTH,
	FAMILY_COMMAND_SEPARATOR,
	GLOBAL_HELP_FOOTER,
	GLOBAL_HELP_NOTES,
	GLOBAL_HELP_TITLE,
	NOTE_VERB_PATTERN,
	NOTE_WIDTH,
	SECTION_HEADINGS,
	SECTION_INDENT,
	USAGE_PREFIX,
} from './command-map.constants.ts'

import type { CommandEntry, HelpJson, RenamedEntry } from './command-map.types.ts'

/** The global help: the title, one line per family, the footer lines and the notes of every command. */
export function renderGlobalHelp(): string {
	const listed = listedCommands()
	const familyLines = COMMAND_FAMILIES.map((family) =>
		[
			family.padEnd(FAMILY_COLUMN_WIDTH),
			listed
				.filter((command) => command.entry.family === family)
				.map((command) => command.name)
				.join(FAMILY_COMMAND_SEPARATOR),
		].join(''),
	)
	return [
		GLOBAL_HELP_TITLE,
		'',
		...familyLines,
		'',
		...GLOBAL_HELP_FOOTER,
		'',
		...GLOBAL_HELP_NOTES,
	].join('\n')
}

/** One command's section: summary, usage lines, exit codes when they differ, example. */
export function renderCommandSection(params: { name: string; entry: CommandEntry }): string {
	const { name, entry } = params
	const notes = entry.notes ?? []
	return [
		`${name} - ${entry.summary}`,
		'',
		...entry.usage.map((line) => `${SECTION_INDENT}${line}`),
		...(notes.length ? ['', ...notes.flatMap((note) => wrapNote(note))] : []),
		'',
		...(entry.exitCodes.length
			? [SECTION_HEADINGS.exitCodes, ...entry.exitCodes.map((line) => `${SECTION_INDENT}${line}`)]
			: []),
		`${SECTION_HEADINGS.example} ${entry.example}`,
	].join('\n')
}

/** `dialecte --help --json`: every command with its family, summary, usage, exit codes and example. */
export function renderHelpJson(): string {
	const json: HelpJson = {
		commands: listedCommands().map((command) => ({ name: command.name, ...command.entry })),
	}
	return JSON.stringify(json, null, 2)
}

/** One command's entry as `dialecte <command> --help --json` prints it: the shape of `--help --json`. */
export function renderCommandJson(params: { name: string; entry: CommandEntry }): string {
	const json: HelpJson = { commands: [{ name: params.name, ...params.entry }] }
	return JSON.stringify(json, null, 2)
}

/** What `lot` answers to no verb or an unknown one: every usage line of the map's lot section, after `lot: `. */
export function renderLotUsage(): string {
	const lotPrefix = `${USAGE_PREFIX}lot `
	return `lot: ${COMMAND_MAP.lot.usage.map((line) => line.replace(lotPrefix, '')).join(' | ')}`
}

/**
 * A note as the section prints it: indented, wrapped within the note width, each continuation line hanging
 * under the text after its `<verb> - ` (under the note's first word when it has none).
 */
function wrapNote(note: string): string[] {
	const hanging =
		SECTION_INDENT + ' '.repeat(note.match(NOTE_VERB_PATTERN)?.[0].length ?? SECTION_INDENT.length)
	const lines: string[] = []
	let line = SECTION_INDENT
	for (const word of note.split(' ')) {
		const empty = line === SECTION_INDENT || line === hanging
		if (!empty && line.length + 1 + word.length > NOTE_WIDTH) {
			lines.push(line)
			line = hanging
		}
		line = line === SECTION_INDENT || line === hanging ? `${line}${word}` : `${line} ${word}`
	}
	lines.push(line)
	return lines
}

/** The entry of a listed command, or undefined for a renamed or unknown name. */
export function listedEntryOf(name: string): CommandEntry | undefined {
	return listedCommands().find((command) => command.name === name)?.entry
}

/** The commands the help lists, in family order, each family in the map's order. */
function listedCommands(): Array<{ name: string; entry: CommandEntry }> {
	const listed = Object.entries(COMMAND_MAP)
		.filter((pair): pair is [string, CommandEntry] => isListed(pair[1]))
		.map(([name, entry]) => ({ name, entry }))
	return COMMAND_FAMILIES.flatMap((family) =>
		listed.filter((command) => command.entry.family === family),
	)
}

/** Whether an entry of the map is listed: it has a family; a renamed one has none. */
function isListed(entry: CommandEntry | RenamedEntry): entry is CommandEntry {
	return 'family' in entry
}
