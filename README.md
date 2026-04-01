# Subversion source control for VS Code

![Visual Studio Marketplace Release Date](https://img.shields.io/visual-studio-marketplace/release-date/kevin12314.svn-scm-ai)
![Visual Studio Marketplace Last Updated](https://img.shields.io/visual-studio-marketplace/last-updated/kevin12314.svn-scm-ai)
![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/kevin12314.svn-scm-ai)
![Visual Studio Marketplace Rating](https://img.shields.io/visual-studio-marketplace/r/kevin12314.svn-scm-ai)

![GitHub Workflow Status (with branch)](https://img.shields.io/github/actions/workflow/status/kevin12314/svn-scm/main.yml?branch=master)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)

[![Known Vulnerabilities](https://snyk.io/test/github/kevin12314/svn-scm/badge.svg)](https://snyk.io/test/github/kevin12314/svn-scm)

# Info
This project is a fork of [JohnstonCode's VS Code SVN Extension](https://github.com/kevin12314/svn-scm)
with additional support for localized user-facing messages and AI-assisted commit message generation using GitHub Copilot or OpenAI-compatible APIs.

# Prerequisites

> **Note**: This extension leverages your machine's SVN installation,\
> so you need to [install SVN](https://subversion.apache.org) first.

## Windows

If you use [TortoiseSVN](https://tortoisesvn.net/), make sure the option
**Command Line Tools** is checked during installation and
`C:\Program Files\TortoiseSVN\bin` is available in PATH.

## Translations
Please open an [issue](https://github.com/kevin12314/svn-scm/issues) with improvements to translations or create a [PR](https://github.com/kevin12314/svn-scm/pulls) to add a new language. 

## Feedback & Contributing

* Please report any bugs, suggestions or documentation requests via the
  [Issues](https://github.com/kevin12314/svn-scm/issues)
* Feel free to submit
  [pull requests](https://github.com/kevin12314/svn-scm/pulls)

## [Contributors](https://github.com/kevin12314/svn-scm/graphs/contributors)

# Features

### Checkout

You can checkout a SVN repository with the `SVN: Checkout` command in the **Command Palette** (`Ctrl+Shift+P`). You will be asked for the URL of the repository and the parent directory under which to put the local repository.

----

* Source Control View
* Quick Diffs in gutter
* Status Bar
* Create changelists
* Add files
* Revert edits
* Remove files
* Create branches
* Switch branches
* Create patches
* Diff changes
* Commit changes/changelists
* AI-assisted commit message generation from current changes using GitHub Copilot or OpenAI-compatible APIs
* See commit messages
* Copy file permalinks
* Lock files

### History Views

Use the **File History** and **Repositories** views to inspect SVN log entries directly in the sidebar. From each commit entry you can:

* Open the revision or diff
* Copy the commit message
* Copy the revision number
* Copy detailed commit information, including revision, author, date, message, and changed paths

## Blame

Please use a dedicated extension like [blamer-vs](https://marketplace.visualstudio.com/items?itemName=beaugust.blamer-vs)

## Settings
Here are all of the extension settings with their default values. To change any of these, add the relevant Config key and value to your VSCode settings.json file. Alternatively search for the config key in the settings UI to change its value.

<!--begin-settings-->
```js
{
  // Whether auto refreshing is enabled
  "svn.autorefresh": true,

  // Select all files when commit changes
  "svn.commit.changes.selectedAll": true,

  // Check empty message before commit
  "svn.commit.checkEmptyMessage": true,

  // Controls how commit messages are generated.
  "svn.commitMessageGeneration.mode": "auto",  // values: ["auto","ai","template"],

  // Selects which AI provider is used for commit message generation.
  "svn.commitMessageGeneration.provider": "vscode-lm",  // values: ["vscode-lm","openai-compatible","azure-openai"],

  // Preferred vendor for the VS Code language model provider. Only used when provider = "vscode-lm".
  "svn.commitMessageGeneration.vscodeLM.preferredVendor": null,

  // Optional model family for the VS Code language model provider. Only used when provider = "vscode-lm".
  "svn.commitMessageGeneration.vscodeLM.preferredModelFamily": null,

  // Preferred model version for the VS Code language model provider. Only used when provider = "vscode-lm".
  "svn.commitMessageGeneration.vscodeLM.preferredModelVersion": "raptor-mini",

  // Controls the language used for generated commit messages.
  "svn.commitMessageGeneration.outputLanguage": "auto",  // values: ["auto","en","ko","ja","zh-CN","zh-TW"],

  // Include unified diff content in the AI prompt when generating commit messages.
  "svn.commitMessageGeneration.includeDiff": true,

  // Maximum number of diff characters to include in the AI prompt.
  "svn.commitMessageGeneration.maxDiffCharacters": 12000,

  // Base URL for the OpenAI-compatible API, for example https://api.openai.com/v1 or a compatible gateway.
  "svn.commitMessageGeneration.openAICompatible.baseUrl": "",

  // Model name used for the OpenAI-compatible API.
  "svn.commitMessageGeneration.openAICompatible.model": "",

  // Controls which OpenAI-compatible endpoint is used.
  "svn.commitMessageGeneration.openAICompatible.apiType": "auto",  // values: ["auto","responses","chat-completions"],

  // API keys are stored in VS Code Secret Storage. Use the Set/Check/Clear API Key commands instead of settings.json.
  "svn.commitMessageGeneration.openAICompatible.apiKeyManagement": "",

  // Timeout in milliseconds for AI commit message generation requests.
  "svn.commitMessageGeneration.timeout": 30000,

  // Optional OpenAI-Organization header value for the OpenAI-compatible API.
  "svn.commitMessageGeneration.openAICompatible.organization": null,

  // Optional OpenAI-Project header value for the OpenAI-compatible API.
  "svn.commitMessageGeneration.openAICompatible.project": null,

  // Azure OpenAI resource endpoint, for example https://your-resource.openai.azure.com.
  "svn.commitMessageGeneration.azureOpenAI.endpoint": "",

  // Azure OpenAI deployment name used for commit message generation.
  "svn.commitMessageGeneration.azureOpenAI.deployment": "",

  // Azure OpenAI API version appended as the api-version query parameter.
  "svn.commitMessageGeneration.azureOpenAI.apiVersion": "2024-10-21",

  // Controls which Azure OpenAI endpoint is used.
  "svn.commitMessageGeneration.azureOpenAI.apiType": "chat-completions",  // values: ["responses","chat-completions"],

  // API keys are stored in VS Code Secret Storage. Use the Set/Check/Clear API Key commands instead of settings.json.
  "svn.commitMessageGeneration.azureOpenAI.apiKeyManagement": "",

  // Set file to status resolved after fix conflicts
  "svn.conflicts.autoResolve": null,

  // Encoding of svn output if the output is not utf-8. When this parameter is null, the encoding is automatically detected. Example: 'windows-1252'.
  "svn.default.encoding": null,

  // The default location to checkout a svn repository.
  "svn.defaultCheckoutDirectory": null,

  // When a file is deleted, what SVN should do? `none` - Do nothing, `prompt` - Ask the action, `remove` - automatically remove from SVN
  "svn.delete.actionForDeletedFiles": "prompt"  // values: ["none","prompt","remove"],

  // Ignored files/rules for `svn.delete.actionForDeletedFiles`(Ex.: file.txt or **/*.txt)
  "svn.delete.ignoredRulesForDeletedFiles": [],

  // Controls whether to automatically detect svn externals.
  "svn.detectExternals": true,

  // Controls whether to automatically detect svn on ignored folders.
  "svn.detectIgnored": true,

  // Show diff changes using latest revision in the repository. Set false to use latest revision in local folder
  "svn.diff.withHead": true,

  // Whether svn is enabled
  "svn.enabled": true,

  // Try the experimental encoding detection
  "svn.experimental.detect_encoding": null,

  // Priority of encoding
  "svn.experimental.encoding_priority": [],

  // Url for the gravatar icon using the <AUTHOR>, <AUTHOR_MD5> and <SIZE> placeholders
  "svn.gravatar.icon_url": "https://www.gravatar.com/avatar/<AUTHOR_MD5>.jpg?s=<SIZE>&d=robohash",

  // Use gravatar icons in log viewers
  "svn.gravatars.enabled": true,

  // Ignores the warning when SVN is missing
  "svn.ignoreMissingSvnWarning": null,

  // List of SVN repositories to ignore.
  "svn.ignoreRepositories": null,

  // Ignores the warning when working copy is too old
  "svn.ignoreWorkingCopyIsTooOld": null,

  // Regex to detect path for 'branches' in SVN URL, 'null' to disable. Subpath use 'branches/[^/]+/([^/]+)(/.*)?' (Ex.: 'branches/...', 'versions/...')
  "svn.layout.branchesRegex": "branches/([^/]+)(/.*)?",

  // Regex group position for name of branch
  "svn.layout.branchesRegexName": 1,

  // Set true to show 'branches/<name>' and false to show only '<name>'
  "svn.layout.showFullName": true,

  // Regex group position for name of tag
  "svn.layout.tagRegexName": 1,

  // Regex to detect path for 'tags' in SVN URL, 'null' to disable. Subpath use 'tags/[^/]+/([^/]+)(/.*)?'. (Ex.: 'tags/...', 'stamps/...')
  "svn.layout.tagsRegex": "tags/([^/]+)(/.*)?",

  // Regex to detect path for 'trunk' in SVN URL, 'null' to disable. (Ex.: '(trunk)', '(main)')
  "svn.layout.trunkRegex": "(trunk)(/.*)?",

  // Regex group position for name of trunk
  "svn.layout.trunkRegexName": 1,

  // Number of commit messages to log
  "svn.log.length": 50,

  // Maximum depth to find subfolders using SVN
  "svn.multipleFolders.depth": 4,

  // Allow to find subfolders using SVN
  "svn.multipleFolders.enabled": null,

  // Folders to ignore using SVN
  "svn.multipleFolders.ignore": ["**/.git","**/.hg","**/vendor","**/node_modules"],

  // Path to the svn executable
  "svn.path": null,

  // Only show previous commits for a given user. Requires svn >= 1.8
  "svn.previousCommitsUser": null,

  // Refresh remote changes on refresh command
  "svn.refresh.remoteChanges": null,

  // Set the interval in seconds to check changed files on remote repository and show in statusbar. 0 to disable
  "svn.remoteChanges.checkFrequency": 300,

  // Show the output window when the extension starts
  "svn.showOutput": null,

  // Show the update message when update is run
  "svn.showUpdateMessage": true,

  // Set left click functionality on changes resource state
  "svn.sourceControl.changesLeftClick": "open diff"  // values: ["open","open diff"],

  // Combine the svn external in the main if is from the same server.
  "svn.sourceControl.combineExternalIfSameServer": null,

  // Allow to count unversioned files in status count
  "svn.sourceControl.countUnversioned": true,

  // Hide unversioned files in Source Control UI
  "svn.sourceControl.hideUnversioned": null,

  // Ignore unversioned files like .gitignore, Configuring this will overlook the default ignore rule
  "svn.sourceControl.ignore": [],

  // Changelists to ignore on commit
  "svn.sourceControl.ignoreOnCommit": ["ignore-on-commit"],

  // Changelists to ignore on status count
  "svn.sourceControl.ignoreOnStatusCount": ["ignore-on-commit"],

  // Set to ignore externals definitions on update (add --ignore-externals)
  "svn.update.ignoreExternals": true
}
```
<!--end-settings-->

## OpenAI-Compatible Commit Message Setup

To use an OpenAI-compatible API for commit message generation:

1. Set `svn.commitMessageGeneration.provider` to `openai-compatible`.
2. Configure `svn.commitMessageGeneration.openAICompatible.baseUrl`.
3. Configure `svn.commitMessageGeneration.openAICompatible.model`.
4. Run the `SVN: Set OpenAI-Compatible API Key` command to store the API key in VS Code SecretStorage.

The extension can use either the Responses API or Chat Completions API. In `auto` mode it tries Responses first and falls back to Chat Completions when needed.

## Azure OpenAI Commit Message Setup

To use Azure OpenAI for commit message generation:

1. Set `svn.commitMessageGeneration.provider` to `azure-openai`.
2. Configure `svn.commitMessageGeneration.azureOpenAI.endpoint`.
3. Configure `svn.commitMessageGeneration.azureOpenAI.deployment`.
4. Optionally adjust `svn.commitMessageGeneration.azureOpenAI.apiVersion` and `svn.commitMessageGeneration.azureOpenAI.apiType`.
5. Run the `SVN: Set Azure OpenAI API Key` command to store the API key in VS Code SecretStorage.

This provider is separate from the generic OpenAI-compatible mode so Azure-specific URL structure and `api-version` handling do not need to be forced into the generic provider.
