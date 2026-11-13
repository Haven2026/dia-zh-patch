#!/bin/zsh

set -euo pipefail

readonly ROOT="$(cd -- "$(dirname -- "$0")/.." && pwd -P)"
readonly FIXTURE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/dia-zh-signing.XXXXXX")"
readonly APP="$FIXTURE_ROOT/Dia.app"
readonly ARC="$APP/Contents/Frameworks/ArcCore.framework"
readonly ARC_A="$ARC/Versions/A"

cleanup() {
  local code=$?
  rm -rf -- "$FIXTURE_ROOT"
  return "$code"
}
trap cleanup EXIT

make_info_plist() {
  local destination="$1" identifier="$2" executable="$3"
  mkdir -p "$(dirname -- "$destination")"
  plutil -create xml1 "$destination"
  /usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string $identifier" "$destination"
  /usr/libexec/PlistBuddy -c "Add :CFBundleExecutable string $executable" "$destination"
  /usr/libexec/PlistBuddy -c "Add :CFBundlePackageType string APPL" "$destination"
  /usr/libexec/PlistBuddy -c "Add :CFBundleVersion string 1" "$destination"
}

make_helper() {
  local name="$1" identifier="$2"
  local helper="$ARC_A/Helpers/$name.app"
  mkdir -p "$helper/Contents/MacOS"
  make_info_plist "$helper/Contents/Info.plist" "$identifier" "$name"
  xcrun clang -fobjc-arc -framework Foundation \
    "$ROOT/tests/fixtures/minimal-main.m" -o "$helper/Contents/MacOS/$name"
  touch "$helper/Contents/embedded.provisionprofile"
  codesign --force --sign - --timestamp=none --options runtime \
    --entitlements "$FIXTURE_ROOT/helper-jit.plist" "$helper" >/dev/null
}

mkdir -p "$APP/Contents/MacOS" "$ARC_A/Resources" "$ARC_A/Helpers"
make_info_plist "$APP/Contents/Info.plist" "test.dia.fixture" "Dia"
xcrun clang -fobjc-arc -framework Foundation \
  "$ROOT/tests/fixtures/minimal-main.m" -o "$APP/Contents/MacOS/Dia"

plutil -create xml1 "$ARC_A/Resources/Info.plist"
/usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string test.arccore.fixture" \
  "$ARC_A/Resources/Info.plist"
/usr/libexec/PlistBuddy -c "Add :CFBundleExecutable string ArcCore" \
  "$ARC_A/Resources/Info.plist"
/usr/libexec/PlistBuddy -c "Add :CFBundlePackageType string FMWK" \
  "$ARC_A/Resources/Info.plist"
/usr/libexec/PlistBuddy -c "Add :CFBundleVersion string 1" \
  "$ARC_A/Resources/Info.plist"
xcrun clang -dynamiclib "$ROOT/tests/fixtures/minimal-dylib.c" -o "$ARC_A/ArcCore"

for plist in helper.plist helper-jit.plist; do
  cp "$ROOT/native/entitlements/$plist" "$FIXTURE_ROOT/$plist"
  /usr/libexec/PlistBuddy -c "Add :com.apple.developer.aps-environment string production" \
    "$FIXTURE_ROOT/$plist"
done
make_helper "Browser Helper (GPU)" "test.dia.fixture.gpu"
make_helper "Browser Helper (Renderer)" "test.dia.fixture.renderer"

ln -s A "$ARC/Versions/Current"
ln -s Versions/Current/ArcCore "$ARC/ArcCore"
ln -s Versions/Current/Resources "$ARC/Resources"
codesign --force --sign - --timestamp=none --options runtime "$ARC" >/dev/null
touch "$APP/Contents/embedded.provisionprofile"
codesign --force --sign - --timestamp=none --options runtime \
  --entitlements "$FIXTURE_ROOT/helper.plist" "$APP" >/dev/null

"$ROOT/scripts/sign-app.zsh" "$APP" "$FIXTURE_ROOT/work"
codesign --verify --deep --strict "$APP"
for bundle in "$APP" "$ARC_A"/Helpers/*.app; do
  if [[ -e "$bundle/Contents/embedded.provisionprofile" ]]; then
    print -ru2 -- "重签后仍有配置描述文件：$bundle"
    exit 1
  fi
  codesign -d --entitlements :- "$bundle" > "$FIXTURE_ROOT/verified.plist" 2>/dev/null
  if /usr/libexec/PlistBuddy -c 'Print :com.apple.developer.aps-environment' \
    "$FIXTURE_ROOT/verified.plist" >/dev/null 2>&1; then
    print -ru2 -- "重签后仍有受限推送权限：$bundle"
    exit 1
  fi
done
"$APP/Contents/MacOS/Dia"
print -r -- "签名 Fixture 通过。"
