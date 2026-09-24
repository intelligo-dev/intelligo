# This app is its own pnpm workspace root. pnpm 10 and later stop the
# install over a dependency build script nobody approved; these ship
# prebuilt binaries, so their scripts are declined.
packages: []
allowBuilds:
  '@parcel/watcher': false
  '@swc/core': false
  esbuild: false
