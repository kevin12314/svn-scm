import { l10n, window } from "vscode";
import { deleteOpenAICompatibleApiKey } from "../aiCommitMessageService";
import { Command } from "./command";

export class ClearOpenAICompatibleApiKey extends Command {
  constructor() {
    super("svn.clearOpenAICompatibleApiKey");
  }

  public async execute() {
    await deleteOpenAICompatibleApiKey();
    window.setStatusBarMessage(
      l10n.t("OpenAI-compatible API key cleared."),
      3000
    );
  }
}
