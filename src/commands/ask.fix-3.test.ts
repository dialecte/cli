import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { STATE_ASKS_SEGMENTS } from '../../test/ask-command-workspace.constants.ts'
import {
	askedJson,
	askedWith,
	createAskCommandWorkspace,
	eventsPathIn,
	namesIn,
} from '../../test/ask-command-workspace.ts'
import { workspaceFactsFolder } from '../../test/ask-fix-1-fixtures.ts'
import { createCoreOnlyWorkspace } from '../../test/ask-fix-3-fixtures.ts'
import {
	CORE_CODE_QUESTION,
	CORE_ONLY_PACKAGE,
	CORE_ONLY_SEMANTIC_QUESTION,
	EMPTY_TAGS_REFUSAL_PART,
	FIRST_FACT_ID,
	UNBUILT_VERBS,
	UNBUILT_WORDS,
} from '../../test/ask-fix-3.constants.ts'
import { CORE_CATALOGUE_CODE } from '../../test/ask-fix-3.constants.ts'
import { readFactFile } from '../../test/fact-fixtures.ts'
import { STORE_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'

import { describe, expect, it } from 'vitest'

describe('ask: a folder where only core is installed', () => {
	it(
		'ask "what does <code> mean" --code <code> -> rung 2, exit 0, no readers route; the fact names @dialecte/core',
		async () => {
			const workspace = createCoreOnlyWorkspace()

			const json = await askedJson({
				workspace,
				argv: [CORE_CODE_QUESTION, '--code', CORE_CATALOGUE_CODE],
				exitCode: 0,
			})

			expect({
				rung: json.rung,
				state: json.state,
				source: json.source,
				package: readFactFile({
					folder: workspaceFactsFolder({ workspace }),
					id: FIRST_FACT_ID,
				}).sources[0]?.package,
			}).toEqual({ rung: 2, state: 'answered', source: null, package: CORE_ONLY_PACKAGE })
		},
		STORE_CASE_TIMEOUT,
	)

	it(
		'a semantic question -> never an empty refusal: it goes on to a route (exit 3), no "declares all of" line',
		async () => {
			const workspace = createCoreOnlyWorkspace()

			const answer = await askedWith({
				workspace,
				argv: [CORE_ONLY_SEMANTIC_QUESTION],
				exitCode: 3,
			})

			expect(answer.output).not.toContain(EMPTY_TAGS_REFUSAL_PART)
		},
		STORE_CASE_TIMEOUT,
	)
})

describe('ask: pack and answer are not built yet', () => {
	it.each(Object.entries(UNBUILT_VERBS))(
		'ask %s -> exit 2, one line saying the verb is not built yet, no ask folder and no event',
		async (_name, argv) => {
			const workspace = createAskCommandWorkspace()
			const asks = join(workspace.state, ...STATE_ASKS_SEGMENTS)

			const answer = await askedWith({ workspace, argv, exitCode: 2 })

			expect({
				message: answer.output.trim().split('\n').length,
				words: UNBUILT_WORDS.test(answer.output),
				asks: namesIn(asks),
				events: existsSync(eventsPathIn(join(workspace.state, 'dialecte'))),
			}).toEqual({ message: 1, words: true, asks: [], events: false })
		},
		STORE_CASE_TIMEOUT,
	)
})
