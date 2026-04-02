import * as path from "path";
import {
  commands,
  Disposable,
  ExtensionContext,
  l10n,
  OutputChannel,
  Uri,
  window
} from "vscode";
import { registerCommands } from "./commands";
import {
  setCommitMessageOutputChannel,
  setCommitMessageSecretStorage
} from "./aiCommitMessageService";
import { ConstructorPolicy } from "./common/types";
import { CheckActiveEditor } from "./contexts/checkActiveEditor";
import { OpenRepositoryCount } from "./contexts/openRepositoryCount";
import { configuration } from "./helpers/configuration";
import { ItemLogProvider } from "./historyView/itemLogProvider";
import { RepoLogProvider } from "./historyView/repoLogProvider";
import * as messages from "./messages";
import { SourceControlManager } from "./source_control_manager";
import { Svn } from "./svn";
import { SvnFinder } from "./svnFinder";
import SvnProvider from "./treeView/dataProviders/svnProvider";
import { toDisposable } from "./util";
import { BranchChangesProvider } from "./historyView/branchChangesProvider";
import { IsSvn19orGreater } from "./contexts/isSvn19orGreater";
import { IsSvn18orGreater } from "./contexts/isSvn18orGreater";
import { tempSvnFs } from "./temp_svn_fs";
import { SvnFileSystemProvider } from "./svnFileSystemProvider";

let sourceControlManagerReady: Promise<SourceControlManager> | undefined;

export interface SvnExtensionApi {
  getSourceControlManager(): Promise<SourceControlManager>;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }

  return String(err);
}

async function init(
  extensionContext: ExtensionContext,
  outputChannel: OutputChannel,
  disposables: Disposable[]
): Promise<SourceControlManager> {
  const pathHint = configuration.get<string>("path");
  const svnFinder = new SvnFinder();

  const info = await svnFinder.findSvn(pathHint);
  const svn = new Svn({ svnPath: info.path, version: info.version });
  const sourceControlManager = await new SourceControlManager(
    svn,
    ConstructorPolicy.Async,
    extensionContext
  );

  registerCommands(sourceControlManager, disposables);

  disposables.push(
    sourceControlManager,
    tempSvnFs,
    new SvnFileSystemProvider(sourceControlManager),
    new SvnProvider(sourceControlManager),
    new RepoLogProvider(sourceControlManager),
    new ItemLogProvider(sourceControlManager),
    new BranchChangesProvider(sourceControlManager),
    new CheckActiveEditor(sourceControlManager),
    new OpenRepositoryCount(sourceControlManager),
    new IsSvn18orGreater(info.version),
    new IsSvn19orGreater(info.version)
  );

  outputChannel.appendLine(`Using svn "${info.version}" from "${info.path}"`);

  const onOutput = (str: string) => outputChannel.append(str);
  svn.onOutput.addListener("log", onOutput);
  disposables.push(
    toDisposable(() => svn.onOutput.removeListener("log", onOutput))
  );
  disposables.push(toDisposable(messages.dispose));

  return sourceControlManager;
}

async function _activate(context: ExtensionContext, disposables: Disposable[]) {
  setCommitMessageSecretStorage(context.secrets);

  const outputChannel = window.createOutputChannel(l10n.t("SVN"));
  setCommitMessageOutputChannel(outputChannel);
  commands.registerCommand("svn.showOutput", () => outputChannel.show());
  disposables.push(outputChannel);

  const showOutput = configuration.get<boolean>("showOutput");

  if (showOutput) {
    outputChannel.show();
  }

  const tryInit = async () => {
    try {
      sourceControlManagerReady = init(context, outputChannel, disposables);
      await sourceControlManagerReady;
    } catch (err) {
      const errorMessage = getErrorMessage(err);

      if (!/Svn installation not found/.test(errorMessage)) {
        throw err;
      }

      const shouldIgnore =
        configuration.get<boolean>("ignoreMissingSvnWarning") === true;

      if (shouldIgnore) {
        return;
      }

      console.warn(errorMessage);
      outputChannel.appendLine(errorMessage);
      outputChannel.show();

      const findSvnExecutable = l10n.t("Find SVN executable");
      const download = l10n.t("Download SVN");
      const neverShowAgain = l10n.t("Don't Show Again");
      const choice = await window.showWarningMessage(
        l10n.t(
          "SVN not found. Install it or configure it using the 'svn.path' setting."
        ),
        findSvnExecutable,
        download,
        neverShowAgain
      );

      if (choice === findSvnExecutable) {
        let filters: { [name: string]: string[] } | undefined;

        // For windows, limit to executable files
        if (path.sep === "\\") {
          filters = {
            svn: ["exe", "bat"]
          };
        }

        const executable = await window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          filters
        });

        if (executable && executable[0]) {
          const file = executable[0].fsPath;

          outputChannel.appendLine(`Updated "svn.path" with "${file}"`);

          await configuration.update("path", file);

          // Try Re-init after select the executable
          await tryInit();
        }
      } else if (choice === download) {
        commands.executeCommand(
          "vscode.open",
          Uri.parse("https://subversion.apache.org/packages.html")
        );
      } else if (choice === neverShowAgain) {
        await configuration.update("ignoreMissingSvnWarning", true);
      }
    }
  };

  await tryInit();
}

export async function activate(
  context: ExtensionContext
): Promise<SvnExtensionApi> {
  const disposables: Disposable[] = [];
  context.subscriptions.push(
    new Disposable(() => Disposable.from(...disposables).dispose())
  );

  const activationReady = _activate(context, disposables).catch(err => {
    console.error(err);
  });

  await activationReady;

  return {
    async getSourceControlManager(): Promise<SourceControlManager> {
      if (!sourceControlManagerReady) {
        throw new Error("Source control manager is not initialized.");
      }

      return sourceControlManagerReady;
    }
  };
}

// this method is called when your extension is deactivated
// eslint-disable-next-line @typescript-eslint/no-empty-function
function deactivate() {}
exports.deactivate = deactivate;
