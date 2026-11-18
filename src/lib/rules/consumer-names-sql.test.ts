/**
 * A consumer name that is also an SQL keyword: inside an SQL string of code it is the keyword, not the name;
 * everywhere else (prose, comments, docs, identifiers, a string that is not SQL) it is still the name.
 */
import { createScratchRepository, git, isolateGitConfig } from '../../../test/scratch-repository.ts'
import { findLotReferences } from '../handover/find-lot-references.ts'
import { checkRules } from './check-rules.ts'
import { readReferencePatterns } from './committed-text.ts'

import { afterEach, describe, expect, it, vi } from 'vitest'

/** The consumer names of the cases: an SQL keyword, and a name that is none. */
const KEYWORD_NAME = 'WHERE'
const PLAIN_NAME = 'Acme'

/** SQL in a template literal, beside every case's file: never reported. */
const SQL_FILE = 'src/sql.ts'
const SQL_TEXT = `export function rows(): string {\n\treturn \`SELECT id FROM t ${KEYWORD_NAME} id = ?\`\n}\n`

/**
 * A contributor package naming both consumer names in its git config, holding `file` with `text` and the SQL file.
 */
function packageHolding(params: { file: string; text: string }): string {
	isolateGitConfig()
	const root = createScratchRepository({
		'package.json': `${JSON.stringify({ name: '@dialecte/demo', dialecte: { profile: 'contributor' } })}\n`,
		[SQL_FILE]: SQL_TEXT,
		[params.file]: params.text,
	})
	git({
		root,
		args: ['config', 'dialecte.consumerNames', `${KEYWORD_NAME}, ${PLAIN_NAME}`],
	})
	return root
}

afterEach(() => vi.unstubAllEnvs())

type SqlRow = { name: string; file: string; text: string; found: number[] }

const ROWS: SqlRow[] = [
	{
		name: 'SQL in a template literal',
		file: 'src/query.ts',
		text: `export function query(): string {\n\treturn \`SELECT id FROM t ${KEYWORD_NAME} id = ?\`\n}\n`,
		found: [],
	},
	{
		name: 'SQL in a template literal with a substitution',
		file: 'src/query.ts',
		text: `export function query(table: string): string {\n\treturn \`SELECT id FROM \${table} ${KEYWORD_NAME} id = ?\`\n}\n`,
		found: [],
	},
	{
		name: 'SQL in a plain string',
		file: 'src/query.ts',
		text: `export function query(): string {\n\treturn 'DELETE FROM t ${KEYWORD_NAME} id = ?'\n}\n`,
		found: [],
	},
	{
		name: 'SQL in a + chain of strings, the keyword in a later piece',
		file: 'src/query.ts',
		text: `export function query(): string {\n\treturn 'SELECT id FROM t ' +\n\t\t'${KEYWORD_NAME} id = ?'\n}\n`,
		found: [],
	},
	{
		name: 'SQL in a multi-line template literal starting on its own line',
		file: 'src/query.ts',
		text: `export function query(): string {\n\treturn \`\n\t\tSELECT id FROM t\n\t\t${KEYWORD_NAME} id = ?\`\n}\n`,
		found: [],
	},
	{
		name: 'SQL in a + chain whose later piece is in parentheses',
		file: 'src/query.ts',
		text: `export function query(): string {\n\treturn 'SELECT id FROM t ' + ('${KEYWORD_NAME} id = ?')\n}\n`,
		found: [],
	},
	{
		name: 'the name as a substitution right after the SQL text',
		file: 'src/query.ts',
		text: `export function query(${KEYWORD_NAME}: string): string {\n\treturn \`SELECT id FROM t \${${KEYWORD_NAME}}\`\n}\n`,
		found: [1, 2],
	},
	{
		name: 'the name in a comment',
		file: 'src/query.ts',
		text: `// built for ${KEYWORD_NAME}\nexport function query(): string {\n\treturn 'SELECT id FROM t'\n}\n`,
		found: [1],
	},
	{
		name: 'the name in a doc, SQL included',
		file: 'doc/query.md',
		text: `# Query\n\nUsed by ${KEYWORD_NAME}.\n\n\`SELECT id FROM t ${KEYWORD_NAME} id = ?\`\n`,
		found: [3, 5],
	},
	{
		name: 'an uppercase identifier',
		file: 'src/query.ts',
		text: `export function query(): number {\n\tconst ${KEYWORD_NAME} = 1\n\treturn ${KEYWORD_NAME}\n}\n`,
		found: [2, 3],
	},
	{
		name: 'a string that is not SQL',
		file: 'src/query.ts',
		text: `export function query(): string {\n\treturn 'made for ${KEYWORD_NAME} users'\n}\n`,
		found: [2],
	},
	{
		name: 'a name that is no SQL keyword inside SQL',
		file: 'src/query.ts',
		text: `export function query(): string {\n\treturn 'SELECT id FROM ${PLAIN_NAME}'\n}\n`,
		found: [2],
	},
]

describe('consumer names inside SQL strings', () => {
	it.each(ROWS)(
		'rules: $name, beside SQL → reported on lines $found only',
		({ file, text, found }) => {
			const root = packageHolding({ file, text })

			expect(
				checkRules({ root, givenFiles: [SQL_FILE, file], environment: process.env })
					.findings.filter(
						(finding) =>
							finding.rule === 'committed-text-reference' &&
							finding.message.startsWith('consumer tool name'),
					)
					.map((finding) => `${finding.file}:${String(finding.line)}`),
			).toEqual(found.map((line) => `${file}:${String(line)}`))
		},
	)

	it.each(ROWS)(
		'hand-over guard: $name, beside SQL → lines $found only',
		({ file, text, found }) => {
			const root = packageHolding({ file, text })

			expect(
				findLotReferences({
					root,
					lots: [{ message: 'fix: a query', files: [SQL_FILE, file], deletedFiles: [] }],
					referencePatterns: readReferencePatterns(root),
				}),
			).toEqual(
				found.map((line) => expect.stringContaining(`${file}:${String(line)}: consumer tool name`)),
			)
		},
	)
})
