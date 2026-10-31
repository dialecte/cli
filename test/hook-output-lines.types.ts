import type { HookLineKind } from '../src/lib/handover/hook-output.types.ts'

/** A line a tool prints, and the kind it is shown as. */
export type FlaggedLineRow = { tool: string; line: string; kind: HookLineKind }
