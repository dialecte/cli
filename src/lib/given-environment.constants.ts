/**
 * The environment the cli was started with, frozen when this module is first evaluated: before `main()`
 * in cli.ts clears git's repository variables (GIT_DIR, GIT_INDEX_FILE...) for the cli's own git commands.
 * It depends on import order: cli.ts imports this module (directly and through the commands) before its
 * `main()` runs, so the snapshot holds what the user gave; a module that cleared the environment while
 * being evaluated, before this one, would break that. A command that runs the user's own command
 * (`lock run`) passes this on, not the cleared `process.env`.
 */
export const GIVEN_ENVIRONMENT: Readonly<NodeJS.ProcessEnv> = Object.freeze({ ...process.env })
