import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const indexPath = path.join(root, "manifests", "index.json");
const stringsPath = path.join(root, "translations", "zh-Hans.strings");
const menuKeysPath = path.join(root, "translations", "menu-keys.txt");
const menuSourcePath = path.join(root, "native", "DiaZhMenu.m");
const commandPath = path.join(root, "dia-zh.command");
const signHelperPath = path.join(root, "scripts", "sign-app.zsh");
const helperPath = path.join(root, "scripts", "patch-webui.jxa");
const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
const strings = fs.readFileSync(stringsPath, "utf8");
const menuKeys = fs.readFileSync(menuKeysPath, "utf8").trim().split(/\r?\n/);
const menuSource = fs.readFileSync(menuSourcePath, "utf8");
const command = fs.readFileSync(commandPath, "utf8");
const signHelper = fs.readFileSync(signHelperPath, "utf8");
const helper = fs.readFileSync(helperPath, "utf8");
const builds = [
  { version: "1.41.1", build: "84131", files: 180, rules: 87 },
  { version: "1.57.1", build: "90935", files: 160, rules: 139 },
];
assert.equal(index.schemaVersion, 1);
assert.equal(index.knownBuilds.length, builds.length);
const manifests = builds.map(({ version, build, files, rules }, indexPosition) => {
  const stem = `manifests/${version}-${build}`;
  const entry = index.knownBuilds[indexPosition];
  assert.deepEqual(entry, {
    shortVersion: version,
    buildVersion: build,
    coverage: "full",
    manifest: `${stem}.json`,
    originalWebHashes: `${stem}.webui-original.sha256`,
    patchedWebHashes: `${stem}.webui-patched.sha256`,
  });
  const manifest = JSON.parse(fs.readFileSync(path.join(root, entry.manifest), "utf8"));
  const originalHashes = fs.readFileSync(path.join(root, entry.originalWebHashes), "utf8").trim().split("\n");
  const patchedHashes = fs.readFileSync(path.join(root, entry.patchedWebHashes), "utf8").trim().split("\n");
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.shortVersion, version);
  assert.equal(manifest.buildVersion, build);
  assert.equal(manifest.architecture, "arm64");
  assert.equal(manifest.bundleIdentifier, "company.thebrowser.dia");
  assert.equal(manifest.officialTeamIdentifier, "S6N382Y83G");
  assert.equal(manifest.webRules.length, rules);
  assert.equal(manifest.criticalFiles.length, 9);
  for (const file of manifest.criticalFiles) {
    assert.ok(file.path.startsWith("Contents/"), "critical path must stay inside app");
    assert.ok(file.bytes > 0, "critical file size must be positive");
  }
  assert.ok(manifest.chromiumLocale.source.includes("zh_CN.lproj"));
  assert.ok(manifest.chromiumLocale.destination.includes("en.lproj"));
  assert.ok(manifest.webRoots.length >= 4);
  assert.deepEqual(manifest.webExtensions.sort(), [".html", ".js"]);
  assert.equal(manifest.webRootExpectations.length, manifest.webRoots.length);
  for (const root of manifest.webRoots) {
    const expectation = manifest.webRootExpectations.find((item) => item.path === root);
    assert.ok(expectation, `missing file-count expectation for ${root}`);
    assert.ok(expectation.expectedTextFiles > 0, `invalid file count for ${root}`);
  }
  assert.ok(manifest.minimumTotalWebMatches >= 1);
  assert.equal(manifest.maximumTotalWebMatches, manifest.minimumTotalWebMatches);
  assert.equal(
    manifest.webHashManifests.original,
    entry.originalWebHashes
  );
  assert.equal(
    manifest.webHashManifests.patched,
    entry.patchedWebHashes
  );

  const ids = manifest.webRules.map((rule) => rule.id);
  assert.equal(new Set(ids).size, ids.length, "WebUI rule ids must be unique");
  for (const rule of manifest.webRules) {
    assert.ok(rule.source.length > 2, `${rule.id}: source is too broad`);
    assert.ok(rule.target.length > 0, `${rule.id}: missing target`);
    assert.ok(rule.expectedMatches > 0, `${rule.id}: invalid expectedMatches`);
    assert.ok(
      rule.expectedPatchedMatches >= rule.expectedMatches,
      `${rule.id}: invalid expectedPatchedMatches`
    );
    assert.ok(rule.files.length > 0, `${rule.id}: missing file scope`);
    assert.equal(
      rule.files.reduce((sum, file) => sum + file.matches, 0),
      rule.expectedMatches,
      `${rule.id}: per-file counts do not add up`
    );
    for (const file of rule.files) {
      assert.ok(file.path.startsWith("Contents/Resources/"), `${rule.id}: unsafe file path`);
      assert.ok(file.matches > 0, `${rule.id}: invalid per-file count`);
      assert.ok(file.patchedMatches > 0, `${rule.id}: invalid patched per-file count`);
    }
    assert.equal(
      rule.files.reduce((sum, file) => sum + file.patchedMatches, 0),
      rule.expectedPatchedMatches,
      `${rule.id}: patched per-file counts do not add up`
    );
    assert.ok(strings.includes(`"${rule.source}" = "${rule.target}";`),
      `${rule.id}: translation must also exist in Localizable.strings`);
  }
  assert.equal(
    manifest.webRules.reduce((sum, rule) => sum + rule.expectedMatches, 0),
    manifest.minimumTotalWebMatches
  );
  assert.equal(
    manifest.webRules.reduce((sum, rule) => sum + rule.expectedPatchedMatches, 0),
    manifest.expectedTotalPatchedMatches
  );

  assert.equal(originalHashes.length, files);
  assert.equal(patchedHashes.length, files);
  const hashPattern = /^[a-f0-9]{64}  Contents\/Resources\/.+\.(?:js|html)$/;
  assert.ok(originalHashes.every((line) => hashPattern.test(line)));
  assert.ok(patchedHashes.every((line) => hashPattern.test(line)));
  const originalHashPaths = originalHashes.map((line) => line.slice(66));
  const patchedHashPaths = patchedHashes.map((line) => line.slice(66));
  assert.deepEqual(originalHashPaths, patchedHashPaths);
  assert.equal(new Set(originalHashPaths).size, originalHashPaths.length);
  for (const expectation of manifest.webRootExpectations) {
    assert.equal(
      originalHashPaths.filter((file) => file.startsWith(`${expectation.path}/`)).length,
      expectation.expectedTextFiles,
      `hash inventory count mismatch for ${expectation.path}`
    );
  }
  for (const rule of manifest.webRules) {
    assert.ok(
      rule.files.every((file) => originalHashPaths.includes(file.path)),
      `${rule.id}: rule file missing from hash inventory`
    );
  }
  assert.ok(
    originalHashes.some((line, index) => line !== patchedHashes[index]),
    "at least one WebUI file must change"
  );

  return manifest;
});

