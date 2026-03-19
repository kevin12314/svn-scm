import { posix as path } from "path";
import { Command } from "./command";
import { commands, l10n, Uri, window } from "vscode";
import { Repository } from "../repository";
import { toSvnUri } from "../uri";
import { SvnUriAction } from "../common/types";

export class SearchLogByRevision extends Command {
  constructor() {
    super("svn.searchLogByRevision", { repository: true });
  }

  public async execute(repository: Repository) {
    const input = await window.showInputBox({ prompt: l10n.t("Revision?") });
    if (!input) {
      return;
    }

    const revision = parseInt(input, 10);
    if (!revision || !/^\+?(0|[1-9]\d*)$/.test(input)) {
      window.showErrorMessage(l10n.t("Invalid revision"));
      return;
    }

    try {
      const resource = toSvnUri(
        Uri.file(repository.workspaceRoot),
        SvnUriAction.LOG_REVISION,
        { revision }
      );
      const uri = resource.with({
        path: path.join(resource.path, "svn.log")
      });

      await commands.executeCommand<void>("vscode.open", uri);
    } catch (error) {
      console.error(error);
      window.showErrorMessage(l10n.t("Unable to log"));
    }
  }
}
