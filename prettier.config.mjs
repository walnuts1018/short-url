/**
 * @see https://prettier.io/docs/configuration
 * @type {import("prettier").Config}
 */
/* eslint-disable import/no-default-export */

const config = {
  trailingComma: "es5",
  semi: true,
  plugins: ["prettier-plugin-tailwindcss"],
  tailwindFunctions: ["cn"],
  printWidth: 80,
};

export default config;
