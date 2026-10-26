/**
 * Verifies what one skill page claims (APIs, paths, npm scripts, links, frontmatter) against the facts
 * of the package it ships in. A page marked `<!-- dialecte-skills workspace -->` describes several
 * repositories: what this package cannot confirm is a warning unless workspace facts are given.
 */
import { posix } from 'node:path'

import { GENERATED_BLOCK_PATTERN } from './generated-blocks.constants.ts'
import {
	extractClaims,
	normalizeApiPath,
	readFrontmatter,
	validateFrontmatter,
} from './skill-file.ts'

import type { CheckSkillPageParams } from './check-skill-page.types.ts'
import type { SkillFinding } from './skill-file.types.ts'

export function checkSkillPage(params: CheckSkillPageParams): SkillFinding[] {
	const { file, markdown, folderName, siblingFiles, facts, workspaceFacts } = params
	// generated blocks are derived from the source: what they cite is true by construction
	const claims = extractClaims(markdown.replace(GENERATED_BLOCK_PATTERN, '$1\n$3'))
	const ignored = new Set(claims.ignored.flatMap((token) => [token, normalizeApiPath(token)]))
	const findings: SkillFinding[] = []

	// workspace facts only vouch for pages that say they describe the workspace
	function report(claim: { found: boolean; foundInWorkspace: boolean; what: string }): void {
		if (claim.found) return
		if (claims.describesWorkspace && claim.foundInWorkspace) return
		if (claims.describesWorkspace && !workspaceFacts)
			findings.push({
				file,
				severity: 'warning',
				message: `${claim.what} not found in this package (run with --workspace)`,
			})
		else findings.push({ file, severity: 'error', message: `${claim.what} does not exist` })
	}

	if (folderName !== undefined)
		for (const message of validateFrontmatter({
			frontmatter: readFrontmatter(markdown),
			folderName,
		}))
			findings.push({ file, severity: 'error', message })

	for (const link of claims.links)
		if (!isSkillFileOrFolder({ link, siblingFiles }))
			findings.push({ file, severity: 'error', message: `link \`${link}\` does not exist` })

	// Method paths come from this package's types only: on a workspace page an unknown API is a warning.
	for (const apiPath of claims.apiPaths.filter((claim) => !ignored.has(claim))) {
		if (facts.methodPaths.has(apiPath)) continue
		if (claims.describesWorkspace)
			findings.push({
				file,
				severity: 'warning',
				message: `API \`${apiPath}\` not found in this package (APIs are verified per package)`,
			})
		else findings.push({ file, severity: 'error', message: `API \`${apiPath}\` does not exist` })
	}

	for (const path of claims.repositoryPaths.filter((claim) => !ignored.has(claim)))
		report({
			found: isPathSuffix({ path, repositoryPaths: facts.repositoryPaths }),
			foundInWorkspace: isPathSuffix({
				path,
				repositoryPaths: workspaceFacts?.repositoryPaths ?? [],
			}),
			what: `path \`${path}\``,
		})

	for (const script of claims.npmScripts.filter((claim) => !ignored.has(claim)))
		report({
			found: facts.npmScripts.has(script),
			foundInWorkspace: workspaceFacts?.npmScripts.has(script) ?? false,
			what: `npm script \`${script}\``,
		})

	return findings
}

/** A skill names paths relative to wherever the reader stands: any repository path ending with it counts. */
function isPathSuffix(params: { path: string; repositoryPaths: readonly string[] }): boolean {
	return params.repositoryPaths.some(
		(repositoryPath) =>
			repositoryPath === params.path || repositoryPath.endsWith(`/${params.path}`),
	)
}

/** A link names a file of the skill, or a folder (`references/`) holding at least one of them. */
function isSkillFileOrFolder(params: { link: string; siblingFiles: ReadonlySet<string> }): boolean {
	const target = posix.normalize(params.link).replace(/\/$/, '')
	if (params.siblingFiles.has(target)) return true
	return [...params.siblingFiles].some((siblingFile) => siblingFile.startsWith(`${target}/`))
}
