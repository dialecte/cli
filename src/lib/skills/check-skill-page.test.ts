import { checkSkillPage } from './check-skill-page.ts'

import { describe, expect, it } from 'vitest'

import type { CheckSkillPageParams } from './check-skill-page.types.ts'
import type { SkillFinding } from './skill-file.types.ts'

const FRONTMATTER = '---\nname: dialecte\ndescription: Use it.\n---\n'

const BASE: CheckSkillPageParams = {
	file: 'skills/dialecte/SKILL.md',
	markdown: FRONTMATTER,
	folderName: 'dialecte',
	siblingFiles: new Set(['references/core-api.md']),
	facts: {
		methodPaths: new Set(['q.getTree', 'tx.addChild', 'tx.reference.applyUuidRemap']),
		repositoryPaths: ['src', 'src/helpers', 'src/helpers/read-attributes.ts'],
		npmScripts: new Set(['check', 'build']),
	},
}

function error(message: string): SkillFinding {
	return { file: BASE.file, severity: 'error', message }
}

function warning(message: string): SkillFinding {
	return { file: BASE.file, severity: 'warning', message }
}

describe('checkSkillPage', () => {
	const testCases: Record<
		string,
		{ params: Partial<CheckSkillPageParams>; expected: SkillFinding[] }
	> = {
		'every claim true → no finding': {
			params: {
				markdown: `${FRONTMATTER}\`query.getTree()\`, \`tx.reference.applyUuidRemap\`, \`helpers/read-attributes.ts\`, \`npm run check\`, [api](references/core-api.md)`,
			},
			expected: [],
		},
		'unknown method → error': {
			params: { markdown: `${FRONTMATTER}\`tx.move(ref)\`` },
			expected: [error('API `tx.move` does not exist')],
		},
		'path that is no suffix of a repository path → error': {
			params: { markdown: `${FRONTMATTER}\`src/helpers/gone.ts\`` },
			expected: [error('path `src/helpers/gone.ts` does not exist')],
		},
		'unknown npm script → error': {
			params: { markdown: `${FRONTMATTER}\`npm run proof\`` },
			expected: [error('npm script `proof` does not exist')],
		},
		'broken relative link → error': {
			params: { markdown: `${FRONTMATTER}[x](references/missing.md)` },
			expected: [error('link `references/missing.md` does not exist')],
		},
		'link to a folder of the skill → found; to a missing folder → error': {
			params: { markdown: `${FRONTMATTER}[refs](references/) [gone](examples/)` },
			expected: [error('link `examples/` does not exist')],
		},
		'invalid frontmatter → error': {
			params: { markdown: '---\nname: other\ndescription: x\n---\n' },
			expected: [error('name "other" must match its folder "dialecte"')],
		},
		'claims inside a generated block → not checked (the block is derived from the source)': {
			params: {
				markdown: `${FRONTMATTER}<!-- dialecte-skills:generated api -->\n| \`tx.move\` | path \`S1/V1/B1\` |\n<!-- /dialecte-skills:generated -->\nbetween \`tx.gone\`\n<!-- dialecte-skills:generated intents -->\n| \`tx.alsoGone\` |\n<!-- /dialecte-skills:generated -->\nafter \`tx.missing\``,
			},
			expected: [error('API `tx.gone` does not exist'), error('API `tx.missing` does not exist')],
		},
		'reference page (no folder name) → frontmatter not required': {
			params: { markdown: '# Map', folderName: undefined },
			expected: [],
		},
		'ignored claims, written as in the text → skipped': {
			params: {
				markdown: `${FRONTMATTER}<!-- dialecte-skills ignore: doc.query.reference.findRefsPointingTo proof -->\n\`doc.query.reference.findRefsPointingTo()\` \`npm run proof\``,
			},
			expected: [],
		},
		'workspace page without workspace facts → unverified claims are warnings': {
			params: {
				markdown: `${FRONTMATTER}<!-- dialecte-skills workspace -->\n\`scl/src/v2019C1/hooks\` \`npm run proof\``,
			},
			expected: [
				warning('path `scl/src/v2019C1/hooks` not found in this package (run with --workspace)'),
				warning('npm script `proof` not found in this package (run with --workspace)'),
			],
		},
		'workspace facts → claims of a sibling package verified': {
			params: {
				markdown: `${FRONTMATTER}<!-- dialecte-skills workspace -->\n\`scl/src/v2019C1/hooks\` \`npm run proof\` \`scl/gone\``,
				workspaceFacts: {
					repositoryPaths: ['scl/src/v2019C1/hooks', 'create/package.json'],
					npmScripts: new Set(['proof']),
				},
			},
			expected: [error('path `scl/gone` does not exist')],
		},
		'page not marked workspace, workspace facts given → a sibling path or script is still an error':
			{
				params: {
					markdown: `${FRONTMATTER}\`scl/src/v2019C1/hooks\` \`npm run proof\``,
					workspaceFacts: {
						repositoryPaths: ['scl/src/v2019C1/hooks'],
						npmScripts: new Set(['proof']),
					},
				},
				expected: [
					error('path `scl/src/v2019C1/hooks` does not exist'),
					error('npm script `proof` does not exist'),
				],
			},
		'workspace page, API of another package → a warning even with workspace facts': {
			params: {
				markdown: `${FRONTMATTER}<!-- dialecte-skills workspace -->\n\`tx.lifecycle.transplant.deep\``,
				workspaceFacts: { repositoryPaths: [], npmScripts: new Set() },
			},
			expected: [
				warning(
					'API `tx.lifecycle.transplant.deep` not found in this package (APIs are verified per package)',
				),
			],
		},
	}

	for (const [title, testCase] of Object.entries(testCases)) {
		it(title, () => {
			expect(checkSkillPage({ ...BASE, ...testCase.params })).toEqual(testCase.expected)
		})
	}
})
