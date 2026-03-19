import { commands, env, l10n, window } from "vscode";
import { SourceControlManager } from "../source_control_manager";
import { Command } from "./command";

export class CopyPermalink extends Command {
  constructor() {
    super("svn.copyPermalink");
  }

  public async execute(): Promise<void> {
    const editor = window.activeTextEditor;
    if (!editor) {
      window.showErrorMessage(l10n.t("No active editor"));
      return;
    }

    const fileUri = editor.document.uri;
    if (fileUri.scheme !== "file") {
      window.showErrorMessage(l10n.t("File is not a local file"));
      return;
    }

    const sourceControlManager = (await commands.executeCommand(
      "svn.getSourceControlManager",
      ""
    )) as SourceControlManager;

    const repository = await sourceControlManager.getRepositoryFromUri(fileUri);
    if (!repository) {
      window.showErrorMessage(l10n.t("File is not in an SVN repository"));
      return;
    }

    try {
      const info = await repository.getInfo(fileUri.fsPath);

      if (!info || !info.url || !info.commit || !info.commit.revision) {
        window.showErrorMessage(
          l10n.t("Could not retrieve SVN information for this file")
        );
        return;
      }

      const revision = info.commit.revision;
      const permalink = `${info.url}?p=${revision}&r=${revision}`;

      const clipboard = (env as any).clipboard;
      if (clipboard === undefined) {
        window.showErrorMessage(
          l10n.t("Clipboard is supported in VS Code 1.30 and newer")
        );
        return;
      }

      await clipboard.writeText(permalink);
      window.showInformationMessage(
        l10n.t("Permalink copied to clipboard (revision {0})", revision)
      );
    } catch (error) {
      window.showErrorMessage(l10n.t("Failed to copy permalink: {0}", `${error}`));
    }
  }
}