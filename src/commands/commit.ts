import * as path from "path";
import { SourceControlResourceState, window } from "vscode";
import { Status } from "../common/types";
import { inputCommitMessage } from "../messages";
import { isSvnErrorLike } from "../util";
import { Command } from "./command";
import { confirmMissingResourcesForCommit } from "./commitMissing";

export class Commit extends Command {
  constructor() {
    super("svn.commit");
  }

  public async execute(...resources: SourceControlResourceState[]) {
    const selection = await this.getResourceStates(resources);

    if (selection.length === 0) {
      return;
    }

    const uris = selection.map(resource => resource.resourceUri);
    selection.forEach(resource => {
      if (resource.type === Status.ADDED && resource.renameResourceUri) {
        uris.push(resource.renameResourceUri);
      }
    });

    await this.runByRepository(uris, async (repository, resources) => {
      if (!repository) {
        return;
      }

      const selectedResources = selection.filter(resource =>
        resources.some(uri => uri.fsPath === resource.resourceUri.fsPath)
      );

      if (
        !(await confirmMissingResourcesForCommit(repository, selectedResources))
      ) {
        return;
      }

      const paths = resources.map(resource => resource.fsPath);

      for (const resource of selectedResources) {
        let dir = path.dirname(resource.resourceUri.fsPath);
        let parent = repository.getResourceFromFile(dir);

        while (parent) {
          if (parent.type === Status.ADDED) {
            paths.push(dir);
          }
          dir = path.dirname(dir);
          parent = repository.getResourceFromFile(dir);
        }
      }

      try {
        const message = await inputCommitMessage(
          repository.inputBox.value,
          true,
          paths
        );

        if (message === undefined) {
          return;
        }

        repository.inputBox.value = message;

        const result = await repository.commitFiles(message, paths);
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
    });
  }
}
