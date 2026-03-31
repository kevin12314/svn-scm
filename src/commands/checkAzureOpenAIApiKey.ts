import { l10n, window } from "vscode";
import { hasAzureOpenAIApiKey } from "../aiCommitMessageService";
import { Command } from "./command";

export class CheckAzureOpenAIApiKey extends Command {
  constructor() {
    super("svn.checkAzureOpenAIApiKey");
  }

  public async execute() {
    const exists = await hasAzureOpenAIApiKey();
    await window.showInformationMessage(
      exists
        ? l10n.t("An Azure OpenAI API key is configured.")
        : l10n.t("No Azure OpenAI API key is configured.")
    );
  }
}
