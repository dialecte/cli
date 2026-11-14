import { SEMANTIC_QUESTION, TAG_FILE } from '../../test/ask-command-workspace.constants.ts'
import { askThroughCli, createDocumentsWorkspace } from '../../test/ask-command-workspace.ts'
import { DECLARED_KEY, DECLARED_NAME } from '../../test/standard-selection.constants.ts'
import { STANDARD_DISK_CASE_TIMEOUT } from '../../test/test-timing.constants.ts'

import { describe, expect, it } from 'vitest'

const OTHER_FOLDER = 'other-1'

describe('ask: a standard root with no folder for the declared standard (D13, case 32m)', () => {
	it(
		'DIALECTE_STANDARD set, no folder of the declared key -> the line naming the name, key and folders once on stderr, the outside route, exit 3',
		() => {
			const workspace = createDocumentsWorkspace({
				standards: { [OTHER_FOLDER]: { 'tag.md': TAG_FILE } },
			})

			const run = askThroughCli({ workspace, argv: [SEMANTIC_QUESTION, '--json'] })

			const line = `no folder for "${DECLARED_NAME}" (${DECLARED_KEY}); folders: ${OTHER_FOLDER}`
			expect({
				status: run.status,
				lineCount: run.stderr.split('\n').filter((entry) => entry.includes(line)).length,
				outside: run.stdout.includes('"outside"'),
			}).toEqual({ status: 3, lineCount: 1, outside: true })
		},
		STANDARD_DISK_CASE_TIMEOUT,
	)
})
