import * as path from "path";
import { commands, l10n, Uri, window } from "vscode";
import { ISvnInfo } from "../common/types";
import { readdir } from "../fs";
import { Resource } from "../resource";
import { SourceControlManager } from "../source_control_manager";
import { Command } from "./command";

interface IMergeEditorInputData {
  uri: Uri;
  title: string;
}

interface IMergeEditorArgs {
  base: Uri;
  input1: IMergeEditorInputData;
  input2: IMergeEditorInputData;
  output: Uri;
}

export class OpenMergeEditor extends Command {
  constructor() {
    super("svn.openMergeEditor");
  }

  public async execute(resource?: Resource | Uri): Promise<void> {
    const uri = this.getResourceUri(resource);

    if (!uri || uri.scheme !== "file") {
      return;
    }

    const mergeEditorArgs = await this.getMergeEditorArgs(uri);

    if (!mergeEditorArgs) {
      window.showWarningMessage(
        l10n.t(
          'No SVN conflict inputs were found for "{0}".',
          path.basename(uri.fsPath)
        )
      );
      await commands.executeCommand("vscode.open", uri);
      return;
    }

    try {
      await commands.executeCommand("_open.mergeEditor", mergeEditorArgs);
    } catch (error) {
      console.error(error);
      window.showErrorMessage(
        l10n.t(
          'Unable to open Merge Editor for "{0}".',
          path.basename(uri.fsPath)
        )
      );
      await commands.executeCommand("vscode.open", uri);
    }
  }

  private getResourceUri(resource?: Resource | Uri): Uri | undefined {
    if (resource instanceof Uri) {
      return resource;
    }

    if (resource instanceof Resource) {
      return resource.resourceUri;
    }

    return this.getUriFromActiveTab();
  }

  private async getMergeEditorArgs(
    output: Uri
  ): Promise<IMergeEditorArgs | undefined> {
    const infoConflict = await this.getConflictArgsFromInfo(output);

    if (infoConflict) {
      return infoConflict;
    }

    const directory = path.dirname(output.fsPath);
    const basename = path.basename(output.fsPath);
    const entries = (await readdir(directory)).filter(entry =>
      entry.startsWith(`${basename}.`)
    );

    const siblingUris = entries.map(entry =>
      Uri.file(path.join(directory, entry))
    );

    const mine = siblingUris.find(uri => uri.fsPath.endsWith(".mine"));
    const working = siblingUris.find(uri => uri.fsPath.endsWith(".working"));
    const mergeLeft = siblingUris.find(uri =>
      /\.merge-left\.r\d+$/i.test(uri.fsPath)
    );
    const mergeRight = siblingUris.find(uri =>
      /\.merge-right\.r\d+$/i.test(uri.fsPath)
    );
    const revisions = siblingUris
      .filter(uri => /\.r\d+$/i.test(uri.fsPath))
      .sort((left, right) => this.compareByRevision(left.fsPath, right.fsPath));

    if (mine && revisions.length >= 2) {
      return {
        base: revisions[0],
        input1: { uri: mine, title: l10n.t("Current") },
        input2: {
          uri: revisions[revisions.length - 1],
          title: l10n.t("Incoming")
        },
        output
      };
    }

    if (working && mergeLeft && mergeRight) {
      return {
        base: mergeLeft,
        input1: { uri: working, title: l10n.t("Working Copy") },
        input2: { uri: mergeRight, title: l10n.t("Incoming") },
        output
      };
    }

    if (working && revisions.length >= 2) {
      return {
        base: revisions[0],
        input1: { uri: working, title: l10n.t("Working Copy") },
        input2: {
          uri: revisions[revisions.length - 1],
          title: l10n.t("Incoming")
        },
        output
      };
    }

    return;
  }

  private async getConflictArgsFromInfo(
    output: Uri
  ): Promise<IMergeEditorArgs | undefined> {
    const sourceControlManager = (await commands.executeCommand(
      "svn.getSourceControlManager",
      ""
    )) as SourceControlManager;
    const repository = sourceControlManager.getRepository(output);

    if (!repository) {
      return;
    }

    let info: ISvnInfo | undefined;

    try {
      info = await repository.getInfo(output.fsPath);
    } catch (error) {
      console.error(error);
      return;
    }

    const conflict = info.conflict;

    if (
      !conflict?.prevBaseFile ||
      !conflict.prevWcFile ||
      !conflict.curBaseFile
    ) {
      return;
    }

    return {
      base: Uri.file(conflict.prevBaseFile),
      input1: { uri: Uri.file(conflict.prevWcFile), title: l10n.t("Current") },
      input2: {
        uri: Uri.file(conflict.curBaseFile),
        title: l10n.t("Incoming")
      },
      output
    };
  }

  private compareByRevision(leftPath: string, rightPath: string): number {
    const leftRevision = this.getRevisionNumber(leftPath);
    const rightRevision = this.getRevisionNumber(rightPath);

    return leftRevision - rightRevision;
  }

  private getRevisionNumber(filePath: string): number {
    const match = filePath.match(/\.r(\d+)$/i);

    if (!match) {
      return Number.MAX_SAFE_INTEGER;
    }

    return parseInt(match[1], 10);
  }
}
