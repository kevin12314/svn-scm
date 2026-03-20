import { l10n, window } from "vscode";
import { selectBranch } from "../helpers/branch";
import { Repository } from "../repository";
import { isSvnErrorLike } from "../util";
import { Command } from "./command";

export class SwitchBranch extends Command {
  constructor() {
    super("svn.switchBranch", { repository: true });
  }

  public async execute(repository: Repository) {
    const branch = await selectBranch(repository, true);

    if (!branch) {
      return;
    }

    try {
      if (branch.isNew) {
        const commitMessage = await window.showInputBox({
          value: l10n.t("Created new branch {0}", branch.name),
          prompt: l10n.t("Commit message for create branch {0}", branch.name)
        });

        // If press ESC on commit message
        if (commitMessage === undefined) {
          return;
        }

        await repository.newBranch(branch.path, commitMessage);
      } else {
        try {
          await repository.switchBranch(branch.path);
        } catch (error) {
          if (
            isSvnErrorLike(error) &&
            error.stderrFormated?.includes("ignore-ancestry")
          ) {
            const yes = l10n.t("Yes");
            const answer = await window.showErrorMessage(
              l10n.t(
                "Seems like these branches don't have a common ancestor. Do you want to retry with '--ignore-ancestry' option?"
              ),
              yes,
              l10n.t("No")
            );
            if (answer === yes) {
              await repository.switchBranch(branch.path, true);
            }
          } else {
            throw error;
          }
        }
      }
    } catch (error) {
      console.log(error);
      if (branch.isNew) {
        window.showErrorMessage(l10n.t("Unable to create new branch"));
      } else {
        window.showErrorMessage(l10n.t("Unable to switch branch"));
      }
    }
  }
}
