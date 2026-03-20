import * as path from "path";
import { runTests } from "@vscode/test-electron";

const defaultCodeVersion = "1.73.0";

async function main() {
  const extensionDevelopmentPath = path.resolve(__dirname, "../../");
  const extensionTestsPath = path.resolve(__dirname, "../../out/test");
  const isHeadless = process.argv.includes("--headless");
  const launchArgs = isHeadless ? ["--headless"] : [];

  try {
    await runTests({
      version: process.env.CODE_VERSION || defaultCodeVersion,
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs
    });
  } catch (err) {
    const stack = err instanceof Error ? err.stack : undefined;
    console.error(
      `Failed to run tests: ${String(err)}${stack ? `\n${stack}` : ""}`
    );
    process.exit(1);
  }
}

main();
