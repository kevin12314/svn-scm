import { l10n, window } from "vscode";
import { deleteAzureOpenAIApiKey } from "../aiCommitMessageService";
import { Command } from "./command";

export class ClearAzureOpenAIApiKey extends Command {
  constructor() {
    super("svn.clearAzureOpenAIApiKey");
  }

  public async execute() {
    await deleteAzureOpenAIApiKey();
    window.setStatusBarMessage(l10n.t("Azure OpenAI API key cleared."), 3000);
  }
}