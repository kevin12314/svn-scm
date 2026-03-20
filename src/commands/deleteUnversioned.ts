import { l10n, SourceControlResourceState, window } from "vscode";
import { exists, lstat, unlink } from "../fs";
import { deleteDirectory } from "../util";
import { Command } from "./command";

export class DeleteUnversioned extends Command {
  constructor() {
    super("svn.deleteUnversioned");
  }

  public async execute(...resourceStates: SourceControlResourceState[]) {
    const selection = await this.getResourceStates(resourceStates);
    if (selection.length === 0) {
      return;
    }
    const uris = selection.map(resource => resource.resourceUri);
    const answer = await window.showWarningMessage(
      l10n.t("Would you like to delete selected files?"),
      { modal: true },
      l10n.t("Yes"),
      l10n.t("No")
    );
    if (answer === l10n.t("Yes")) {
      for (const uri of uris) {
        const fsPath = uri.fsPath;

        try {
          if (!(await exists(fsPath))) {
            continue;
          }

          const stat = await lstat(fsPath);

          if (stat.isDirectory()) {
            deleteDirectory(fsPath);
          } else {
            await unlink(fsPath);
          }
        } catch {
          // TODO(cjohnston) Show meaningful error to user
        }
      }
    }
  }
}
