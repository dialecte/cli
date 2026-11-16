import type { ConfigFinding } from './config.types.ts'

/** What the old homes of a layer hold: what every reader refuses, and the lines saying an old copy can go. */
export type OldHomes = { refusals: ConfigFinding[]; notes: string[] }
