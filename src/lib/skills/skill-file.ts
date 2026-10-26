/**
 * Reading a skill page: its frontmatter (Agent Skills format) and the concrete claims it makes about
 * the package it documents, so `dialecte skills check` can verify them against the source.
 */
import {
	ANY_FENCE_PATTERN,
	API_ROOTS,
	CODE_CALL_PATTERN,
	CODE_FENCE_PATTERN,
	FILE_EXTENSION_PATTERN,
	DESCRIPTION_MAX_LENGTH,
	DIRECTIVE_PATTERN,
	INLINE_CODE_PATTERN,
	NPM_OPTIONS_WITH_VALUE,
	SKILL_NAME_PATTERN,
} from './skill-file.constants.ts'

import type { SkillClaims, SkillFrontmatter } from './skill-file.types.ts'

export function readFrontmatter(markdown: string): SkillFrontmatter {
	const block = /^---\n([\s\S]*?)\n---/.exec(withUnixLineEndings(markdown))?.[1]
	if (!block) return { name: undefined, description: undefined }
	return {
		name: readField({ block, field: 'name' }),
		description: readField({ block, field: 'description' }),
	}
}

function readField(params: { block: string; field: string }): string | undefined {
	const match = new RegExp(`^${params.field}:[ \\t]*(.*)\\n?((?:[ \\t]+.*\\n?)*)`, 'm').exec(
		params.block,
	)
	const line = match?.[1]?.trim()
	if (line === undefined) return undefined
	// a folded (`>`) or literal (`|`) block scalar: the value is on the indented lines below
	const value = /^[>|][+-]?$/.test(line)
		? (match?.[2] ?? '')
				.split('\n')
				.map((continuation) => continuation.trim())
				.filter(Boolean)
				.join(' ')
		: line
	if (value === '') return undefined
	return value.replace(/^(['"])(.*)\1$/, '$2')
}

function withUnixLineEndings(text: string): string {
	return text.replace(/\r\n/g, '\n')
}

export function validateFrontmatter(params: {
	frontmatter: SkillFrontmatter
	folderName: string
}): string[] {
	const { name, description } = params.frontmatter
	const messages: string[] = []
	if (!name || !SKILL_NAME_PATTERN.test(name))
		messages.push(
			`name "${name ?? ''}" must be lowercase letters, digits and single hyphens (1-64)`,
		)
	else if (name !== params.folderName)
		messages.push(`name "${name}" must match its folder "${params.folderName}"`)
	if (!description || description.length > DESCRIPTION_MAX_LENGTH)
		messages.push(`description is required (1-${DESCRIPTION_MAX_LENGTH} characters)`)
	return messages
}

export function extractClaims(text: string): SkillClaims {
	const markdown = withUnixLineEndings(text)
	const prose = markdown.replace(ANY_FENCE_PATTERN, '')
	const inlineCode = [...prose.matchAll(INLINE_CODE_PATTERN)].map((match) => match[1].trim())
	// a directive quoted as code (to document it) is not one
	const directives = readDirectives(prose.replace(INLINE_CODE_PATTERN, ''))
	const codeCalls = [...markdown.matchAll(CODE_FENCE_PATTERN)].flatMap((fence) =>
		[...fence[1].matchAll(CODE_CALL_PATTERN)].map((call) => call[1]),
	)

	return {
		apiPaths: unique([...inlineCode, ...codeCalls].map(normalizeApiPath)),
		repositoryPaths: unique(inlineCode.map(toRepositoryPath)),
		npmScripts: unique(inlineCode.map(readNpmScript)),
		links: unique(
			[...prose.matchAll(/\]\(([^)\s]+)\)/g)].map((match) =>
				/^[a-z]+:|^#/.test(match[1]) ? undefined : match[1].split('#')[0],
			),
		),
		ignored: directives.ignored,
		describesWorkspace: directives.describesWorkspace,
	}
}

/** `npm run -w scl check -- --watch` → `check`: options before the script name are skipped. */
function readNpmScript(code: string): string | undefined {
	const words = /^npm run (.+)$/.exec(code)?.[1].split(/\s+/)
	if (!words) return undefined
	let index = 0
	while (words[index]?.startsWith('-')) index += NPM_OPTIONS_WITH_VALUE.has(words[index]) ? 2 : 1
	const script = words[index]
	return script !== undefined && /^[\w:.-]+$/.test(script) ? script : undefined
}

function readDirectives(markdown: string): { ignored: string[]; describesWorkspace: boolean } {
	const ignored: string[] = []
	let describesWorkspace = false
	for (const match of markdown.matchAll(DIRECTIVE_PATTERN)) {
		const body = match[1].trim()
		if (body === 'workspace') describesWorkspace = true
		else if (body.startsWith('ignore:'))
			ignored.push(...body.slice('ignore:'.length).trim().split(/\s+/))
	}
	return { ignored, describesWorkspace }
}

/** `doc.query.getTree(ref)` → `q.getTree`; anything with a placeholder, braces or no member → undefined. */
export function normalizeApiPath(code: string): string | undefined {
	const expression = code.split('(')[0]
	if (!/^[\w.]+$/.test(expression) || expression === 'doc.query') return undefined
	if (FILE_EXTENSION_PATTERN.test(expression)) return undefined
	for (const [prefix, root] of API_ROOTS) {
		if (!expression.startsWith(prefix)) continue
		const member = expression.slice(prefix.length)
		return member ? `${root}.${member}` : undefined
	}
	return undefined
}

function toRepositoryPath(code: string): string | undefined {
	if (!/^[\w.-]+(\/[\w.-]+)+\/?$/.test(code)) return undefined
	if (/^(node_modules|https?:)/.test(code) || code.startsWith('.')) return undefined
	return code.replace(/\/$/, '')
}

function unique(values: (string | undefined)[]): string[] {
	return [...new Set(values.filter((value): value is string => Boolean(value)))]
}
