import * as assert from "assert";
import * as fs from "original-fs";
import * as path from "path";
import { Uri, window, workspace } from "vscode";
import { SourceControlManager } from "../source_control_manager";
import * as testUtil from "./testUtil";

suite("Repository Tests", () => {
  let repoUri: Uri;
  let checkoutDir: Uri;
  let sourceControlManager: SourceControlManager;

  suiteSetup(async () => {
    await testUtil.activeExtension();

    repoUri = await testUtil.createRepoServer();
    await testUtil.createStandardLayout(testUtil.getSvnUrl(repoUri));
    checkoutDir = await testUtil.createRepoCheckout(
      testUtil.getSvnUrl(repoUri) + "/trunk"
    );

    sourceControlManager = await testUtil.getSourceControlManager();
  });

  suiteTeardown(() => {
    sourceControlManager.openRepositories.forEach(repository =>
      repository.dispose()
    );
    testUtil.destroyAllTempPaths();
  });

  test("Empty Open Repository", async function () {
    assert.strictEqual(sourceControlManager.repositories.length, 0);
  });

  test("Try Open Repository", async function () {
    await sourceControlManager.tryOpenRepository(checkoutDir.fsPath);
    assert.strictEqual(sourceControlManager.repositories.length, 1);
  });

  test("Try Open Repository Again", async () => {
    await sourceControlManager.tryOpenRepository(checkoutDir.fsPath);
    assert.strictEqual(sourceControlManager.repositories.length, 1);
  });

  test("Try get repository from Uri", () => {
    const repository = sourceControlManager.getRepository(checkoutDir);
    assert.ok(repository);
  });

  test("Try get repository from string", () => {
    const repository = sourceControlManager.getRepository(checkoutDir.fsPath);
    assert.ok(repository);
  });

  test("Try get repository from repository", () => {
    const repository = sourceControlManager.getRepository(checkoutDir.fsPath);
    const repository2 = sourceControlManager.getRepository(repository);
    assert.ok(repository2);
    assert.strictEqual(repository, repository2);
  });

  test("Try get current branch name", async () => {
    const repository = await testUtil.getOrOpenRepository(
      sourceControlManager,
      checkoutDir.fsPath
    );

    const name = await repository.getCurrentBranch();
    assert.strictEqual(name, "trunk");
  });

  test("Try commit file", async function () {
    this.timeout(60000);
    const repository = await testUtil.getOrOpenRepository(
      sourceControlManager,
      checkoutDir.fsPath
    );

    assert.strictEqual(repository.changes.resourceStates.length, 0);

    const file = path.join(checkoutDir.fsPath, "new.txt");

    fs.writeFileSync(file, "test");

    const document = await workspace.openTextDocument(file);
    await window.showTextDocument(document);

    await repository.addFiles([file]);

    assert.strictEqual(repository.changes.resourceStates.length, 1);

    const message = await repository.commitFiles("First Commit", [file]);
    assert.ok(/1 file committed: revision (.*)\./i.test(message));

    assert.strictEqual(repository.changes.resourceStates.length, 0);

    const remoteContent = await repository.show(file, "HEAD");
    assert.strictEqual(remoteContent, "test");
  });

  test("Try switch branch", async function () {
    this.timeout(60000);
    const newCheckoutDir = await testUtil.createRepoCheckout(
      testUtil.getSvnUrl(repoUri) + "/trunk"
    );

    await sourceControlManager.tryOpenRepository(newCheckoutDir.fsPath);

    const newRepository = await testUtil.getOrOpenRepository(
      sourceControlManager,
      newCheckoutDir.fsPath
    );
    assert.ok(newRepository);

    await newRepository.newBranch("branches/test");
    const currentBranch = await newRepository.getCurrentBranch();

    assert.strictEqual(currentBranch, "branches/test");
  });
});
