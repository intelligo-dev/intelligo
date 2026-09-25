# This app is its own pnpm workspace root. pnpm 11 stops the install over
# a dependency build script nobody approved (10 warns); these ship
# prebuilt binaries, so their scripts are declined.
packages: []
allowBuilds:
  '@parcel/watcher': false
  '@swc/core': false
  esbuild: false
# The shadcn CLI runs a plain `pnpm add` here when it installs a page.
ignoreWorkspaceRootCheck: true
