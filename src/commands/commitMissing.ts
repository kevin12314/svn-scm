import { l10n, window } from "vscode";
import { Status } from "../common/types";
import { Repository } from "../repository";
import { Resource } from "../resource";
import { isDescendant } from "../util";

function getMissingResources(resources: Resource[]): Resource[] {
  return resources.filter(resource => resource.type === Status.MISSING);
}

function getTopLevelMissingPaths(resources: Resource[]) {
  const uniquePaths = [
    ...new Set(resources.map(resource => resource.resourceUri.fsPath))
  ].sort((left, right) => left.length - right.length);

  return uniquePaths.filter((currentPath, index) => {
    return !uniquePaths.slice(0, index).some(existingPath => {
      return (
        existingPath !== currentPath && isDescendant(existingPath, currentPath)
      );
    });
  });
}

export async function confirmMissingResourcesForCommit(
  repository: Repository,
  resources: Resource[]
) {
  const missingResources = getMissingResources(resources);

  if (!missingResources.length) {
    return true;
  }

  const missingPaths = getTopLevelMissingPaths(missingResources);
  const relativePaths = missingPaths
    .map(file => repository.repository.removeAbsolutePath(file))
    .sort();

  const confirm = l10n.t("Continue");
  const message = `${l10n.t(
    "The following missing file(s) or folder(s) will be removed from SVN after commit:"
  )}\n${relativePaths.join("\n")}\n\n${l10n.t("Do you want to continue?")}`;
  const answer = await window.showWarningMessage(
    message,
    { modal: true },
    confirm
  );

  if (answer !== confirm) {
    return false;
  }

  await repository.removeFiles(missingPaths, false);
  return true;
}
