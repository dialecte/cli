/**
 * The renamed keys of the command map are the commands of `RENAMED_FORMS`, no more and no fewer: a form added to
 * the table without its key (or a key without a form) is caught here, whatever the type of the map says.
 */
import { COMMAND_MAP } from './command-map.constants.ts'
import { RENAMED_FORMS } from './renamed.constants.ts'

import { describe, expect, it } from 'vitest'

/** The keys of the map that carry only `renamedTo`, sorted. */
function renamedKeysOf(): string[] {
	return Object.entries(COMMAND_MAP)
		.filter(([, entry]) => 'renamedTo' in entry)
		.map(([key]) => key)
		.sort()
}

/** The commands the renamed forms name, each once, sorted. */
function renamedFormCommands(): string[] {
	return [...new Set(RENAMED_FORMS.map((form) => form.command))].sort()
}

/** What each renamed key of the map says it was renamed to, by key. */
function renamedToByKey(): Record<string, string> {
	return Object.fromEntries(
		Object.entries(COMMAND_MAP).flatMap(([key, entry]) =>
			'renamedTo' in entry ? [[key, entry.renamedTo]] : [],
		),
	)
}

describe('the command map, renamed keys', () => {
	it('the keys that carry renamedTo -> exactly the commands of the renamed forms', () => {
		expect(renamedKeysOf()).toEqual(renamedFormCommands())
	})

	it('each renamed key -> its renamedTo names the lot verb of every one of its renamed forms', () => {
		const renamedTo = renamedToByKey()

		expect(
			RENAMED_FORMS.map((form) => ({
				command: form.command,
				names: renamedTo[form.command]?.includes(`lot ${form.lotVerb}`),
			})),
		).toEqual(RENAMED_FORMS.map((form) => ({ command: form.command, names: true })))
	})
})
