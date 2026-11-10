import { join } from 'node:path'

/** The lot the hand-over step-event cases record into (index 0001, repository `demo`). */
export const HANDOVER_LOT = '0001-demo-read'

/** A second lot of the store (index 0002), whose worktree the commands run in. */
export const BYSTANDER_LOT = '0002-demo-bystander'

/** The files the lot's brief scope holds: what `src/read.ts` and the changelog edit. */
export const HANDOVER_LOT_SCOPE = ['src/', 'CHANGELOG.md']

/** The hand-over the lot's folder holds is written at this time. */
export const HANDOVER_WRITTEN_AT = new Date('2026-11-10T09:00:00.000Z')

/** The cli a written hand-over names as its fallback: never run by these cases. */
export const HANDOVER_WRITER_CLI = '/opt/dialecte/dist/cli.js'

/** The cli's entry in the sources: the hand-over's hook and the rehearsal child run it. */
export const HANDOVER_CLI_SOURCE = join(import.meta.dirname, '..', 'src', 'cli.ts')

/** The git file a hand-over's commit hook leaves its record in (read from the hook's output). */
export const HOOK_RECORD_FILE = 'dialecte-gate-hook.json'

/**
 * How long a case waits (once for the hook to start, once for the child to exit): a guard against a hang, never a
 * measure of speed (a rehearsal clones a scratch repository: a few seconds, a minute on a loaded machine). Two waits
 * of it stay below the case's own timeout (300 s), so a hang fails with its own message first.
 */
export const HANDOVER_WAIT_BOUND_MS = 120_000
