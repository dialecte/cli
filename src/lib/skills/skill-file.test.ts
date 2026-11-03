import { extractClaims, readFrontmatter, validateFrontmatter } from './skill-file.ts'

import { describe, expect, it } from 'vitest'

import type { SkillClaims } from './skill-file.types.ts'

describe('readFrontmatter', () => {
	const testCases = {
		'name and description → both read': {
			markdown: '---\nname: dialecte\ndescription: Use it.\nlicense: MIT\n---\n# Body',
			expected: { name: 'dialecte', description: 'Use it.' },
		},
		'quoted values → quotes removed': {
			markdown: `---\nname: 'dialecte-scl'\ndescription: "SCL map"\n---\n`,
			expected: { name: 'dialecte-scl', description: 'SCL map' },
		},
		'folded description (>) → the folded text': {
			markdown: '---\nname: dialecte\ndescription: >\n  Use it\n  everywhere.\n---\n',
			expected: { name: 'dialecte', description: 'Use it everywhere.' },
		},
		'Windows line endings → read the same': {
			markdown: '---\r\nname: dialecte\r\ndescription: Use it.\r\n---\r\n',
			expected: { name: 'dialecte', description: 'Use it.' },
		},
		'no frontmatter → both undefined': {
			markdown: '# Only a body',
			expected: { name: undefined, description: undefined },
		},
		'metadata.audience contributor → audience read': {
			markdown:
				'---\nname: dialecte-lot\ndescription: Use it.\nmetadata:\n  audience: contributor\n---\n',
			expected: { name: 'dialecte-lot', description: 'Use it.', audience: 'contributor' },
		},
		'audience nested deeper under metadata → not metadata.audience': {
			markdown:
				'---\nname: dialecte\ndescription: Use it.\nmetadata:\n  tags:\n    audience: contributor\n---\n',
			expected: { name: 'dialecte', description: 'Use it.', audience: undefined },
		},
		'metadata without audience, audience at the top level → no audience': {
			markdown:
				'---\nname: dialecte\ndescription: Use it.\nmetadata:\n  owner: core\naudience: contributor\n---\n',
			expected: { name: 'dialecte', description: 'Use it.', audience: undefined },
		},
	}

	for (const [title, testCase] of Object.entries(testCases)) {
		it(title, () => {
			expect(readFrontmatter(testCase.markdown)).toEqual(testCase.expected)
		})
	}
})

describe('validateFrontmatter', () => {
	const testCases = {
		'valid name matching its folder → no message': {
			frontmatter: { name: 'dialecte-scl', description: 'SCL map' },
			folderName: 'dialecte-scl',
			expected: [],
		},
		'audience consumer or contributor → no message': {
			frontmatter: { name: 'dialecte-lot', description: 'x', audience: 'contributor' },
			folderName: 'dialecte-lot',
			expected: [],
		},
		'unknown audience → reported': {
			frontmatter: { name: 'dialecte-lot', description: 'x', audience: 'maintainer' },
			folderName: 'dialecte-lot',
			expected: ['metadata.audience "maintainer" must be consumer or contributor'],
		},
		'name differs from folder → reported': {
			frontmatter: { name: 'dialecte', description: 'x' },
			folderName: 'dialecte-scl',
			expected: ['name "dialecte" must match its folder "dialecte-scl"'],
		},
		'uppercase name → reported': {
			frontmatter: { name: 'Dialecte', description: 'x' },
			folderName: 'Dialecte',
			expected: ['name "Dialecte" must be lowercase letters, digits and single hyphens (1-64)'],
		},
		'missing description → reported': {
			frontmatter: { name: 'dialecte', description: undefined },
			folderName: 'dialecte',
			expected: ['description is required (1-1024 characters)'],
		},
		'description over 1024 characters → reported': {
			frontmatter: { name: 'dialecte', description: 'x'.repeat(1025) },
			folderName: 'dialecte',
			expected: ['description is required (1-1024 characters)'],
		},
	}

	for (const [title, testCase] of Object.entries(testCases)) {
		it(title, () => {
			expect(
				validateFrontmatter({ frontmatter: testCase.frontmatter, folderName: testCase.folderName }),
			).toEqual(testCase.expected)
		})
	}
})

