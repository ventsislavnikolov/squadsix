// The commit format, in one place: commitlint enforces it, semantic-release reads it.
//
//   feat: forecast card          a new thing people can see      -> minor release
//   fix(match): wrap the buttons  something that was wrong        -> patch release
//   chore: pin dependencies       everything else                 -> no release
//
// A gitmoji may lead the line ("✨ feat: …"); it is ignored when reading the type.

const emoji = String.raw`(?:[\p{Extended_Pictographic}\p{Emoji_Component}‍]+ )?`;

export const parserOpts = {
  headerPattern: new RegExp(String.raw`^${emoji}(\w+)(?:\(([^)]*)\))?!?: (.+)$`, "u"),
  breakingHeaderPattern: new RegExp(String.raw`^${emoji}(\w+)(?:\(([^)]*)\))?!: (.+)$`, "u"),
  headerCorrespondence: ["type", "scope", "subject"],
};
