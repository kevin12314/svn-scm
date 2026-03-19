import { Repository } from "../repository";
import { Command } from "./command";
import { l10n, window } from "vscode";

export class RemoveUnversioned extends Command {
  constructor() {
    super("svn.removeUnversioned", { repository: true });
  }

  public async execute(repository: Repository) {
    const yes = l10n.t("Yes");
    const answer = await window.showWarningMessage(
      l10n.t(
        "Are you sure? This will remove all unversioned files except for ignored."
      ),
      { modal: true },
      yes,
      l10n.t("No")
    );
    if (answer !== yes) {
      return;
    }
    await repository.removeUnversioned();
  }
}
