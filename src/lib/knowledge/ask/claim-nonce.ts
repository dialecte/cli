import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Claims a nonce once (D7): an exclusive create of `<used folder>/<nonce>`; false when it was claimed before (by an
 * earlier run or one running now), so its report is never counted twice.
 */
export function claimNonce(params: { usedFolder: string; nonce: string }): boolean {
	mkdirSync(params.usedFolder, { recursive: true })
	try {
		writeFileSync(join(params.usedFolder, params.nonce), '', { flag: 'wx' })
		return true
	} catch (error) {
		if (error instanceof Error && 'code' in error && error.code === 'EEXIST') return false
		throw error
	}
}
