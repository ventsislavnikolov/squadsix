import { parserOpts } from "./commit-format.mjs";

export default {
  extends: ["@commitlint/config-conventional"],
  parserPreset: { parserOpts },
  rules: {
    // Subjects often open with a name (Jev, Vercel, a player), which isn't a case error.
    "subject-case": [0],
  },
};
