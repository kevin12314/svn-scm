import { l10n, SourceControlResourceState, window } from "vscode";
import { Command } from "./command";

export class Remove extends Command {
  constructor() {
    super("svn.remove");
  }

  public async execute(...resourceStates: SourceControlResourceState[]) {
    const selection = await this.getResourceStates(resourceStates);

    if (selection.length === 0) {
      return;
    }

    let keepLocal: boolean;
    const yes = l10n.t("Yes");
    const answer = await window.showWarningMessage(
      l10n.t("Would you like to keep a local copy of the files?"),
      { modal: true },
      yes,
      l10n.t("No")
    );

    if (!answer) {
      return;
    }

    if (answer === yes) {
      keepLocal = true;
    } else {
      keepLocal = false;
    }

    const uris = selection.map(resource => resource.resourceUri);

    await this.runByRepository(uris, async (repository, resources) => {
      if (!repository) {
        return;
      }

      const paths = resources.map(resource => resource.fsPath);

      try {
        await repository.removeFiles(paths, keepLocal);
      } catch (error) {
        console.log(error);
        window.showErrorMessage(l10n.t("Unable to remove files"));
      }
    });
  }
}
