#!/usr/bin/env bash
# SessionStart hook (.claude/settings.json): gets a cloud session ready for
# typecheck, lint and tests. Cloud VMs ship Node 20-22 and no node_modules;
# COMPIES needs the Node major in .nvmrc and the pnpm in package.json.
# Outside a cloud session it exits at once.
[ "$CLAUDE_CODE_REMOTE" = "true" ] || exit 0
set -o pipefail

cd "$CLAUDE_PROJECT_DIR" || exit 1
log=/tmp/cloud-setup.log
: > "$log"

# A SessionStart hook's stdout reaches Claude as context, so say what broke.
fail() {
  echo "Cloud setup failed: $1. Details in $log."
  exit 0
}

node_major=$(tr -dc '0-9' < .nvmrc)
node_dir="$HOME/.cache/compies-node-$node_major"

if [ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null)" != "$node_major" ]; then
  if [ ! -x "$node_dir/bin/node" ]; then
    version=$(curl -fsSL https://nodejs.org/dist/index.json 2>>"$log" \
      | jq -r --arg p "v$node_major." 'first(.[] | select(.version | startswith($p))) | .version') \
      || fail "could not look up the latest Node $node_major"
    mkdir -p "$node_dir"
    curl -fsSL "https://nodejs.org/dist/$version/node-$version-linux-x64.tar.gz" 2>>"$log" \
      | tar -xz -C "$node_dir" --strip-components=1 2>>"$log" \
      || fail "could not download Node $version"
  fi
  export PATH="$node_dir/bin:$PATH"
  [ -n "$CLAUDE_ENV_FILE" ] && echo "export PATH=\"$node_dir/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
fi

pnpm_version=$(node -p 'require("./package.json").packageManager.split("@")[1].split("+")[0]')
if [ "$(pnpm --version 2>/dev/null)" != "$pnpm_version" ]; then
  npm install -g "pnpm@$pnpm_version" >>"$log" 2>&1 || fail "could not install pnpm $pnpm_version"
fi

# Skip the install while nothing it depends on has changed since the last one.
stamp=node_modules/.cloud-setup.sha256
if ! sha256sum --check --status "$stamp" 2>/dev/null; then
  rm -f "$stamp"
  CI=true pnpm install --frozen-lockfile >>"$log" 2>&1 || fail "pnpm install failed"
  sha256sum scripts/cloud-setup.sh .nvmrc package.json pnpm-lock.yaml pnpm-workspace.yaml > "$stamp"
fi

echo "Cloud setup: Node $(node --version), pnpm $(pnpm --version), dependencies installed."
