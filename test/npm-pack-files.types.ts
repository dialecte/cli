/** One package as `npm pack --dry-run --json` describes it: the files it would pack, among other fields. */
export type PackedPackage = { files: { path: string }[] }
