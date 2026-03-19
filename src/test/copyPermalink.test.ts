import * as assert from "assert";
import * as fs from "original-fs";
import * as path from "path";
import { commands, env, Uri, window, workspace } from "vscode";
import { SourceControlManager } from "../source_control_manager";
import { Repository } from "../repository";
import * as testUtil from "./testUtil";
import { timeout } from "../util";

suite("Copy Permalink Tests", () => {
  let repoUri: Uri;
  let checkoutDir: Uri;
  let sourceControlManager: SourceControlManager;
  let testFilePath: string;

  suiteSetup(async function () {
    this.timeout(30000);

    await testUtil.activeExtension();

    repoUri = await testUtil.createRepoServer();
    await testUtil.createStandardLayout(testUtil.getSvnUrl(repoUri));
    checkoutDir = await testUtil.createRepoCheckout(
      testUtil.getSvnUrl(repoUri) + "/trunk"
    );

    sourceControlManager = (await commands.executeCommand(
      "svn.getSourceControlManager",
      checkoutDir
    )) as SourceControlManager;

    await sourceControlManager.tryOpenRepository(checkoutDir.fsPath);

    testFilePath = path.join(checkoutDir.fsPath, "test_permalink.txt");
    fs.writeFileSync(testFilePath, "test content for permalink");

    const repository = sourceControlManager.getRepository(
      checkoutDir
    ) as Repository;

    await commands.executeCommand("svn.refresh");

    const resource = repository.unversioned.resourceStates.find(
      entry => entry.resourceUri.fsPath === testFilePath
    );
    if (resource) {
      await commands.executeCommand("svn.add", resource);
    }

    repository.inputBox.value = "Add test file for permalink";
    await commands.executeCommand("svn.commitWithMessage");
    await timeout(1000);
  });

  suiteTeardown(() => {
    sourceControlManager.openRepositories.forEach(repository =>
      repository.dispose()
    );
    testUtil.destroyAllTempPaths();
  });

  test("Copy Permalink - Success", async function () {
    this.timeout(10000);

    const document = await workspace.openTextDocument(testFilePath);
    await window.showTextDocument(document);

    const clipboard = (env as any).clipboard;
    if (clipboard) {
      await clipboard.writeText("");
    }

    await commands.executeCommand("svn.copyPermalink");

    await timeout(200);

    if (clipboard) {
      const copiedText = await clipboard.readText();

      if (copiedText) {
        assert.ok(
          /^file:\/\/\/.+\/svn_server_[^/]+\/trunk\/test_permalink\.txt\?p=2&r=2$/.test(
            copiedText
          ),
          `Permalink should match expected format: ${copiedText}`
        );
      }
    }
  });

  test("Copy Permalink - No Active Editor", async function () {
    this.timeout(10000);

    await commands.executeCommand("workbench.action.closeAllEditors");
    await timeout(200);

    await commands.executeCommand("svn.copyPermalink");
    await timeout(200);
  });

  test("Copy Permalink - Modified File", async function () {
    this.timeout(10000);

    const originalContent = fs.readFileSync(testFilePath, "utf8");

    const document = await workspace.openTextDocument(testFilePath);
    await window.showTextDocument(document);

    fs.appendFileSync(testFilePath, "\nmodified content");
    await timeout(200);

    const clipboard = (env as any).clipboard;
    if (clipboard) {
      await clipboard.writeText("");
    }

    await commands.executeCommand("svn.copyPermalink");
    await timeout(200);

    if (clipboard) {
      const copiedText = await clipboard.readText();

      if (copiedText) {
        assert.ok(copiedText.includes("?p="));
      }
    }

    fs.writeFileSync(testFilePath, originalContent);
  });

  test("Copy Permalink - Binary File From Active Tab", async function () {
    this.timeout(20000);

    const binaryFilePath = path.join(checkoutDir.fsPath, "test_permalink.lib");
    const binaryData = Buffer.from([
      0x7f,
      0x45,
      0x4c,
      0x46,
      0x02,
      0x01,
      0x01,
      0x00,
      0xff,
      0x00,
      0x10,
      0x20,
      0x30,
      0x40,
      0x50,
      0x60
    ]);
    fs.writeFileSync(binaryFilePath, binaryData);

    const repository = sourceControlManager.getRepository(
      checkoutDir
    ) as Repository;

    await commands.executeCommand("svn.refresh");
    await timeout(200);
    await repository.addFiles([binaryFilePath]);
    await repository.commitFiles("Add binary file for permalink test", [
      binaryFilePath
    ]);
    await timeout(500);

    await commands.executeCommand("vscode.open", Uri.file(binaryFilePath));
    await timeout(500);

    const clipboard = (env as any).clipboard;
    if (clipboard) {
      await clipboard.writeText("");
    }

    await commands.executeCommand("svn.copyPermalink");
    await timeout(200);

    if (clipboard) {
      const copiedText = await clipboard.readText();
      if (copiedText) {
        assert.ok(copiedText.includes("test_permalink.lib"), copiedText);
        assert.ok(copiedText.includes("?p="), copiedText);
      }
    }
  });
});
