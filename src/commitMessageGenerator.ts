import { getCommitChangelistPickOptions } from "./changelistItems";
import { Status } from "./common/types";
import { Repository } from "./repository";
import { Resource } from "./resource";
import { l10n } from "vscode";

type CommitMessageGroupKey =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "replaced";

interface CommitMessageGroup {
  title: string;
  items: string[];
}

function getCommitMessageGroupKey(
  resource: Resource
): CommitMessageGroupKey | undefined {
  if (resource.type === Status.ADDED && resource.renameResourceUri) {
    return "renamed";
  }

  switch (resource.type) {
    case Status.ADDED:
      return "added";
    case Status.MODIFIED:
      return "modified";
    case Status.DELETED:
    case Status.MISSING:
      return "deleted";
    case Status.REPLACED:
      return "replaced";
    default:
      return undefined;
  }
}

function getSubject(
  groupKey: CommitMessageGroupKey | undefined,
  resources: Resource[],
  repository: Repository
): string {
  if (resources.length === 1 && groupKey) {
    const resource = resources[0];

    if (groupKey === "renamed" && resource.renameResourceUri) {
      return l10n.t(
        "Rename {0}",
        `${repository.repository.removeAbsolutePath(
          resource.renameResourceUri.fsPath
        )} -> ${repository.repository.removeAbsolutePath(
          resource.resourceUri.fsPath
        )}`
      );
    }

    return l10n.t(
      groupKey === "added"
        ? "Add {0}"
        : groupKey === "modified"
        ? "Update {0}"
        : groupKey === "deleted"
        ? "Remove {0}"
        : "Replace {0}",
      repository.repository.removeAbsolutePath(resource.resourceUri.fsPath)
    );
  }

  switch (groupKey) {
    case "added":
      return l10n.t("Add new files");
    case "modified":
      return l10n.t("Update files");
    case "deleted":
      return l10n.t("Remove files");
    case "renamed":
      return l10n.t("Rename files");
    case "replaced":
      return l10n.t("Replace files");
    default:
      return l10n.t("Update working copy changes");
  }
}

function getGroupTitle(groupKey: CommitMessageGroupKey): string {
  switch (groupKey) {
    case "added":
      return l10n.t("Added:");
    case "modified":
      return l10n.t("Modified:");
    case "deleted":
      return l10n.t("Deleted:");
    case "renamed":
      return l10n.t("Renamed:");
    case "replaced":
      return l10n.t("Replaced:");
  }
}

function getItemLabel(resource: Resource, repository: Repository): string {
  if (resource.type === Status.ADDED && resource.renameResourceUri) {
    return `${repository.repository.removeAbsolutePath(
      resource.renameResourceUri.fsPath
    )} -> ${repository.repository.removeAbsolutePath(
      resource.resourceUri.fsPath
    )}`;
  }

  return repository.repository.removeAbsolutePath(resource.resourceUri.fsPath);
}

export function getCommitMessageResources(repository: Repository): Resource[] {
  const picks = getCommitChangelistPickOptions(repository);
  const resources = picks.flatMap(pick => pick.resourceGroup.resourceStates);
  const deduped = new Map<string, Resource>();

  for (const resource of resources) {
    const renamePath = resource.renameResourceUri?.fsPath ?? "";
    deduped.set(`${resource.resourceUri.fsPath}::${renamePath}`, resource);
  }

  return Array.from(deduped.values());
}

function filterCommitMessageResources(
  repository: Repository,
  selectedFilePaths?: string[]
): Resource[] {
  const resources = getCommitMessageResources(repository);

  if (!selectedFilePaths || selectedFilePaths.length === 0) {
    return resources;
  }

  const selectedPaths = new Set(selectedFilePaths);

  return resources.filter(resource => {
    const renamePath = resource.renameResourceUri?.fsPath;

    return (
      selectedPaths.has(resource.resourceUri.fsPath) ||
      (renamePath ? selectedPaths.has(renamePath) : false)
    );
  });
}

export function generateCommitMessage(
  repository: Repository,
  selectedFilePaths?: string[]
): string | undefined {
  const resources = filterCommitMessageResources(repository, selectedFilePaths);

  if (resources.length === 0) {
    return;
  }

  const groups = new Map<CommitMessageGroupKey, CommitMessageGroup>();
  let firstGroupKey: CommitMessageGroupKey | undefined;
  let singleGroupKey: CommitMessageGroupKey | undefined;

  for (const resource of resources) {
    const groupKey = getCommitMessageGroupKey(resource);

    if (!groupKey) {
      singleGroupKey = undefined;
      continue;
    }

    if (!firstGroupKey) {
      firstGroupKey = groupKey;
      singleGroupKey = groupKey;
    } else if (singleGroupKey && singleGroupKey !== groupKey) {
      singleGroupKey = undefined;
    }

    let group = groups.get(groupKey);
    if (!group) {
      group = {
        title: getGroupTitle(groupKey),
        items: []
      };
      groups.set(groupKey, group);
    }

    group.items.push(getItemLabel(resource, repository));
  }

  const orderedGroups: CommitMessageGroupKey[] = [
    "added",
    "modified",
    "deleted",
    "renamed",
    "replaced"
  ];

  const body = orderedGroups
    .map(groupKey => groups.get(groupKey))
    .filter((group): group is CommitMessageGroup => Boolean(group))
    .flatMap(group => [
      group.title,
      ...group.items.map(item => `- ${item}`),
      ""
    ]);

  if (body.length > 0) {
    body.pop();
  }

  return [
    getSubject(singleGroupKey ?? firstGroupKey, resources, repository),
    "",
    ...body
  ].join("\n");
}