describe('extractClaims', () => {
	const none: SkillClaims = {
		apiPaths: [],
		repositoryPaths: [],
		npmScripts: [],
		links: [],
		ignored: [],
		describesWorkspace: false,
	}

	const testCases: Record<string, { markdown: string; expected: SkillClaims }> = {
		'calls from every root → normalised to q / tx / doc / project paths': {
			markdown:
				'Use `doc.query.getRoot()`, `query.getTree(ref, { depth })`, `tx.reference.applyUuidRemap`, `doc.transaction(fn)` and `project.open(name)`.',
			expected: {
				...none,
				apiPaths: [
					'q.getRoot',
					'q.getTree',
					'tx.reference.applyUuidRemap',
					'doc.transaction',
					'project.open',
				],
			},
		},
		'placeholders, braces and bare roots → not claims': {
			markdown: '`doc.query.<ns>.<verb>()`, `tx.lifecycle.extract.{fsd,asd}`, `doc.query`, `query`',
			expected: none,
		},
		'calls inside a ts code fence → claims; other fences and plain members → not': {
			markdown:
				'```ts\nconst root = await doc.query.getRoot()\nawait tx.reference.applyUuidRemap(mappings)\nconst text = doc.documentId\n```\n```bash\nnpx tx.madeUp()\n```',
			expected: { ...none, apiPaths: ['q.getRoot', 'tx.reference.applyUuidRemap'] },
		},
		'file names that start like a root (query.ts, tx.types.ts) → not API claims': {
			markdown: '`query.ts`, `tx.types.ts`, `doc.md`',
			expected: none,
		},
		'repository paths → kept; import specifiers, urls and placeholders → skipped': {
			markdown:
				'`src/helpers/read-attributes.ts`, `hooks/shared/`, `@dialecte/core/helpers`, `https://x.io/a/b`, `extensions/<ns>/query`, `node_modules/x/dist`',
			expected: { ...none, repositoryPaths: ['src/helpers/read-attributes.ts', 'hooks/shared'] },
		},
		'npm scripts → names kept': {
			markdown: 'Run `npm run check`, then `npm run type-bench:check`.',
			expected: { ...none, npmScripts: ['check', 'type-bench:check'] },
		},
		'relative links → kept; external links → skipped': {
			markdown: 'See [api](references/core-api.md) and [site](https://dialecte.github.io/core/).',
			expected: { ...none, links: ['references/core-api.md'] },
		},
		'ignore and workspace directives → read': {
			markdown:
				'<!-- dialecte-skills ignore: tx.lifecycle.instantiate.ssd npm-run-proof -->\n<!-- dialecte-skills workspace -->',
			expected: {
				...none,
				ignored: ['tx.lifecycle.instantiate.ssd', 'npm-run-proof'],
				describesWorkspace: true,
			},
		},
		'directive quoted in inline code or in a fence → not read': {
			markdown:
				'Silence a claim with `<!-- dialecte-skills ignore: token -->`.\n```md\n<!-- dialecte-skills workspace -->\n```',
			expected: none,
		},
		'fences indented in a list item → calls checked, the rest is not prose': {
			markdown:
				'1. Add it:\n   ```ts\n   await tx.addChild(parent)\n   ```\n2. Then:\n   ```bash\n   echo [x](missing.md) `npm run gone`\n   ```',
			expected: { ...none, apiPaths: ['tx.addChild'] },
		},
		'npm options before the script → the script name': {
			markdown:
				'`npm run -w scl check`, `npm run --workspace scl test`, `npm run --workspace=scl build`, `npm run --if-present lint`',
			expected: { ...none, npmScripts: ['check', 'test', 'build', 'lint'] },
		},
		'same claim twice → listed once': {
			markdown: '`q.getTree()` and again `query.getTree`',
			expected: { ...none, apiPaths: ['q.getTree'] },
		},
	}

	for (const [title, testCase] of Object.entries(testCases)) {
		it(title, () => {
			expect(extractClaims(testCase.markdown)).toEqual(testCase.expected)
		})
	}
})
