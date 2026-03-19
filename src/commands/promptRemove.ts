import { l10n, Uri, window } from "vscode";
import { configuration } from "../helpers/configuration";
import { Repository } from "../repository";
import { Command } from "./command";

export class PromptRemove extends Command {
  constructor() {
    super("svn.promptRemove", { repository: true });
  }

  public async execute(repository: Repository, ...uris: Uri[]) {
    const files = uris.map(uri => uri.fsPath);
    const relativeList = files
      .map(file => repository.repository.removeAbsolutePath(file))
      .sort();
    const yes = l10n.t("Yes");
    const no = l10n.t("No");
    const ignoreText = l10n.t("Add to ignored list");
    const resp = await window.showInformationMessage(
      l10n.t(
        'The file(s) "{0}" are removed from disk.\nWould you like remove from SVN?',
        relativeList.join(", ")
      ),
      { modal: false },
      yes,
      ignoreText,
      no
    );
    if (resp === yes) {
      await repository.removeFiles(files, false);
    } else if (resp === ignoreText) {
      let ignoreList = configuration.get<string[]>(
        "delete.ignoredRulesForDeletedFiles",
        []
      );
      ignoreList.push(...relativeList);
      ignoreList = [...new Set(ignoreList)]; // Remove duplicates
      configuration.update("delete.ignoredRulesForDeletedFiles", ignoreList);
    }
  }
}
