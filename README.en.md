# Dia Simplified Chinese Patch

An unofficial Simplified Chinese localization patch for Dia on Apple Silicon
Macs running macOS 14+. The published `v0.1.0-rc.2` pre-release includes full
mode for Dia `1.41.1 (84131)`. This branch adds a full-mode resource baseline
for Dia `1.57.1 (90935)`. Installation and restoration were checked on an
official app copy. Launch, sign-in and visual checks are pending. Core mode
has also been tested on Dia `1.44.1 (85212)`.

Download the macOS arm64 ZIP from GitHub Releases, verify its SHA-256 file,
quit Dia, then double-click `dia-zh.command`. To use the 90935 changes, build
from this branch with `./scripts/build-menu.zsh` and run `./dia-zh.command audit`
before applying the patch. The stable commands are `apply`, `audit`, `status`,
and `restore`.

The installer automatically selects `full`, `core`, or `incompatible`
coverage. Unknown but structurally compatible official builds use the safe
core mode and never receive old WebUI replacements. Set `DIA_ZH_MODE=core` to
skip WebUI patching on a known build.

The patch preserves Dia's automatic updater. After an official update, stale
patch state is superseded and an older backup will never overwrite the newer
build.

This repository contains patch source, translations, tests, and hash
manifests only. It does not distribute Dia, official JS/HTML, user data,
backups, reports, or official binaries. The arm64 menu library is built by
GitHub Actions for Release archives.

See the [Chinese README](README.md) for installation, Code 6 troubleshooting,
signing details, recovery, and development instructions.
