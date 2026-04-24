#!/usr/bin/env bash
set -euo pipefail

REPO="${1:-${GITHUB_REPOSITORY:-violin86318/youmind-seedance-sync}}"
RUNNER_NAME="${RUNNER_NAME:-$(hostname -s)-youmind-sync}"
RUNNER_LABELS="${RUNNER_LABELS:-youmind-sync,lark-sync}"
RUNNER_BASE_DIR="${RUNNER_BASE_DIR:-${HOME}/.local/share/github-runners}"
RUNNER_DIR="${RUNNER_BASE_DIR}/$(echo "${REPO}" | tr '/' '-')"
PLIST_PATH="${HOME}/Library/LaunchAgents/com.github.actions.${REPO//\//-}.plist"

mkdir -p "${RUNNER_BASE_DIR}"

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64)
    RUNNER_PLATFORM="osx-arm64"
    ;;
  Darwin-x86_64)
    RUNNER_PLATFORM="osx-x64"
    ;;
  Linux-x86_64)
    RUNNER_PLATFORM="linux-x64"
    ;;
  Linux-aarch64)
    RUNNER_PLATFORM="linux-arm64"
    ;;
  *)
    echo "Unsupported platform: $(uname -s)-$(uname -m)" >&2
    exit 1
    ;;
esac

TAG="$(gh api repos/actions/runner/releases/latest --jq .tag_name)"
VERSION="${TAG#v}"
ARCHIVE="actions-runner-${RUNNER_PLATFORM}-${VERSION}.tar.gz"
DOWNLOAD_URL="https://github.com/actions/runner/releases/download/${TAG}/${ARCHIVE}"

if [[ ! -x "${RUNNER_DIR}/run.sh" ]]; then
  rm -rf "${RUNNER_DIR}"
  mkdir -p "${RUNNER_DIR}"
  curl -L "${DOWNLOAD_URL}" -o "${RUNNER_DIR}/${ARCHIVE}"
  tar -xzf "${RUNNER_DIR}/${ARCHIVE}" -C "${RUNNER_DIR}"
  rm -f "${RUNNER_DIR}/${ARCHIVE}"
fi

cd "${RUNNER_DIR}"

if [[ ! -f .runner ]]; then
  REG_TOKEN="$(gh api -X POST "repos/${REPO}/actions/runners/registration-token" --jq .token)"
  ./config.sh \
    --url "https://github.com/${REPO}" \
    --token "${REG_TOKEN}" \
    --name "${RUNNER_NAME}" \
    --labels "${RUNNER_LABELS}" \
    --work "_work" \
    --unattended \
    --replace
fi

cat > "${PLIST_PATH}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.github.actions.${REPO//\//-}</string>
    <key>ProgramArguments</key>
    <array>
      <string>${RUNNER_DIR}/run.sh</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${RUNNER_DIR}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${RUNNER_DIR}/runner.log</string>
    <key>StandardErrorPath</key>
    <string>${RUNNER_DIR}/runner.err.log</string>
    <key>EnvironmentVariables</key>
    <dict>
      <key>HOME</key>
      <string>${HOME}</string>
      <key>PATH</key>
      <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
  </dict>
</plist>
EOF

launchctl unload "${PLIST_PATH}" >/dev/null 2>&1 || true
launchctl load "${PLIST_PATH}"

echo "Runner ready:"
echo "  repo: ${REPO}"
echo "  dir: ${RUNNER_DIR}"
echo "  name: ${RUNNER_NAME}"
echo "  labels: ${RUNNER_LABELS}"
echo "  launch agent: ${PLIST_PATH}"
