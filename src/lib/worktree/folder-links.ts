/** Which link reaches a folder about to be moved: a leaf module, every remover's link rule. */
import { realpathSync } from 'node:fs'

import { isAtOrInside } from '../file-system.ts'

import type { FolderLink } from './worktree.types.ts'

/**
 * A link that reaches the folder or something inside it: removing the folder would break it. Throws when the folder
 * cannot be read (gone, or not readable): the caller decides what that keeps.
 *
 * @intent never move a folder a link still points into
 * @internal
 */
export function linkReaching(params: {
	folder: string
	links: readonly FolderLink[]
}): string | undefined {
	const real = realpathSync.native(params.folder)
	return params.links.find((link) => isAtOrInside({ path: link.target, folder: real }))?.link
}
