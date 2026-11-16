/**
 * Review round 1, R1-18 (D43 3): a person's cite into a file that changed since the ask does not lose the answer: the
 * person fact is recorded and `answer.json` keeps the refusal `file-changed` and no miss.
 */
import { join } from 'node:path'

import {
	askedOverClausesInRounds,
	citeArgvOf,
	factIdsIn,
	personAnsweredJson,
	readAnswerRecord,
	readFactIfAny,
} from '../../test/ask-answer-fixtures.ts'
import { workspaceFactsFolder } from '../../test/ask-fix-1-fixtures.ts'
import { MOVED_TAG_FILE } from '../../test/ask-review-1-fixtures.constants.ts'
import { DECLARED_FOLDER } from '../../test/standard-selection.constants.ts'
import { writeTextFile } from '../../test/standard-workspace.ts'
import { STANDARD_DISK_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'

import { describe, expect, it } from 'vitest'

describe('ask answer --cite into a file that changed since the ask', () => {
	it(
		'the file moved -> exit 0, the person fact recorded with no evidence, answer.json keeps citeRefused file-changed and no miss',
		async () => {
			const { asked, roundOneClause } = await askedOverClausesInRounds({ packRoundTwo: true })
			writeTextFile({
				path: join(asked.workspace.root, DECLARED_FOLDER, 'tag.md'),
				text: MOVED_TAG_FILE,
			})

			const json = await personAnsweredJson({
				asked,
				argv: citeArgvOf({ clause: roundOneClause }),
				exitCode: 0,
			})

			const folder = workspaceFactsFolder({ workspace: asked.workspace })
			expect({
				json,
				facts: factIdsIn({ folder }),
				fact: readFactIfAny({ folder, id: 'F-0001' }),
				record: readAnswerRecord({ asked }),
			}).toMatchObject({
				json: { ask: asked.ask, fact: 'F-0001', miss: null, citeRefused: 'file-changed' },
				facts: ['F-0001'],
				fact: { source: 'person', evidence: [] },
				record: { fact: 'F-0001', citeRefused: 'file-changed', miss: null },
			})
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})
