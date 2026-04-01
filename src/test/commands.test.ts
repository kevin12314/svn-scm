import * as assert from "assert";
import * as fs from "original-fs";
import * as path from "path";
import { commands, Uri, window, workspace } from "vscode";
import { __test__ as aiCommitMessageTest } from "../aiCommitMessageService";
import { ISvnResourceGroup, Status } from "../common/types";
import { Resource } from "../resource";
import { SourceControlManager } from "../source_control_manager";
import * as testUtil from "./testUtil";
import { timeout } from "../util";

function runSvn(
  args: string[],
  cwd: string,
  allowedExitCodes: number[] = [0]
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = testUtil.spawn("svn", args, { cwd });
    let stderr = "";

    proc.stderr?.on("data", data => {
      stderr += data.toString();
    });

    proc.once("error", reject);
    proc.once("exit", exitCode => {
      if (typeof exitCode === "number" && allowedExitCodes.includes(exitCode)) {
        resolve();
        return;
      }

      reject(
        new Error(
          `svn ${args.join(" ")} failed with exit code ${String(exitCode)}${
            stderr ? `: ${stderr}` : ""
          }`
        )
      );
    });
  });
}

async function runStep(
  name: string,
  action: () => Promise<void>
): Promise<void> {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${name}: ${message}`);
  }
}

function runSvnCapture(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = testUtil.spawn("svn", args, { cwd });
    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", data => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", data => {
      stderr += data.toString();
    });

    proc.once("error", reject);
    proc.once("exit", exitCode => {
      if (exitCode === 0) {
        resolve(stdout);
        return;
      }

      reject(
        new Error(
          `svn ${args.join(" ")} failed with exit code ${String(exitCode)}${
            stderr ? `: ${stderr}` : ""
          }`
        )
      );
    });
  });
}

function createJsonResponse(status: number, payload?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () =>
      typeof payload === "undefined" ? "" : JSON.stringify(payload)
  } as Response;
}

async function collectAsyncIterable<T>(values: T[]): Promise<AsyncIterable<T>> {
  async function* iterator() {
    for (const value of values) {
      yield value;
    }
  }

  return iterator();
}

suite("Commands Tests", () => {
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

    await sourceControlManager.tryOpenRepository(checkoutDir.fsPath);
  });

  suiteTeardown(() => {
    sourceControlManager.openRepositories.forEach(repository =>
      repository.dispose()
    );
    testUtil.destroyAllTempPaths();
  });

  test("File Open", async function () {
    const file = path.join(checkoutDir.fsPath, "new.txt");
    fs.writeFileSync(file, "test");

    await commands.executeCommand("svn.fileOpen", Uri.file(file));
  });

  test("Add File", async function () {
    const repository = await testUtil.getOrOpenRepository(
      sourceControlManager,
      checkoutDir
    );

    await commands.executeCommand("svn.refresh");
    assert.equal(repository.unversioned.resourceStates.length, 1);
    assert.equal(repository.changes.resourceStates.length, 0);

    const resource = repository.unversioned.resourceStates[0];

    await commands.executeCommand("svn.add", resource);

    assert.equal(repository.unversioned.resourceStates.length, 0);
    assert.equal(repository.changes.resourceStates.length, 1);
  });

  test("Sanitize AI Commit Message Reasoning", function () {
    const response = [
      "**Crafting SVN commit message**",
      "",
      "I need to create an SVN commit message in Traditional Chinese.",
      "",
      "**Creating commit message**",
      "",
      "I'm crafting a commit message for removing outdated entryComponents definitions.",
      "移除 Angular 模組中過時的 entryComponents 定義",
      "",
      "已調整多個 chpac/platform module，刪除或註解 entryComponents 條目。"
    ].join("\n");

    assert.strictEqual(
      aiCommitMessageTest.sanitizeCommitMessageResponse(response),
      [
        "移除 Angular 模組中過時的 entryComponents 定義",
        "",
        "已調整多個 chpac/platform module，刪除或註解 entryComponents 條目。"
      ].join("\n")
    );
  });

  test("Sanitize AI Commit Message Lead-In And Commentary", function () {
    const response = [
      'The commit message I’ll use is: "新增 VS Code Java 除錯設定".',
      "",
      "If necessary, I could include a short description or list of changes, but I'm thinking keeping it simple is probably fine!",
      "",
      "已加入：",
      "- .vscode",
      "- .vscode/launch.json"
    ].join("\n");

    assert.strictEqual(
      aiCommitMessageTest.sanitizeCommitMessageResponse(response),
      [
        "新增 VS Code Java 除錯設定",
        "",
        "已加入：",
        "- .vscode",
        "- .vscode/launch.json"
      ].join("\n")
    );
  });

  test("Sanitize Common English Commit Message Lead-In Variants", function () {
    const cases = [
      {
        input: 'Here is the commit message: "Add Java debug launch config"',
        expected: "Add Java debug launch config"
      },
      {
        input: "Suggested commit message: Add Java debug launch config",
        expected: "Add Java debug launch config"
      },
      {
        input:
          "A concise commit message would be: Add Java debug launch config",
        expected: "Add Java debug launch config"
      },
      {
        input: "Subject: Add Java debug launch config",
        expected: "Add Java debug launch config"
      },
      {
        input: "Commit message - Add Java debug launch config",
        expected: "Add Java debug launch config"
      }
    ];

    for (const testCase of cases) {
      assert.strictEqual(
        aiCommitMessageTest.sanitizeCommitMessageResponse(testCase.input),
        testCase.expected
      );
    }
  });

  test("Sanitize English Commentary Around Commit Message", function () {
    const response = [
      "Here is the commit message:",
      "Add Java debug launch config",
      "",
      "This keeps it concise and clear.",
      "Let me know if you'd like a more detailed version."
    ].join("\n");

    assert.strictEqual(
      aiCommitMessageTest.sanitizeCommitMessageResponse(response),
      "Add Java debug launch config"
    );
  });

  test("Build Prompt Uses English Instructions", async function () {
    const config = workspace.getConfiguration("svn");
    const previousOutputLanguage = config.get(
      "commitMessageGeneration.outputLanguage"
    );

    try {
      await config.update(
        "commitMessageGeneration.outputLanguage",
        "zh-TW",
        true
      );

      const prompt = aiCommitMessageTest.buildPrompt({
        repository: {
          repository: {
            removeAbsolutePath: (filePath: string) => path.basename(filePath)
          }
        } as any,
        resources: [
          new Resource(
            Uri.file(path.join(checkoutDir.fsPath, "new.txt")),
            Status.MODIFIED
          )
        ],
        fallbackMessage: "Update new.txt",
        diff: "@@ -1 +1 @@\n-old\n+new"
      });

      assert.ok(prompt.includes("You generate SVN commit messages."));
      assert.ok(
        prompt.includes("Write the commit message in Traditional Chinese.")
      );
      assert.ok(prompt.includes("Return only the final commit message text."));
      assert.ok(prompt.includes("Changed files:"));
      assert.ok(prompt.includes("Template fallback draft:"));
      assert.ok(prompt.includes("Unified diff (possibly truncated):"));
      assert.equal(prompt.includes("你產生 SVN 提交訊息"), false);
    } finally {
      await config.update(
        "commitMessageGeneration.outputLanguage",
        previousOutputLanguage,
        true
      );
    }
  });

  test("Build Prompt Messages Splits Instructions And Context", async function () {
    const messages = aiCommitMessageTest.buildPromptMessages({
      repository: {
        repository: {
          removeAbsolutePath: (filePath: string) => path.basename(filePath)
        }
      } as any,
      resources: [
        new Resource(
          Uri.file(path.join(checkoutDir.fsPath, "new.txt")),
          Status.MODIFIED
        )
      ],
      fallbackMessage: "Update new.txt",
      diff: "@@ -1 +1 @@\n-old\n+new"
    });

    assert.equal(messages.length, 2);
    assert.ok(messages[0].includes("You generate SVN commit messages."));
    assert.ok(
      messages[0].includes("Return only the final commit message text.")
    );
    assert.ok(messages[1].includes("Changed files:"));
    assert.ok(messages[1].includes("Template fallback draft:"));
    assert.ok(messages[1].includes("Unified diff (possibly truncated):"));
  });

  test("Read Response Text Prefers Text Stream", async function () {
    const response = {
      text: await collectAsyncIterable(["final ", "message"]),
      stream: await collectAsyncIterable([
        {
          value: "reasoning that should be ignored"
        }
      ])
    };

    const text = await aiCommitMessageTest.readResponseText(response);
    assert.strictEqual(text, "final message");
  });

  test("OpenAI Provider Returns Missing API Key For 401 Without Secret", async function () {
    const result = await aiCommitMessageTest.generateOpenAICompatibleCommitMessageForTests(
      "prompt",
      {
        baseUrl: "https://example.test/v1",
        model: "gpt-test",
        apiType: "responses",
        fetchFn: async () => createJsonResponse(200, { output_text: "unused" })
      }
    );

    assert.strictEqual(result.reason, "missing-api-key");
  });

  test("OpenAI Provider Returns Http Error For 429", async function () {
    const result = await aiCommitMessageTest.generateOpenAICompatibleCommitMessageForTests(
      "prompt",
      {
        apiKey: "test-key",
        baseUrl: "https://example.test/v1",
        model: "gpt-test",
        apiType: "responses",
        fetchFn: async () =>
          createJsonResponse(429, {
            error: {
              message: "Rate limit exceeded"
            }
          })
      }
    );

    assert.strictEqual(result.reason, "http-error");
    assert.deepStrictEqual(result.error, {
      error: {
        message: "Rate limit exceeded"
      }
    });
  });

  test("OpenAI Provider Returns Error For Empty Response Body", async function () {
    const result = await aiCommitMessageTest.generateOpenAICompatibleCommitMessageForTests(
      "prompt",
      {
        apiKey: "test-key",
        baseUrl: "https://example.test/v1",
        model: "gpt-test",
        apiType: "responses",
        fetchFn: async () => createJsonResponse(200)
      }
    );

    assert.strictEqual(result.reason, "error");
  });

  test("OpenAI Provider Falls Back From Responses To Chat Completions", async function () {
    const requestedPaths: string[] = [];
    const result = await aiCommitMessageTest.generateOpenAICompatibleCommitMessageForTests(
      "prompt",
      {
        apiKey: "test-key",
        baseUrl: "https://example.test/v1",
        model: "gpt-test",
        apiType: "auto",
        fetchFn: async (input: RequestInfo | URL) => {
          const url = String(input);
          requestedPaths.push(new URL(url, "https://example.test").pathname);

          if (url.endsWith("/responses")) {
            return createJsonResponse(429, {
              error: {
                message: "Rate limit exceeded"
              }
            });
          }

          return createJsonResponse(200, {
            choices: [
              {
                message: {
                  content: "**Creating commit message**\n\nUpdate fallback path"
                }
              }
            ]
          });
        }
      }
    );

    assert.deepStrictEqual(requestedPaths, [
      "/v1/responses",
      "/v1/chat/completions"
    ]);
    assert.strictEqual(result.message, "Update fallback path");
  });

  test("Commit Single File", async function () {
    const repository = await testUtil.getOrOpenRepository(
      sourceControlManager,
      checkoutDir
    );
    repository.inputBox.value = "First Commit";

    await commands.executeCommand("svn.commitWithMessage");
  });

  test("Update", async function () {
    await commands.executeCommand("svn.update");
  });

  test("Show Log", async function () {
    await commands.executeCommand("svn.log");
  });

  test("Open Changes", async function () {
    const file = path.join(checkoutDir.fsPath, "new.txt");
    fs.writeFileSync(file, "test 2");
    const uri = Uri.file(file);

    await commands.executeCommand("svn.refresh");
    await commands.executeCommand("svn.openChangeBase", uri);
    await commands.executeCommand("svn.openChangeHead", uri);
  });

  test("Open File", async function () {
    const file = path.join(checkoutDir.fsPath, "new.txt");
    const uri = Uri.file(file);

    await commands.executeCommand("svn.openFile", uri);
    await commands.executeCommand("svn.openHEADFile", uri);
  });

  test("Open Diff (Double click o source control)", async function () {
    const repository = await testUtil.getOrOpenRepository(
      sourceControlManager,
      checkoutDir
    );

    await commands.executeCommand("svn.refresh");
    assert.equal(repository.changes.resourceStates.length, 1);

    const resource = repository.changes.resourceStates[0];

    await commands.executeCommand("svn.openResourceBase", resource);
    await commands.executeCommand("svn.openResourceHead", resource);
  });

  test("Generate Commit Message", async function () {
    const repository = await testUtil.getOrOpenRepository(
      sourceControlManager,
      checkoutDir
    );

    await commands.executeCommand("svn.refresh");
    await commands.executeCommand("svn.generateCommitMessage");

    assert.ok(repository.inputBox.value.includes("Update new.txt"));
    assert.ok(repository.inputBox.value.includes("Modified:"));
    assert.ok(repository.inputBox.value.includes("- new.txt"));
  });

  test("Generate Commit Message For Selected Files", async function () {
    const repository = await testUtil.getOrOpenRepository(
      sourceControlManager,
      checkoutDir
    );
    const newFile = path.join(checkoutDir.fsPath, "new.txt");
    const extraFile = path.join(checkoutDir.fsPath, "extra.txt");

    fs.writeFileSync(newFile, "test 3");
    fs.writeFileSync(extraFile, "extra test");

    await commands.executeCommand("svn.add", Uri.file(extraFile));
    await commands.executeCommand("svn.refresh");
    await commands.executeCommand("svn.generateCommitMessage", repository, [
      newFile
    ]);

    assert.ok(repository.inputBox.value.includes("Update new.txt"));
    assert.ok(repository.inputBox.value.includes("- new.txt"));
    assert.ok(!repository.inputBox.value.includes("extra.txt"));
  });

  test("Add Changelist", async function () {
    const repository = await testUtil.getOrOpenRepository(
      sourceControlManager,
      checkoutDir
    );

    await commands.executeCommand("svn.refresh");
    assert.equal(repository.changes.resourceStates.length, 1);

    const resource = repository.changes.resourceStates[0];

    testUtil.overrideNextShowQuickPick(0);
    testUtil.overrideNextShowInputBox("changelist-test");

    await commands.executeCommand("svn.changelist", resource);
    assert.ok(repository.changelists.has("changelist-test"));
  });

  test("Remove Changelist", async function () {
    const repository = await testUtil.getOrOpenRepository(
      sourceControlManager,
      checkoutDir
    );

    const group = repository.changelists.get(
      "changelist-test"
    ) as ISvnResourceGroup;
    const resource = group.resourceStates[0];

    testUtil.overrideNextShowQuickPick(3);

    await commands.executeCommand("svn.changelist", resource);
    assert.equal(group.resourceStates.length, 0);
  });

  test("Show Patch", async function () {
    await commands.executeCommand("svn.patch");
  });

  test("Commit Selected File", async function () {
    const repository = await testUtil.getOrOpenRepository(
      sourceControlManager,
      checkoutDir
    );

    await commands.executeCommand("svn.refresh");
    assert.equal(repository.changes.resourceStates.length, 1);

    const resource = repository.changes.resourceStates[0];

    setTimeout(() => {
      commands.executeCommand("svn.forceCommitMessageTest", "Second Commit");
    }, 1000);
    await commands.executeCommand("svn.commit", resource);

    assert.equal(repository.changes.resourceStates.length, 0);
  });

  test("Commit Multiple", async function () {
    const file1 = path.join(checkoutDir.fsPath, "file1.txt");
    fs.writeFileSync(file1, "test");
    await commands.executeCommand("svn.openFile", Uri.file(file1));

    const file2 = path.join(checkoutDir.fsPath, "file2.txt");
    fs.writeFileSync(file2, "test");
    await commands.executeCommand("svn.openFile", Uri.file(file2));

    const repository = await testUtil.getOrOpenRepository(
      sourceControlManager,
      checkoutDir
    );
    repository.inputBox.value = "Multiple Files Commit";

    await commands.executeCommand("svn.refresh");
    await commands.executeCommand(
      "svn.add",
      repository.unversioned.resourceStates[0]
    );
    await commands.executeCommand("svn.refresh");
    await commands.executeCommand(
      "svn.add",
      repository.unversioned.resourceStates[0]
    );
    await commands.executeCommand("svn.refresh");

    testUtil.overrideNextShowQuickPick(0);

    await commands.executeCommand("svn.commitWithMessage");
  });

  test("Commit Missing Folder Removes From SVN", async function () {
    this.timeout(30000);

    const repository = await testUtil.getOrOpenRepository(
      sourceControlManager,
      checkoutDir
    );

    const config = workspace.getConfiguration("svn");
    const previousDeleteAction = config.get("delete.actionForDeletedFiles");
    await config.update("delete.actionForDeletedFiles", "none", true);

    const folder = path.join(checkoutDir.fsPath, "impl");

    try {
      fs.mkdirSync(folder);

      await repository.addFiles([folder]);
      await repository.status();
      await timeout(200);

      await repository.commitFiles("Add impl folder", [folder]);
      await repository.status();
      await timeout(200);

      fs.rmdirSync(folder);

      await commands.executeCommand("svn.refresh");
      await timeout(1200);

      const missingResource = repository.changes.resourceStates.find(
        resource =>
          resource instanceof Object &&
          (resource as any).type === Status.MISSING
      );

      assert.ok(missingResource);

      testUtil.overrideNextShowWarningMessage("Continue");
      setTimeout(() => {
        commands.executeCommand(
          "svn.forceCommitMessageTest",
          "Remove impl folder"
        );
      }, 1000);

      await commands.executeCommand("svn.commit", missingResource);
      await repository.status();
      await timeout(500);

      assert.equal(
        repository.changes.resourceStates.some(
          resource => (resource as any).resourceUri.fsPath === folder
        ),
        false
      );

      let deletedFromRemote = false;
      try {
        await repository.repository.exec([
          "ls",
          `${repository.repository.info.url}/impl`
        ]);
      } catch {
        deletedFromRemote = true;
      }

      assert.equal(deletedFromRemote, true);
    } finally {
      await config.update(
        "delete.actionForDeletedFiles",
        previousDeleteAction,
        true
      );
    }
  });

  test("New Branch", async function () {
    testUtil.overrideNextShowQuickPick(0);
    testUtil.overrideNextShowQuickPick(1);
    testUtil.overrideNextShowInputBox("test");
    testUtil.overrideNextShowInputBox("Created new branch test");
    await commands.executeCommand("svn.switchBranch");

    // Wait run updateRemoteChangedFiles
    await timeout(2000);

    const repository = await testUtil.getOrOpenRepository(
      sourceControlManager,
      checkoutDir
    );
    assert.equal(await repository.getCurrentBranch(), "branches/test");
  });

  test("Switch Branch", async function () {
    this.timeout(5000);
    testUtil.overrideNextShowQuickPick(2);
    await commands.executeCommand("svn.switchBranch");

    // Wait run updateRemoteChangedFiles
    await timeout(2000);

    const repository = await testUtil.getOrOpenRepository(
      sourceControlManager,
      checkoutDir
    );
    assert.equal(await repository.getCurrentBranch(), "trunk");
  });

  test("Lock File", async function () {
    const file = path.join(checkoutDir.fsPath, "new.txt");
    const uri = Uri.file(file);

    await commands.executeCommand("vscode.open", uri);
    await commands.executeCommand("svn.lock");
  });

  test("Lock Binary File from Active Tab", async function () {
    this.timeout(20000);

    const binaryFile = path.join(checkoutDir.fsPath, "test_lock.lib");
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
    fs.writeFileSync(binaryFile, binaryData);

    const repository = await testUtil.getOrOpenRepository(
      sourceControlManager,
      checkoutDir
    );

    await commands.executeCommand("svn.refresh");
    await timeout(200);

    await repository.addFiles([binaryFile]);
    await repository.status();
    await timeout(200);

    const svnPath = repository.repository.removeAbsolutePath(binaryFile);
    await repository.repository.exec([
      "propset",
      "svn:needs-lock",
      "1",
      svnPath
    ]);
    await timeout(200);

    await repository.commitFiles("Add binary file for active tab lock test", [
      binaryFile
    ]);
    await timeout(500);

    await commands.executeCommand("vscode.open", Uri.file(binaryFile));
    await timeout(500);

    const errorMessages: string[] = [];
    const infoMessages: string[] = [];
    const originalShowErrorMessage = window.showErrorMessage;
    const originalShowInformationMessage = window.showInformationMessage;

    window.showErrorMessage = async (message: string, ...items: any[]) => {
      errorMessages.push(String(message));
      return originalShowErrorMessage(message, ...items);
    };
    window.showInformationMessage = async (
      message: string,
      ...items: any[]
    ) => {
      infoMessages.push(String(message));
      return originalShowInformationMessage(message, ...items);
    };

    try {
      await commands.executeCommand("svn.lock");
      await timeout(200);
    } finally {
      window.showErrorMessage = originalShowErrorMessage;
      window.showInformationMessage = originalShowInformationMessage;
    }

    assert.equal(errorMessages.length, 0, errorMessages.join("; "));
    assert.ok(
      infoMessages.some(message => message.includes("Successfully locked")),
      infoMessages.join("; ")
    );
  });

  test("Conflict Resource Uses Merge Editor Command", async function () {
    this.timeout(120000);

    const repository = await testUtil.getOrOpenRepository(
      sourceControlManager,
      checkoutDir
    );
    const conflictFileName = `merge-editor-conflict-${Date.now()}.txt`;
    const conflictFile = path.join(checkoutDir.fsPath, conflictFileName);

    await runStep("create base conflict file", async () => {
      fs.writeFileSync(conflictFile, "base\n");
    });
    await runStep("add base conflict file", async () => {
      await repository.addFiles([conflictFile]);
    });
    await runStep("commit base conflict file", async () => {
      await repository.commitFiles("Add merge editor conflict fixture", [
        conflictFile
      ]);
    });
    await timeout(500);

    const secondCheckoutDir = await testUtil.createRepoCheckout(
      testUtil.getSvnUrl(repoUri) + "/trunk"
    );
    const secondConflictFile = path.join(
      secondCheckoutDir.fsPath,
      conflictFileName
    );

    await runStep("write remote conflicting change", async () => {
      fs.writeFileSync(secondConflictFile, "incoming change\n");
    });
    await runStep("commit remote conflicting change", async () => {
      await runSvn(
        ["commit", "-m", "Remote conflicting change"],
        secondCheckoutDir.fsPath
      );
    });
    await timeout(500);

    await runStep("write local conflicting change", async () => {
      fs.writeFileSync(conflictFile, "local change\n");
    });
    await runStep("update to produce conflict", async () => {
      await runSvn(["update"], checkoutDir.fsPath, [0, 1]);
    });
    const statusOutput = await runSvnCapture(["status"], checkoutDir.fsPath);
    const conflictArtifacts = fs
      .readdirSync(checkoutDir.fsPath)
      .filter(entry => entry.startsWith(`${conflictFileName}.`));
    const conflictResource = new Resource(
      Uri.file(conflictFile),
      Status.CONFLICTED
    );

    assert.ok(statusOutput.includes(conflictFileName), statusOutput);
    assert.ok(/(^|\r?\n)C\s+/.test(statusOutput), statusOutput);
    assert.strictEqual(conflictResource.command.command, "svn.openMergeEditor");
    assert.ok(conflictArtifacts.length >= 2, conflictArtifacts.join(", "));
  });
});
