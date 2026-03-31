import { l10n, window } from "vscode";
import { storeAzureOpenAIApiKey } from "../aiCommitMessageService";
import { Command } from "./command";

export class SetAzureOpenAIApiKey extends Command {
  constructor() {
    super("svn.setAzureOpenAIApiKey");
  }

  public async execute() {
    const apiKey = await window.showInputBox({
      prompt: l10n.t("Enter the API key for the Azure OpenAI commit message provider."),
      password: true,
      ignoreFocusOut: true
    });

    if (!apiKey) {
      return;
    }

    await storeAzureOpenAIApiKey(apiKey.trim());
    window.setStatusBarMessage(l10n.t("Azure OpenAI API key saved."), 3000);
  }
}