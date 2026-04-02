import * as assert from "assert";
import * as path from "path";
import { Uri } from "vscode";
import { Status } from "../common/types";
import { getCommitFilePaths } from "../commands/commitPaths";
import { Resource } from "../resource";

suite("Commit Paths Tests", () => {
  test("Deduplicates added parent folders already selected", () => {
    const root = path.join("C:", "repo");
    const srcFolder = path.join(root, "src");
    const webXml = path.join(srcFolder, "web.xml");
    const testTxt = path.join(root, "test2.txt");

    const folderResource = new Resource(Uri.file(srcFolder), Status.ADDED);
    const fileResource = new Resource(Uri.file(webXml), Status.ADDED);
    const siblingFile = new Resource(Uri.file(testTxt), Status.MODIFIED);

    const resourcesByPath = new Map<string, Resource>([
      [srcFolder, folderResource]
    ]);

    const paths = getCommitFilePaths(
      [srcFolder, webXml, testTxt],
      [folderResource, fileResource, siblingFile],
      filePath => resourcesByPath.get(filePath)
    );

    assert.deepStrictEqual(paths, [srcFolder, webXml, testTxt]);
  });
});