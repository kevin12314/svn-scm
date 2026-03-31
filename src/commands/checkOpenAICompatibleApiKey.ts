import { l10n, window } from "vscode";
import { hasOpenAICompatibleApiKey } from "../aiCommitMessageService";
import { Command } from "./command";

export class CheckOpenAICompatibleApiKey extends Command {
  constructor() {
    super("svn.checkOpenAICompatibleApiKey");
  }

  public async execute() {
    const exists = await hasOpenAICompatibleApiKey();
    await window.showInformationMessage(
      exists
        ? l10n.t("An OpenAI-compatible API key is configured.")
        : l10n.t("No OpenAI-compatible API key is configured.")
    );
  }
}
