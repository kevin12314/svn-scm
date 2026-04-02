import { window } from "vscode";
import { inputCommitFiles } from "../changelistItems";
import { inputCommitMessage } from "../messages";
import { Repository } from "../repository";
import { Resource } from "../resource";
import { isSvnErrorLike } from "../util";
import { Command } from "./command";
import { getCommitFilePaths } from "./commitPaths";
import { confirmMissingResourcesForCommit } from "./commitMissing";

export class CommitWithMessage extends Command {
  constructor() {
    super("svn.commitWithMessage", { repository: true });
  }

  public async execute(repository: Repository) {
    const resourceStates = await inputCommitFiles(repository);
    if (!resourceStates || resourceStates.length === 0) {
      return;
    }

    const resources = resourceStates.filter(
      state => state instanceof Resource
    ) as Resource[];

    if (!(await confirmMissingResourcesForCommit(repository, resources))) {
      return;
    }

    const initialFilePaths = resourceStates.map(state => {
      return state.resourceUri.fsPath;
    });

    const message = await inputCommitMessage(
      repository.inputBox.value,
      false,
      initialFilePaths
    );
    if (message === undefined) {
      return;
    }

    const filePaths = getCommitFilePaths(initialFilePaths, resources, filePath =>
      repository.getResourceFromFile(filePath)
    );

    try {
      const result = await repository.commitFiles(message, filePaths);
      window.showInformationMessage(result);
      repository.inputBox.value = "";
    } catch (error) {
      console.error(error);
      window.showErrorMessage(
        isSvnErrorLike(error) && error.stderrFormated
          ? error.stderrFormated
          : String(error)
      );
    }
  }
}
