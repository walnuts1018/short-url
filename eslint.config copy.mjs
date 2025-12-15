import hatenaconfig from "@hatena/eslint-config-hatena/flat";
export default hatenaconfig(
  {
    next: "strict",
  },
  [
    {
      rules: {
        "no-console": 0, // TODO: remove
        "@typescript-eslint/no-misused-promises": 0,
      },
    },
  ]
);
