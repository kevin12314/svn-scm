import { l10n, Uri, window } from "vscode";
import { Command } from "./command";

export class Lock extends Command {
  constructor() {
    super("svn.lock");
  }

  public async execute(resourceUri?: Uri) {
    const uri =
      resourceUri ||
      this.getUriFromActiveTab() ||
      window.activeTextEditor?.document.uri;

    if (!uri) {
      window.showErrorMessage(l10n.t("No file is currently open"));
      return;
    }

    if (uri.scheme !== "file") {
      window.showErrorMessage(
        l10n.t("Can only lock files from the file system")
      );
      return;
    }

    await this.runByRepository(uri, async (repository, resource) => {
      const filePath = resource.fsPath;

      try {
        await repository.lock([filePath]);
        window.showInformationMessage(
          l10n.t("Successfully locked {0}", filePath)
        );
      } catch (error) {
        console.log(error);
        window.showErrorMessage(l10n.t("Unable to lock file: {0}", `${error}`));
      }
    });
  }
}
