/**
 * A scratch project depending on scl, the build of an scl checkout installed on the core the tests run on.
 * The build is copied, not linked: Node resolves a linked file from its real folder, where the checkout's
 * own core is installed.
 */
import { cpSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { coreEntries } from '../real-core.ts'

/** The project folder; the caller removes it. */
export async function installSclProject(params: { sclDirectory: string }): Promise<string> {
	const { sclDirectory } = params
	const project = mkdtempSync(join(tmpdir(), 'dialecte-cli-scl-'))
	writeFileSync(
		join(project, 'package.json'),
		JSON.stringify({ name: 'scl-app', dependencies: { '@dialecte/scl': '*' } }),
	)
	const installed = join(project, 'node_modules', '@dialecte', 'scl')
	mkdirSync(join(installed, 'node_modules', '@dialecte'), { recursive: true })
	cpSync(join(sclDirectory, 'package.json'), join(installed, 'package.json'))
	cpSync(join(sclDirectory, 'dist'), join(installed, 'dist'), { recursive: true })
	symlinkSync(coreEntries().folder, join(installed, 'node_modules', '@dialecte', 'core'), 'dir')
	return project
}
