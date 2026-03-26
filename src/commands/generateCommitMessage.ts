import { l10n, ProgressLocation, window } from "vscode";
import {
  generateAICommitMessage,
  getCommitMessageGenerationMode
} from "../aiCommitMessage";
import {
  generateCommitMessage,
  getCommitMessageResources
} from "../commitMessageGenerator";
import { noChangesToCommit } from "../messages";
import { Repository } from "../repository";
import { Command } from "./command";

export class GenerateCommitMessage extends Command {
  constructor() {
    super("svn.generateCommitMessage", { repository: true });
  }

  public async execute(repository: Repository, ...args: unknown[]) {
    const selectedFilePaths = args.find(
      (arg): arg is string[] =>
        Array.isArray(arg) && arg.every(item => typeof item === "string")
    );

    const resources = selectedFilePaths?.length
      ? getCommitMessageResources(repository).filter(resource => {
          const renamePath = resource.renameResourceUri?.fsPath;

          return (
            selectedFilePaths.includes(resource.resourceUri.fsPath) ||
            (renamePath ? selectedFilePaths.includes(renamePath) : false)
          );
        })
      : getCommitMessageResources(repository);

    if (resources.length === 0) {
      await noChangesToCommit();
      return;
    }

    const fallbackMessage = generateCommitMessage(
      repository,
      selectedFilePaths
    );
    if (!fallbackMessage) {
      await noChangesToCommit();
      return;
    }

    const mode = getCommitMessageGenerationMode();
    let message = fallbackMessage;

    if (mode !== "template") {
      const aiResult = await window.withProgress(
        {
          location: ProgressLocation.Notification,
          title: l10n.t("Generating commit message"),
          cancellable: false
        },
        async () =>
          generateAICommitMessage(repository, resources, fallbackMessage)
      );

      if (aiResult.message) {
        message = aiResult.message;
        window.setStatusBarMessage(
          l10n.t("AI commit message generated."),
          3000
        );
      } else if (mode === "ai") {
        const useTemplate = l10n.t("Use Template");
        const selection = await window.showWarningMessage(
          aiResult.reason === "no-api"
            ? l10n.t(
                "AI commit message generation is not available in this VS Code version."
              )
            : aiResult.reason === "no-model"
            ? l10n.t(
                "No language model is currently available for AI commit message generation."
              )
            : l10n.t("AI commit message generation failed."),
          useTemplate
        );

        if (selection !== useTemplate) {
          return;
        }

        window.setStatusBarMessage(
          l10n.t("Using template commit message instead."),
          3000
        );
      } else {
        window.setStatusBarMessage(
          aiResult.reason === "no-api"
            ? l10n.t("AI unavailable, used template commit message.")
            : aiResult.reason === "no-model"
            ? l10n.t("No AI model found, used template commit message.")
            : l10n.t("AI generation failed, used template commit message."),
          3000
        );
      }
    } else {
      window.setStatusBarMessage(
        l10n.t("Template commit message generated."),
        3000
      );
    }

    repository.inputBox.value = message;

    return message;
  }
}
