// What happens when main moves: semantic-release reads the commits since the last tag,
// picks the next version from them, writes CHANGELOG.md, tags, and opens a GitHub Release.
// Nothing is published to npm — this is an app, not a package.

import { parserOpts } from "./commit-format.mjs";

// The release commit's message, a lodash template semantic-release fills in.
const RELEASE_MESSAGE =
  // biome-ignore lint/suspicious/noTemplateCurlyInString: the placeholders are semantic-release's, not JavaScript's.
  "🔖 chore(release): ${nextRelease.version}\n\n${nextRelease.notes}";

export default {
  branches: ["main"],
  plugins: [
    // The plugins' built-in rules: feat is a minor release, fix and perf a patch.
    ["@semantic-release/commit-analyzer", { parserOpts }],
    ["@semantic-release/release-notes-generator", { parserOpts }],
    ["@semantic-release/changelog", { changelogTitle: "# Changelog" }],
    [
      "@semantic-release/git",
      {
        assets: ["CHANGELOG.md"],
        // vercel.json skips the deploy for this commit: only the changelog moved.
        message: RELEASE_MESSAGE,
      },
    ],
    "@semantic-release/github",
  ],
};
