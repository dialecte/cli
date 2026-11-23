/**
 * A design or review file read once (DESIGN-GATE section 2, FIX-design-needs-critic): its real path, bytes and text,
 * or why it is refused. A file in a scratch or temporary folder is wiped there and nobody else reads it.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { sep } from 'node:path'

import { realPathOf } from '../file-system.ts'
import { scratchReadRoots } from '../scratch/scratch-roots.ts'

import type { DesignFileContent, DesignFileRefusal } from './design.types.ts'

/**
 * The file's real path, bytes and text, read once; refused when it is no readable file, is empty, is not UTF-8 text,
 * or lies in a scratch or temporary folder.
 *
 * @intent read a design or a review the way every reader of it must
 * @internal
 */
export function designFileContentOf(params: {
	file: string
	cwd: string
	sharedTemporaryRoots: readonly string[]
}): DesignFileContent | DesignFileRefusal {
	const { file, cwd, sharedTemporaryRoots } = params
	if (!existsSync(file) || !statSync(file).isFile()) return { refused: 'unreadable', file }
	const real = realPathOf(file)
	if (isInScratch({ file: real, cwd, sharedTemporaryRoots })) return { refused: 'in-scratch', file }
	let bytes: Buffer
	try {
		bytes = readFileSync(real)
	} catch {
		return { refused: 'unreadable', file }
	}
	if (bytes.length === 0) return { refused: 'empty', file: real }
	try {
		return { file: real, bytes, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
	} catch {
		return { refused: 'not-text', file: real }
	}
}

/**
 * Whether a read answered a refusal.
 *
 * @intent tell a refused design or review file from one read
 * @internal
 */
export function isDesignFileRefusal(
	read: DesignFileContent | DesignFileRefusal,
): read is DesignFileRefusal {
	return 'refused' in read
}

/**
 * Whether the file (a real path) lies under the cli's scratch roots, the system's temporary folder
 * (`scratchReadRoots`) or the system's shared temporary folders (`/tmp`, `/private/tmp`, each by its real path): wiped
 * there, and nobody else reads it. A file outside every git work tree is no refusal: plans live there.
 */
function isInScratch(params: {
	file: string
	cwd: string
	sharedTemporaryRoots: readonly string[]
}): boolean {
	const roots = [...scratchReadRoots({ cwd: params.cwd }), ...params.sharedTemporaryRoots]
	return roots.some(function holdsFile(root) {
		const real = realPathOf(root)
		return params.file === real || params.file.startsWith(`${real}${sep}`)
	})
}
