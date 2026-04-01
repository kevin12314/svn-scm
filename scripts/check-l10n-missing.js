(async function main() {
  const fs = await import("fs");
  const path = await import("path");
  const ts = await import("typescript");
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

  function collectRuntimeKeys(files) {
    const keys = new Set();

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, "utf8");
      const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true
      );

      visitNode(sourceFile, node => {
        if (!ts.isCallExpression(node) || node.arguments.length === 0) {
          return;
        }

        if (!isL10nCall(node.expression)) {
          return;
        }

        collectStringLiteralKeys(node.arguments[0], keys);
      });
    }

    return [...keys].sort((left, right) => left.localeCompare(right));
  }

  function visitNode(node, visitor) {
    visitor(node);
    ts.forEachChild(node, child => visitNode(child, visitor));
  }

  function isL10nCall(expression) {
    if (
      !ts.isPropertyAccessExpression(expression) ||
      expression.name.text !== "t"
    ) {
      return false;
    }

    const target = expression.expression;

    if (ts.isIdentifier(target) && target.text === "l10n") {
      return true;
    }

    return (
      ts.isPropertyAccessExpression(target) &&
      target.name.text === "l10n" &&
      ts.isIdentifier(target.expression) &&
      target.expression.text === "vscode"
    );
  }

  function collectStringLiteralKeys(node, keys) {
    if (ts.isStringLiteralLike(node)) {
      keys.add(node.text);
      return;
    }

    if (ts.isConditionalExpression(node)) {
      collectStringLiteralKeys(node.whenTrue, keys);
      collectStringLiteralKeys(node.whenFalse, keys);
      return;
    }

    if (ts.isParenthesizedExpression(node)) {
      collectStringLiteralKeys(node.expression, keys);
      return;
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
    ) {
      collectStringLiteralKeys(node.left, keys);
      collectStringLiteralKeys(node.right, keys);
    }
  }

  function diffMissingKeys(keys, translations) {
    return keys.filter(key => !(key in translations));
  }

  function diffExtraKeys(keys, translations) {
    return Object.keys(translations)
      .filter(key => !keys.includes(key))
      .sort((left, right) => left.localeCompare(right));
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

  const runtimeKeys = collectRuntimeKeys(sourceFiles);
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

  const reportSections = locales.flatMap(locale => {
    const bundlePath = `l10n/bundle.l10n${locale.suffix}.json`;
    const packagePath = `package.nls${locale.suffix}.json`;
    const bundleTranslations = readJson(bundlePath);
    const packageTranslations = readJson(packagePath);
    const runtimeMissing = diffMissingKeys(runtimeKeys, bundleTranslations);
    const runtimeExtra = diffExtraKeys(runtimeKeys, bundleTranslations);
    const manifestMissing = diffMissingKeys(manifestKeys, packageTranslations);
    const manifestExtra = diffExtraKeys(manifestKeys, packageTranslations);

    return [
      {
        title: `Runtime keys missing from ${bundlePath}`,
        keys: runtimeMissing
      },
      {
        title: `Runtime keys extra in ${bundlePath}`,
        keys: runtimeExtra
      },
      {
        title: `Manifest keys missing from ${packagePath}`,
        keys: manifestMissing
      },
      {
        title: `Manifest keys extra in ${packagePath}`,
        keys: manifestExtra
      }
    ];
  });

  for (const section of reportSections) {
    printSection(section.title, section.keys);
  }

  if (reportSections.some(section => section.keys.length > 0)) {
    process.exitCode = 1;
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
