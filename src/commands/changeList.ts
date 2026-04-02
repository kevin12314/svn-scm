import { commands, l10n, Uri, window } from "vscode";
import { inputSwitchChangelist } from "../changelistItems";
import { SourceControlManager } from "../source_control_manager";
import { Resource } from "../resource";
import { normalizePath } from "../util";
import { Command } from "./command";

export class ChangeList extends Command {
  constructor() {
    super("svn.changelist");
  }

  public async execute(...args: any[]) {
    let uris: Uri[];
    const normalizedResources = this.normalizeResourceStates(args).filter(
      (state): state is Resource => state instanceof Resource
    );

    if (normalizedResources.length > 0) {
      uris = normalizedResources.map(resource => resource.resourceUri);
    } else if (args[0] instanceof Uri) {
      const uriArgs = args.flatMap(arg =>
        Array.isArray(arg) ? arg : [arg]
      ) as unknown[];
      const seenUris = new Map<string, Uri>();

      for (const candidate of uriArgs) {
        if (!(candidate instanceof Uri)) {
          continue;
        }

        seenUris.set(candidate.toString(), candidate);
      }

      uris = Array.from(seenUris.values());
    } else if (window.activeTextEditor) {
      uris = [window.activeTextEditor.document.uri];
    } else {
      console.error("Unhandled type for changelist command");
      return;
    }

    const sourceControlManager = (await commands.executeCommand(
      "svn.getSourceControlManager",
      ""
    )) as SourceControlManager;

    const promiseArray = uris.map(async uri =>
      sourceControlManager.getRepositoryFromUri(uri)
    );
    let repositories = await Promise.all(promiseArray);
    repositories = repositories.filter(repository => repository);

    if (repositories.length === 0) {
      window.showErrorMessage(
        l10n.t(
          "Files are not under version control and cannot be added to a change list"
        )
      );
      return;
    }

    const uniqueRepositories = Array.from(new Set(repositories));

    if (uniqueRepositories.length !== 1) {
      window.showErrorMessage(
        l10n.t("Unable to add files from different repositories to change list")
      );
      return;
    }

    if (repositories.length !== uris.length) {
      window.showErrorMessage(
        l10n.t(
          "Some Files are not under version control and cannot be added to a change list"
        )
      );
      return;
    }

    const repository = repositories[0];

    if (!repository) {
      return;
    }

    const paths = uris.map(uri => uri.fsPath);
    let canRemove = false;

    repository.changelists.forEach((group, _changelist) => {
      if (
        group.resourceStates.some(state => {
          return paths.some(path => {
            return (
              normalizePath(path) === normalizePath(state.resourceUri.path)
            );
          });
        })
      ) {
        canRemove = true;
        return false;
      }

      return;
    });

    const changelistName = await inputSwitchChangelist(repository, canRemove);

    if (!changelistName && changelistName !== false) {
      return;
    }

    if (changelistName === false) {
      try {
        await repository.removeChangelist(paths);
      } catch (error) {
        console.log(error);
        window.showErrorMessage(
          l10n.t('Unable to remove file "{0}" from changelist', paths.join(","))
        );
      }
    } else {
      try {
        await repository.addChangelist(paths, changelistName);
        window.showInformationMessage(
          l10n.t(
            'Added files "{0}" to changelist "{1}"',
            paths.join(","),
            changelistName
          )
        );
      } catch (error) {
        console.log(error);
        window.showErrorMessage(
          l10n.t(
            'Unable to add file "{0}" to changelist "{1}"',
            paths.join(","),
            changelistName
          )
        );
      }
    }
  }
}
