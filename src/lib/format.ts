/**
 * Format CLI-emitted files with oxfmt — same idea as `bench` running the project's own `tsc`: the
 * generated output ends up in the consuming package's exact style, so it never churns against that
 * package's `format:check`. oxfmt formats .ts/.json/.md.
 *
 * Binary: the CONSUMER's oxfmt wins (its version + the config it auto-discovers); otherwise the CLI's
 * own bundled oxfmt (the shared house style). Config: `--format-config <path>` overrides; otherwise
 * oxfmt auto-discovers the nearest `.oxfmtrc`. Graceful: if no oxfmt is available or it fails, we warn
 * and leave the files as written (valid, just unformatted). `--no-format` skips it.
 */
import { spawnSync } from 'node:child_process'

import { resolveBin } from './bin.ts'
import { getArg, hasFlag } from './config.ts'

export type FormatOpts = { config?: string; skip?: boolean }

export const formatOptsFromArgv = (argv: string[]): FormatOpts => ({
	config: getArg(argv, 'format-config'),
	skip: hasFlag(argv, 'no-format'),
})

/** Run oxfmt over `files` (absolute or root-relative). No-op on skip / when no oxfmt is available. */
export function formatFiles(root: string, files: string[], opts: FormatOpts = {}): void {
	if (opts.skip || !files.length) return
	const oxfmt = resolveBin('oxfmt', 'oxfmt', root)
	if (!oxfmt) {
		console.warn('  ⚠ oxfmt not found (project nor @dialecte/cli) — emitted files left unformatted')
		return
	}
	const args = [...(opts.config ? ['--config', opts.config] : []), ...files]
	const res = spawnSync(oxfmt.path, args, { cwd: root, encoding: 'utf8' })
	if (res.status !== 0)
		console.warn(`  ⚠ oxfmt exited ${res.status ?? '?'} — emitted files may be unformatted`)
}
