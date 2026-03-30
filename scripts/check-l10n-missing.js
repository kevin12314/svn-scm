(async function main() {
  const fs = await import("fs");
  const path = await import("path");
  const workspaceRoot = path.resolve(__dirname, "..");

  function readJson(relativePath) {
    const filePath = path.join(workspaceRoot, relativePath);
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  }

  function walkFiles(startDir, predicate, results = []) {
    for (const entry of fs.readdirSync(startDir, { withFileTypes: true })) {
      const filePath = path.join(startDir, entry.name);
      if (entry.isDirectory()) {
        walkFiles(filePath, predicate, results);
        continue;
      }

      if (predicate(filePath)) {
        results.push(filePath);
      }
    }

    return results;
  }

  function collectMatches(files, regex) {
    const keys = new Set();

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, "utf8");
      regex.lastIndex = 0;

      for (const match of content.matchAll(regex)) {
        keys.add(match[1]);
      }
    }

    return [...keys].sort((left, right) => left.localeCompare(right));
  }

  function diffKeys(keys, translations) {
    return keys.filter(key => !(key in translations));
  }

  function collectManifestKeys(value, keys = new Set()) {
    if (Array.isArray(value)) {
      for (const item of value) {
        collectManifestKeys(item, keys);
      }

      return keys;
    }

    if (value && typeof value === "object") {
      for (const nestedValue of Object.values(value)) {
        collectManifestKeys(nestedValue, keys);
      }

      return keys;
    }

    if (typeof value === "string") {
      const match = value.match(/^%([^%\r\n]+)%$/);

      if (match) {
        keys.add(match[1]);
      }
    }

    return keys;
  }

  function printSection(title, keys) {
    console.log(`\n${title}`);

    if (keys.length === 0) {
      console.log("  None");
      return;
    }

    for (const key of keys) {
      console.log(`  - ${key}`);
    }
  }

  const sourceFiles = walkFiles(path.join(workspaceRoot, "src"), filePath =>
    /\.(ts|js)$/.test(filePath)
  );

  const runtimeKeys = collectMatches(sourceFiles, /l10n\.t\(\s*"([^"]+)"/g);
  const packageManifest = readJson("package.json");
  const manifestKeys = [
    ...collectManifestKeys(packageManifest)
  ].sort((left, right) => left.localeCompare(right));

  const locales = [
    { id: "en", suffix: "", label: "English" },
    { id: "zh-cn", suffix: ".zh-cn", label: "Simplified Chinese" },
    { id: "zh-tw", suffix: ".zh-tw", label: "Traditional Chinese" },
    { id: "ko", suffix: ".ko", label: "Korean" },
    { id: "ja", suffix: ".ja", label: "Japanese" }
  ];

  const missingSections = locales.flatMap(locale => {
    const bundlePath = `l10n/bundle.l10n${locale.suffix}.json`;
    const packagePath = `package.nls${locale.suffix}.json`;
    const runtimeMissing = diffKeys(runtimeKeys, readJson(bundlePath));
    const manifestMissing = diffKeys(manifestKeys, readJson(packagePath));

    return [
      {
        title: `Runtime keys missing from ${bundlePath}`,
        keys: runtimeMissing
      },
      {
        title: `Manifest keys missing from ${packagePath}`,
        keys: manifestMissing
      }
    ];
  });

  for (const section of missingSections) {
    printSection(section.title, section.keys);
  }

  if (missingSections.some(section => section.keys.length > 0)) {
    process.exitCode = 1;
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