const stringEntries = [...strings.matchAll(/^"((?:\\.|[^"])*)"\s*=\s*"((?:\\.|[^"])*)";$/gm)];
assert.equal(stringEntries.length, 512, "translation catalog count changed unexpectedly");
const stringKeys = stringEntries.map((entry) => entry[1]);
const duplicateKeys = stringKeys.filter((key, index) => stringKeys.indexOf(key) !== index);
assert.deepEqual([...new Set(duplicateKeys)], [], "Localizable.strings contains duplicate keys");
function placeholders(value) {
  return [
    ...value.matchAll(/%(?:\d+\$)?[@dfius]|\{[^}]+\}|\\\([^)]+\)/g)
  ].map((match) => match[0]).sort();
}
for (const entry of stringEntries) {
  assert.deepEqual(
    placeholders(entry[2]),
    placeholders(entry[1]),
    `placeholder mismatch for ${entry[1]}`
  );
}

const catalog = new Map(stringEntries.map((entry) => [entry[1], entry[2]]));
assert.equal(menuKeys.length, 156);
assert.equal(new Set(menuKeys).size, menuKeys.length, "menu keys must be unique");
for (const key of menuKeys) {
  assert.ok(catalog.has(key), `menu key missing from unified catalog: ${key}`);
}
assert.equal(catalog.get("View"), "显示");
assert.equal(catalog.get("Bring All to Front"), "前置全部窗口");
assert.equal(catalog.get("Merge All Windows"), "合并所有窗口");
assert.equal(catalog.get("%@ — %@ Tabs"), "%@ — %@ 个标签页");
assert.ok(menuSource.includes('DiaZhResourcePath(@"zh-Hans.strings")'));
assert.ok(menuSource.includes('DiaZhResourcePath(@"menu-keys.txt")'));
assert.ok(menuSource.includes('DiaZhProtectedMenuKeys'));
assert.ok(menuSource.includes('@"Status", @"Help", @"Window"'));
assert.ok(
  !/@"(?:\\.|[^"])*"\s*:\s*@"(?:\\.|[^"])*"/.test(menuSource),
  "Objective-C must not contain a second translation dictionary"
);

for (const subcommand of ["apply", "audit", "status", "restore"]) {
  assert.ok(command.includes(`${subcommand})`), `missing ${subcommand} command`);
}
assert.ok(command.startsWith("#!/bin/zsh"));
assert.ok(command.includes("codesign --verify --deep --strict"));
assert.ok(command.includes("ditto -c -k --sequesterRsrc --keepParent"));
assert.ok(command.includes("DIA_ZH_ASSUME_SMOKE_OK"));
assert.ok(command.includes("DIA_ZH_MODE=core"));
assert.ok(command.includes('SCHEMA_VERSION=2'));
assert.ok(command.includes('COVERAGE_MODE='));
assert.ok(command.includes("archive_superseded_state"));
assert.ok(command.includes("拒绝用旧备份覆盖"));
assert.ok(command.includes("verify_web_hash_manifest original"));
assert.ok(command.includes("verify_web_hash_manifest patched"));
assert.ok(signHelper.includes("capture_entitlements"));
assert.ok(signHelper.includes("sign_all"));
assert.ok(signHelper.includes("com.apple.application-identifier"));
assert.ok(signHelper.includes("com.apple.security.cs.allow-jit"));
assert.ok(signHelper.includes("com.apple.security.cs.allow-dyld-environment-variables"));
assert.ok(signHelper.includes("com.apple.security.cs.disable-library-validation"));
assert.ok(signHelper.includes('codesign --verify --deep --strict'));
assert.ok(helper.includes("expectedMatches"));
assert.ok(helper.includes("remainingSourceMatches"));
assert.ok(helper.includes("minimumTotalWebMatches"));
assert.ok(helper.includes("expectedTextFiles"));
assert.ok(helper.includes("writeUtf8Atomic"));
assert.ok(!helper.includes("eval("));
new Function(helper.replace(/^#!.*\n/, ""));

function variants(rule) {
  const escapedSource = rule.source.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const escapedTarget = rule.target.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const singleSource = rule.source.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const singleTarget = rule.target.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return [
    [`"${escapedSource}"`, `"${escapedTarget}"`],
    [`'${singleSource}'`, `'${singleTarget}'`],
    [`>${rule.source}<`, `>${rule.target}<`],
    [`&quot;${rule.source}&quot;`, `&quot;${rule.target}&quot;`]
  ];
}

const fixtureRule = manifests[0].webRules.find((rule) => rule.source === "Add context");
let fixture = 'const label="Add context"; const identifier=Add context; <span>Add context</span>';
for (const [find, replacement] of variants(fixtureRule)) {
  fixture = fixture.split(find).join(replacement);
}
assert.ok(fixture.includes('"添加上下文"'));
assert.ok(fixture.includes(">添加上下文<"));
assert.ok(fixture.includes("identifier=Add context"), "unquoted code must not be replaced");
const once = fixture;
for (const [find, replacement] of variants(fixtureRule)) {
  fixture = fixture.split(find).join(replacement);
}
assert.equal(fixture, once, "WebUI replacements must be idempotent");

const newChatGreeting = manifests[1].webRules.find((rule) => rule.source === "What can I help with?");
assert.ok(newChatGreeting.files.some((file) => file.path.includes("/app/immutable/nodes/")));
assert.equal(catalog.get(newChatGreeting.source), newChatGreeting.target);

console.log(`Validated ${stringEntries.length} translations and ${manifests.reduce((sum, manifest) => sum + manifest.webRules.length, 0)} WebUI rules across ${manifests.length} builds.`);
