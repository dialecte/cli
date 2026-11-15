/** The origin of a scratch workspace, in ssh form. */
export const WORKSPACE_ORIGIN_SSH = 'git@github.com:example/repo.git'

/** The platform of the machine running the tests: a workspace's files are built with its path separators. */
export const HOST_PLATFORM: NodeJS.Platform = process.platform

/** The normalized key of that origin. */
export const WORKSPACE_REPO_KEY = 'github.com/example/repo'
