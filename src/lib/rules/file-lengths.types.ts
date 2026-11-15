/** A checked file over its length limit: its length, judged against the base once every such file is known. */
export type OverLimitFile = { file: string; lineCount: number }
