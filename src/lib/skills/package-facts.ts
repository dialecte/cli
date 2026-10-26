/** Facts read from the file system that skill claims are checked against. */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { discoverVersions } from '../config.ts'
import { EXCLUDED_FOLDERS, NOT_A_CONCERN_FILE } from './package-facts.constants.ts'

import type { PackageFacts } from './check-skill-page.types.ts'

/**
 * Files and folders of a package, relative and sorted: in a git repository its tracked and unignored
 * files (build output, reports and caches never count); elsewhere a walk without dependencies and output.
 */
export function listRepositoryPaths(root: string): string[] {
	const gitFiles = listGitFiles(root)
	return gitFiles ? withFolders(gitFiles) : walkRepositoryPaths(root)
}

function listGitFiles(root: string): string[] | undefined {
	if (!existsSync(join(root, '.git'))) return undefined
	const result = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
		cwd: root,
		encoding: 'utf8',
		maxBuffer: 1e8,
	})
	if (result.status !== 0) return undefined
	return result.stdout
		.split('\n')
		.filter(Boolean)
		.filter((path) => existsSync(join(root, path)))
}

function withFolders(files: readonly string[]): string[] {
	const paths = new Set<string>()
	for (const file of files) {
		const segments = file.split('/')
		for (let length = 1; length <= segments.length; length++)
			paths.add(segments.slice(0, length).join('/'))
	}
	return [...paths].sort()
}

function walkRepositoryPaths(root: string): string[] {
	const paths: string[] = []
	function walk(relativeFolder: string): void {
		for (const entry of readdirSync(join(root, relativeFolder), { withFileTypes: true })) {
			const path = relativeFolder ? `${relativeFolder}/${entry.name}` : entry.name
			if (entry.isDirectory()) {
				if (EXCLUDED_FOLDERS.includes(entry.name) || EXCLUDED_FOLDERS.includes(path)) continue
				paths.push(path)
				walk(path)
			} else paths.push(path)
		}
	}
	walk('')
	return paths.sort()
}

export function readNpmScripts(root: string): Set<string> {
	const path = join(root, 'package.json')
	if (!existsSync(path)) return new Set()
	return new Set(Object.keys(JSON.parse(readFileSync(path, 'utf8')).scripts ?? {}))
}

/** Every repository folder of a workspace (a folder holding a package.json), paths prefixed with it. */
export function readWorkspaceFacts(workspaceRoot: string): Omit<PackageFacts, 'methodPaths'> {
	const packageFolders = readdirSync(workspaceRoot, { withFileTypes: true })
		.filter(
			(entry) =>
				entry.isDirectory() &&
				!entry.name.startsWith('.') &&
				existsSync(join(workspaceRoot, entry.name, 'package.json')),
		)
		.map((entry) => entry.name)
		.sort()

	return {
		repositoryPaths: packageFolders.flatMap((folder) =>
			listRepositoryPaths(join(workspaceRoot, folder)).map((path) => `${folder}/${path}`),
		),
		npmScripts: new Set(
			packageFolders.flatMap((folder) => [...readNpmScripts(join(workspaceRoot, folder))]),
		),
	}
}

/** `src/<version>/hooks/<folder>/*.ts` → concern files per hook folder, merged over versions. */
export function listHookConcernFiles(root: string): Record<string, string[]> {
	const concernFilesByFolder: Record<string, string[]> = {}
	for (const version of discoverVersions(root)) {
		const hooksFolder = join(root, 'src', version, 'hooks')
		if (!existsSync(hooksFolder)) continue
		for (const folder of readdirSync(hooksFolder, { withFileTypes: true })) {
			if (!folder.isDirectory()) continue
			const files = readdirSync(join(hooksFolder, folder.name)).filter(
				(file) => file.endsWith('.ts') && !NOT_A_CONCERN_FILE.test(file),
			)
			concernFilesByFolder[folder.name] = [
				...new Set([...(concernFilesByFolder[folder.name] ?? []), ...files]),
			].sort()
		}
	}
	return concernFilesByFolder
}
