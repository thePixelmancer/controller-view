import globals from "globals";

export default [
{
    files: ["**/*.js"],
    ignores: ["media/**/*.js"], // Ignore browser-side JS files
    languageOptions: {
        globals: {
            ...globals.commonjs,
            ...globals.node,
            ...globals.mocha,
        },

        ecmaVersion: 2022,
        sourceType: "module",
    },

    rules: {
        "no-const-assign": "warn",
        "no-this-before-super": "warn",
        "no-undef": "warn",
        "no-unreachable": "warn",
        "no-unused-vars": "warn",
        "constructor-super": "warn",
        "valid-typeof": "warn",
    },
},
{
    files: ["media/**/*.js"], // Browser-side JS files
    languageOptions: {
        globals: {
            ...globals.browser,
            mermaid: "readonly", // Add mermaid as a global
        },
        ecmaVersion: 2022,
        sourceType: "script",
    },
    rules: {
        "no-const-assign": "warn",
        "no-this-before-super": "warn",
        "no-undef": "warn",
        "no-unreachable": "warn",
        "no-unused-vars": "warn",
        "constructor-super": "warn",
        "valid-typeof": "warn",
    },
}];