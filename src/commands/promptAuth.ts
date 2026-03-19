import { l10n, window } from "vscode";
import { IAuth } from "../common/types";
import { Command } from "./command";

export class PromptAuth extends Command {
  constructor() {
    super("svn.promptAuth");
  }

  public async execute(prevUsername?: string, prevPassword?: string) {
    const username = await window.showInputBox({
      placeHolder: l10n.t("Svn repository username"),
      prompt: l10n.t("Please enter your username"),
      ignoreFocusOut: true,
      value: prevUsername
    });

    if (username === undefined) {
      return;
    }

    const password = await window.showInputBox({
      placeHolder: l10n.t("Svn repository password"),
      prompt: l10n.t("Please enter your password"),
      value: prevPassword,
      ignoreFocusOut: true,
      password: true
    });

    if (password === undefined) {
      return;
    }

    const auth: IAuth = {
      username,
      password
    };

    return auth;
  }
}
