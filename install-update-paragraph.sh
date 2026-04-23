#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${SCRIPT_DIR}"
VENDOR_DIR="${ROOT_DIR}/vendor"
SOURCE_DIR="${VENDOR_DIR}/paragraf-src"
PACKAGE_DIR="${VENDOR_DIR}/paragraf"
MANIFEST_PATH="${PACKAGE_DIR}/manifest.json"
SOURCE_CHECKOUT_BACKUP_DIR=""

PARAGRAF_REPO_URL="${PARAGRAF_REPO_URL:-https://github.com/kadetr/paragraf.git}"
PARAGRAF_REF="${PARAGRAF_REF:-main}"

MODE="${1:-install}"
if [[ $# -gt 0 ]]; then
  shift
fi

REQUESTED_REF=""

# Keep this list in dependency order for npm install.
# Note: upstream currently does not expose 0-color as a workspace, so this
# script only installs the packages needed by TiptapAI's PDF pipeline today.
PACKAGE_WORKSPACES=(
  "0-types"
  "1a-linebreak"
  "1b-font-engine"
  "1c-layout"
  "1d-style"
  "2a-shaping-wasm"
  "2b-render-core"
  "3a-typography"
  "3b-render-pdf"
  "4a-template"
  "4b-compile"
)

usage() {
  cat <<'EOF'
Usage:
  ./install-update-paragraph.sh install [--ref <branch|tag|sha>] [--repo <url>]
  ./install-update-paragraph.sh update  [--ref <branch|tag|sha>] [--repo <url>]
  ./install-update-paragraph.sh status

What it does:
  - Clones or reuses vendor/paragraf-src
  - Removes the upstream demo workspace from the vendored checkout
  - Builds the required Paragraf workspaces
  - Packs them into vendor/paragraf/*.tgz
  - Installs those tarballs into this app via npm install

Examples:
  ./install-update-paragraph.sh install
  ./install-update-paragraph.sh update
  ./install-update-paragraph.sh update --ref main
  PARAGRAF_REF=v0.5.0 ./install-update-paragraph.sh update
EOF
}

log() {
  printf '[paragraf] %s\n' "$*"
}

fail() {
  printf '[paragraf] ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

is_git_branch_ref() {
  local ref="$1"
  git -C "$SOURCE_DIR" show-ref --verify --quiet "refs/remotes/origin/${ref}"
}

current_ref_label() {
  local branch
  branch="$(git -C "$SOURCE_DIR" rev-parse --abbrev-ref HEAD)"
  if [[ "$branch" == "HEAD" ]]; then
    git -C "$SOURCE_DIR" rev-parse --short HEAD
  else
    printf '%s' "$branch"
  fi
}

clone_source_if_missing() {
  if [[ -d "${SOURCE_DIR}/.git" ]]; then
    return
  fi

  mkdir -p "$VENDOR_DIR"
  log "Cloning ${PARAGRAF_REPO_URL} into ${SOURCE_DIR}"
  git clone "$PARAGRAF_REPO_URL" "$SOURCE_DIR"
}

backup_source_checkout_state() {
  if [[ -n "$SOURCE_CHECKOUT_BACKUP_DIR" ]]; then
    return
  fi

  SOURCE_CHECKOUT_BACKUP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/paragraf-src-backup.XXXXXX")"
  cp "$SOURCE_DIR/package.json" "$SOURCE_CHECKOUT_BACKUP_DIR/package.json"
  if [[ -f "$SOURCE_DIR/package-lock.json" ]]; then
    cp "$SOURCE_DIR/package-lock.json" "$SOURCE_CHECKOUT_BACKUP_DIR/package-lock.json"
  fi
}

sanitize_source_checkout() {
  backup_source_checkout_state
  log "Sanitizing vendored Paragraf checkout (excluding upstream demo workspace)"
  node - "$SOURCE_DIR/package.json" <<'EOF'
const fs = require('fs');

const packageJsonPath = process.argv[2];
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

if (Array.isArray(pkg.workspaces)) {
  pkg.workspaces = pkg.workspaces.filter((workspace) => workspace !== 'demo');
}

fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
EOF
}

reset_source_install_state() {
  rm -rf "$SOURCE_DIR/node_modules"
  rm -rf "$SOURCE_DIR/demo/node_modules"
}

ensure_clean_source_checkout() {
  local unmanaged_changes
  unmanaged_changes="$(
    git -C "$SOURCE_DIR" status --short | \
      grep -vE '^[[:space:]MADRCU?]{1,2} package-lock\.json$' || true
  )"

  if [[ -n "$unmanaged_changes" ]]; then
    fail "Source checkout at ${SOURCE_DIR} has local changes. Commit or discard them before updating."
  fi
}

checkout_ref() {
  local ref="$1"

  if is_git_branch_ref "$ref"; then
    log "Checking out origin/${ref}"
    git -C "$SOURCE_DIR" checkout -B "$ref" "origin/${ref}"
    return
  fi

  log "Checking out ${ref}"
  git -C "$SOURCE_DIR" checkout "$ref"
}

prepare_source_for_install() {
  clone_source_if_missing
  reset_source_install_state

  if [[ -n "$REQUESTED_REF" ]]; then
    log "Fetching refs before install"
    git -C "$SOURCE_DIR" fetch --tags origin
    checkout_ref "$REQUESTED_REF"
  fi
}

prepare_source_for_update() {
  clone_source_if_missing
  reset_source_install_state
  ensure_clean_source_checkout

  local target_ref="${REQUESTED_REF:-$PARAGRAF_REF}"

  log "Fetching latest refs from origin"
  git -C "$SOURCE_DIR" fetch --tags origin
  checkout_ref "$target_ref"
}

build_source() {
  sanitize_source_checkout
  reset_source_install_state

  log "Installing Paragraf workspace dependencies"
  (cd "$SOURCE_DIR" && npm install --no-audit --fund=false)

  log "Building Paragraf workspaces"
  (cd "$SOURCE_DIR" && npm run build)
}

cleanup_source_checkout() {
  if [[ ! -d "$SOURCE_DIR/node_modules" && ! -d "$SOURCE_DIR/demo/node_modules" && -z "$SOURCE_CHECKOUT_BACKUP_DIR" ]]; then
    return
  fi

  log "Cleaning temporary Paragraf build dependencies from vendored source checkout"
  rm -rf "$SOURCE_DIR/node_modules"
  rm -rf "$SOURCE_DIR/demo/node_modules"

  if [[ -n "$SOURCE_CHECKOUT_BACKUP_DIR" && -d "$SOURCE_CHECKOUT_BACKUP_DIR" ]]; then
    cp "$SOURCE_CHECKOUT_BACKUP_DIR/package.json" "$SOURCE_DIR/package.json"

    if [[ -f "$SOURCE_CHECKOUT_BACKUP_DIR/package-lock.json" ]]; then
      cp "$SOURCE_CHECKOUT_BACKUP_DIR/package-lock.json" "$SOURCE_DIR/package-lock.json"
    fi

    rm -rf "$SOURCE_CHECKOUT_BACKUP_DIR"
    SOURCE_CHECKOUT_BACKUP_DIR=""
  fi
}

pack_workspace() {
  local workspace_dir="$1"
  local tarball_name

  find "$workspace_dir" -maxdepth 1 -type f -name '*.tgz' -delete
  tarball_name="$(
    cd "$workspace_dir" && \
      npm pack --json | node -e 'const fs = require("fs"); const data = JSON.parse(fs.readFileSync(0, "utf8")); process.stdout.write(data[0].filename);'
  )"

  cp "${workspace_dir}/${tarball_name}" "${PACKAGE_DIR}/${tarball_name}"
  printf './vendor/paragraf/%s' "$tarball_name"
}

write_manifest() {
  local requested_ref="${REQUESTED_REF:-}"
  local commit
  local describe
  local ref_label

  commit="$(git -C "$SOURCE_DIR" rev-parse HEAD)"
  describe="$(git -C "$SOURCE_DIR" describe --always --tags)"
  ref_label="$(current_ref_label)"

  node - "$MANIFEST_PATH" "$PARAGRAF_REPO_URL" "$requested_ref" "$commit" "$describe" "$ref_label" "$@" <<'EOF'
const fs = require('fs');

const [
  ,
  ,
  manifestPath,
  repoUrl,
  requestedRef,
  commit,
  describe,
  refLabel,
  ...tarballs
] = process.argv;

const manifest = {
  repoUrl,
  requestedRef: requestedRef || null,
  resolvedRef: refLabel,
  commit,
  describe,
  generatedAt: new Date().toISOString(),
  tarballs,
};

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
EOF
}

install_tarballs_into_project() {
  local tarballs=("$@")

  log "Installing vendored Paragraf tarballs into TipTapAI"
  (
    cd "$ROOT_DIR"
    npm install "${tarballs[@]}"
  )
}

render_status() {
  log "Project root: ${ROOT_DIR}"

  if [[ -d "${SOURCE_DIR}/.git" ]]; then
    log "Source checkout: ${SOURCE_DIR}"
    log "Source ref: $(current_ref_label)"
    log "Source commit: $(git -C "$SOURCE_DIR" rev-parse --short HEAD)"
  else
    log "Source checkout: missing"
  fi

  if [[ -f "$MANIFEST_PATH" ]]; then
    log "Vendored packages manifest: ${MANIFEST_PATH}"
    node - "$MANIFEST_PATH" <<'EOF'
const fs = require('fs');
const manifestPath = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
console.log(`[paragraf] Manifest commit: ${manifest.describe}`);
console.log(`[paragraf] Generated at: ${manifest.generatedAt}`);
for (const tarball of manifest.tarballs) {
  console.log(`[paragraf] Tarball: ${tarball}`);
}
EOF
  else
    log "Vendored packages manifest: missing"
  fi
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --ref)
        [[ $# -ge 2 ]] || fail "--ref requires a value"
        REQUESTED_REF="$2"
        shift 2
        ;;
      --repo)
        [[ $# -ge 2 ]] || fail "--repo requires a value"
        PARAGRAF_REPO_URL="$2"
        shift 2
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        fail "Unknown argument: $1"
        ;;
    esac
  done
}

main() {
  trap cleanup_source_checkout EXIT

  require_command git
  require_command node
  require_command npm

  [[ -f "${ROOT_DIR}/package.json" ]] || fail "No package.json found at ${ROOT_DIR}"

  parse_args "$@"

  case "$MODE" in
    install)
      prepare_source_for_install
      build_source
      ;;
    update)
      prepare_source_for_update
      build_source
      ;;
    status)
      render_status
      exit 0
      ;;
    help|-h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown mode: ${MODE}"
      ;;
  esac

  mkdir -p "$PACKAGE_DIR"
  find "$PACKAGE_DIR" -maxdepth 1 -type f \( -name '*.tgz' -o -name 'manifest.json' \) -delete

  log "Packing Paragraf workspaces into ${PACKAGE_DIR}"
  relative_tarballs=()
  for workspace in "${PACKAGE_WORKSPACES[@]}"; do
    relative_tarballs+=("$(pack_workspace "${SOURCE_DIR}/${workspace}")")
  done

  write_manifest "${relative_tarballs[@]}"
  install_tarballs_into_project "${relative_tarballs[@]}"
  cleanup_source_checkout

  log "Done. Re-run this script later with 'update' to refresh Paragraf from upstream."
}

main "$@"
