import * as path from "path";
import { commands, l10n, Uri, window, workspace } from "vscode";
import { Repository } from "../repository";
import { Resource } from "../resource";
import { SourceControlManager } from "../source_control_manager";
import { Command } from "./command";

interface IMergeEditorAcceptResult {
  successful: boolean;
}

export class CompleteMerge extends Command {
  constructor() {
    super("svn.completeMerge");
  }

  public async execute(resource?: Resource | Uri): Promise<void> {
    const expectedUri =
      resource instanceof Resource ? resource.resourceUri : resource;
    const mergeResultUri = this.getActiveMergeResultUri();

    if (!mergeResultUri) {
      window.showWarningMessage(
        l10n.t("Open the conflict in Merge Editor before completing the merge.")
      );
      return;
    }

    if (
      expectedUri instanceof Uri &&
      expectedUri.scheme === "file" &&
      expectedUri.fsPath !== mergeResultUri.fsPath
    ) {
      window.showWarningMessage(
        l10n.t(
          'The active Merge Editor does not match "{0}".',
          path.basename(expectedUri.fsPath)
        )
      );
      return;
    }

    const sourceControlManager = (await commands.executeCommand(
      "svn.getSourceControlManager",
      ""
    )) as SourceControlManager;
    const repository = sourceControlManager.getRepository(mergeResultUri);

    if (!repository) {
      window.showWarningMessage(
        l10n.t(
          'The active Merge Editor result "{0}" is not in an SVN repository.',
          path.basename(mergeResultUri.fsPath)
        )
      );
      return;
    }

    const document = workspace.textDocuments.find(
      doc => doc.uri.toString() === mergeResultUri.toString()
    );

    if (document?.isDirty) {
      await document.save();
    }

    const accepted = await commands.executeCommand<IMergeEditorAcceptResult>(
      "mergeEditor.acceptMerge"
    );

    if (!accepted?.successful) {
      return;
    }

    await this.resolveAsWorking(repository, [mergeResultUri]);

    window.showInformationMessage(
      l10n.t(
        'Merge completed and "{0}" was marked as resolved.',
        path.basename(mergeResultUri.fsPath)
      )
    );
  }

  private getActiveMergeResultUri(): Uri | undefined {
    const activeTab = window.tabGroups.activeTabGroup?.activeTab;
    const input = activeTab?.input as { result?: Uri } | undefined;

    if (input?.result instanceof Uri && input.result.scheme === "file") {
      return input.result;
    }

    return;
  }

  private async resolveAsWorking(
    repository: Repository,
    resources: Uri[]
  ): Promise<void> {
    const files = resources.map(resource => resource.fsPath);
    await repository.resolve(files, "working");
  }
}
