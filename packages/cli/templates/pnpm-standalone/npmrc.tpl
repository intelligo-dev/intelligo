# pnpm 9 reads this setting here; later versions read it from
# pnpm-workspace.yaml. pnpm-workspace.yaml makes this directory a
# workspace root, and pnpm refuses a plain `pnpm add` in one unless told
# it is intended — the shadcn CLI runs exactly that when it installs a
# registry page.
ignore-workspace-root-check=true
