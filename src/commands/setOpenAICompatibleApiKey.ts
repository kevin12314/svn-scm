import { l10n, window } from "vscode";
import { storeOpenAICompatibleApiKey } from "../aiCommitMessageService";
import { Command } from "./command";

export class SetOpenAICompatibleApiKey extends Command {
  constructor() {
    super("svn.setOpenAICompatibleApiKey");
  }

  public async execute() {
    const apiKey = await window.showInputBox({
      prompt: l10n.t(
        "Enter the API key for the OpenAI-compatible commit message provider."
      ),
      password: true,
      ignoreFocusOut: true
    });

    if (!apiKey) {
      return;
    }

    await storeOpenAICompatibleApiKey(apiKey.trim());
    window.setStatusBarMessage(
      l10n.t("OpenAI-compatible API key saved."),
      3000
    );
  }
}
