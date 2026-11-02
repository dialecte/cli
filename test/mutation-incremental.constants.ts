/** The fast tier's vitest config of a scratch package whose key inputs a case edits: it imports a helper and names a setup file. */
export const CONFIG_SOURCE = `import { defineConfig } from 'vitest/config'
import helper from './helper'
export default defineConfig({ test: { setupFiles: ['./test/setup.ts'], name: helper } })
`

export const KEY_INPUT_FILES: Record<string, string> = {
	'v.config.ts': CONFIG_SOURCE,
	'helper.ts': 'export default "helper"\n',
	'test/setup.ts': 'export {}\n',
}

/** The shared incremental file L2a kept in the work folder: no run reads or writes it any more. */
export const LEGACY_INCREMENTAL_FILE = '.tmp/mutants/incremental.json'

/** A sha256 in hex. */
export const SHA256_HEX = /^[0-9a-f]{64}$/

/** A stored incremental file's name without its extension: the package's hash (16 hex), a dash, the key (64 hex). */
export const STORED_FILE_NAME = /^[0-9a-f]{16}-[0-9a-f]{64}$/
