import { commands, l10n, window } from "vscode";
import { configuration } from "../helpers/configuration";
import { SourceControlManager } from "../source_control_manager";
import { fixPathSeparator } from "../util";
import { Command } from "./command";

export class Upgrade extends Command {
  constructor() {
    super("svn.upgrade");
  }

  public async execute(folderPath: string) {
    if (!folderPath) {
      return;
    }

    if (configuration.get("ignoreWorkingCopyIsTooOld", false)) {
      return;
    }

    folderPath = fixPathSeparator(folderPath);

    const yes = l10n.t("Yes");
    const no = l10n.t("No");
    const neverShowAgain = l10n.t("Don't Show Again");
    const choice = await window.showWarningMessage(
      l10n.t("You want upgrade the working copy (svn upgrade)?"),
      yes,
      no,
      neverShowAgain
    );
    const sourceControlManager = (await commands.executeCommand(
      "svn.getSourceControlManager",
      ""
    )) as SourceControlManager;

    if (choice === yes) {
      const upgraded = await sourceControlManager.upgradeWorkingCopy(
        folderPath
      );

      if (upgraded) {
        window.showInformationMessage(
          l10n.t('Working copy "{0}" upgraded', folderPath)
        );
        sourceControlManager.tryOpenRepository(folderPath);
      } else {
        window.showErrorMessage(
          l10n.t(
            'Error on upgrading working copy "{0}". See log for more detail',
            folderPath
          )
        );
      }
    } else if (choice === neverShowAgain) {
      return configuration.update("ignoreWorkingCopyIsTooOld", true);
    }

    return;
  }
}
