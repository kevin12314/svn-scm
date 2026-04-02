import * as path from "path";
import { Status } from "../common/types";
import { Resource } from "../resource";

export function getCommitFilePaths(
  initialPaths: string[],
  resources: Resource[],
  getResourceFromFile: (filePath: string) => Resource | undefined
): string[] {
  const uniquePaths = new Set(initialPaths);

  for (const resource of resources) {
    if (resource.type === Status.ADDED && resource.renameResourceUri) {
      uniquePaths.add(resource.renameResourceUri.fsPath);
    }

    let dir = path.dirname(resource.resourceUri.fsPath);
    let parent = getResourceFromFile(dir);

    while (parent) {
      if (parent.type === Status.ADDED) {
        uniquePaths.add(dir);
      }

      dir = path.dirname(dir);
      parent = getResourceFromFile(dir);
    }
  }

  return Array.from(uniquePaths);
}