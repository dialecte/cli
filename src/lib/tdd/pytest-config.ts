/**
 * What a pytest configuration file says of test discovery, read from its text as pytest 8 and 9 read it:
 * - `pytest.toml` / `.pytest.toml`: the `[pytest]` table, a configuration even when empty or absent;
 * - `pytest.ini` / `.pytest.ini`: the `[pytest]` section, a configuration even when absent;
 * - `pyproject.toml`: the native `[tool.pytest]` table, else `[tool.pytest.ini_options]`; neither: none;
 * - `tox.ini`: the `[pytest]` section; `setup.cfg`: the `[tool:pytest]` section; absent: none.
 * An ini file is read as pytest's ini reader reads it: `key = value` or `key: value`, a value continued on indented
 * lines, a line starting with `#` or `;` skipped, a `#` after a value kept. A setting written as a string is split
 * as a shell splits a line (`shlex.split`), a TOML array taken as it is. The settings read are `python_files`,
 * `testpaths` and `norecursedirs`; pytest's defaults stand for the ones the file does not declare.
 */
import { readToml } from './read-toml.ts'
import { shellWords } from './shell-words.ts'
import {
	ALWAYS_PYTEST_CONFIG_FILES,
	DEFAULT_NORECURSEDIRS,
	DEFAULT_PYTHON_FILES,
	INI_COMMENT_CHARACTERS,
	PYPROJECT_FILE,
	PYPROJECT_INI_OPTIONS_TABLE,
	PYPROJECT_PYTEST_TABLE,
	PYTEST_CFG_SECTION,
	PYTEST_DISCOVERY_KEYS,
	PYTEST_INI_SECTION,
	PYTEST_TOML_TABLE,
} from './tdd.constants.ts'

import type { IniSections, PytestConfig, PytestSetting, TomlDocument } from './tdd.types.ts'

/** The discovery settings the file holds; undefined when the file is no pytest configuration. */
export function readPytestConfig(params: { name: string; text: string }): PytestConfig | undefined {
	const settings = settingsOf(params)
	if (settings === undefined) return undefined
	return {
		pythonFiles: wordsOf(settings.get(PYTEST_DISCOVERY_KEYS.pythonFiles)) ?? [
			...DEFAULT_PYTHON_FILES,
		],
		testpaths: wordsOf(settings.get(PYTEST_DISCOVERY_KEYS.testpaths)) ?? [],
		norecursedirs: wordsOf(settings.get(PYTEST_DISCOVERY_KEYS.norecursedirs)) ?? [
			...DEFAULT_NORECURSEDIRS,
		],
	}
}

/** The pytest settings of the file by key, as written; undefined when the file configures no pytest. */
function settingsOf(params: {
	name: string
	text: string
}): Map<string, PytestSetting> | undefined {
	const { name, text } = params
	if (name.endsWith('.toml')) {
		const document = readToml(text)
		if (name !== PYPROJECT_FILE) return tableSettings({ document, table: PYTEST_TOML_TABLE })
		return pyprojectSettings(document)
	}
	if (name.endsWith('.ini')) {
		const section = readIni(text).get(PYTEST_INI_SECTION)
		if (section) return section
		return ALWAYS_PYTEST_CONFIG_FILES.includes(name) ? new Map() : undefined
	}
	if (name.endsWith('.cfg')) return readIni(text).get(PYTEST_CFG_SECTION)
	return undefined
}

/** A pyproject's settings: its native `[tool.pytest]` table when it holds any, else `[tool.pytest.ini_options]`. */
function pyprojectSettings(document: TomlDocument): Map<string, PytestSetting> | undefined {
	const native = tableSettings({ document, table: PYPROJECT_PYTEST_TABLE })
	// the native table holds settings of its own (its `ini_options` subtable left aside)
	const nativeSubtables = [...document.tables].filter(
		(table) =>
			table.startsWith(`${PYPROJECT_PYTEST_TABLE}.`) &&
			!`${table}.`.startsWith(`${PYPROJECT_INI_OPTIONS_TABLE}.`),
	)
	if (native.size > 0 || nativeSubtables.length > 0) return native
	if (document.tables.has(PYPROJECT_INI_OPTIONS_TABLE))
		return tableSettings({ document, table: PYPROJECT_INI_OPTIONS_TABLE })
	return undefined
}

/** The string and string-list values set directly in one table of the document, by their keys. */
function tableSettings(params: {
	document: TomlDocument
	table: string
}): Map<string, PytestSetting> {
	const settings = new Map<string, PytestSetting>()
	const prefix = `${params.table}.`
	for (const [path, value] of params.document.values) {
		const key = path.slice(prefix.length)
		if (!path.startsWith(prefix) || key.includes('.')) continue
		if (typeof value === 'string') settings.set(key, value)
		else if (Array.isArray(value))
			settings.set(
				key,
				value.filter((item): item is string => typeof item === 'string'),
			)
	}
	return settings
}

/** A setting's words: a string split as a shell line, a list as it is; undefined when not declared. */
function wordsOf(setting: PytestSetting | undefined): string[] | undefined {
	if (setting === undefined) return undefined
	return typeof setting === 'string' ? shellWords(setting) : [...setting]
}

/** The sections of an ini text as pytest's ini reader makes them (inline comments kept in values). */
function readIni(text: string): IniSections {
	const sections: IniSections = new Map()
	let section: Map<string, string> | undefined
	let key: string | undefined
	for (const rawLine of text.split(/\r?\n/)) {
		if (INI_COMMENT_CHARACTERS.includes(rawLine.trimStart().slice(0, 1))) continue
		const line = rawLine.trimEnd()
		if (line === '') continue
		if (line.startsWith('[')) {
			const header = stripIniComment(line)
			if (header.endsWith(']')) {
				const name = header.slice(1, -1)
				section = sections.get(name) ?? new Map()
				sections.set(name, section)
				key = undefined
			}
			continue
		}
		if (/^\s/.test(line)) {
			// a continuation of the value above
			if (section && key !== undefined) {
				const before = section.get(key) ?? ''
				const more = line.trim()
				section.set(key, before ? `${before}\n${more}` : more)
			}
			continue
		}
		const equals = line.indexOf('=')
		const colon = line.indexOf(':')
		const separator =
			equals >= 0 && (colon < 0 || colon > equals) ? equals : colon >= 0 ? colon : -1
		if (separator < 0 || !section) continue
		key = line.slice(0, separator).trim()
		section.set(key, line.slice(separator + 1).trim())
	}
	return sections
}

/** A section header line without what follows a comment character. */
function stripIniComment(line: string): string {
	let kept = line
	for (const character of INI_COMMENT_CHARACTERS) kept = (kept.split(character)[0] ?? '').trimEnd()
	return kept
}
