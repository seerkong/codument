import tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      ".tmp/**",
      ".claude/**",
      ".codex/**",
      ".agents/**",
      "codument/archive/**",
      "codument/missions/*/*/analysis/**",
      "codument/missions/*/*/reports/**",
      "codument/tracks/**/analysis/**",
      "codument/tracks/**/reports/**",
    ],
  },
  {
    files: ["src/**/*.ts", "test/**/*.ts", "scripts/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: "module",
      },
    },
  },
];
