import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

export const baseConfig = (tsconfigRootDir) =>
  tseslint.config(
    js.configs.recommended,
    ...tseslint.configs.strictTypeChecked,
    eslintConfigPrettier,
    {
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
      },
      rules: {
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
      },
    }
  );

export const nodeConfig = (tsconfigRootDir) =>
  tseslint.config(...baseConfig(tsconfigRootDir), {
    languageOptions: {
      globals: globals.node,
    },
  });

export const reactConfig = (tsconfigRootDir) =>
  tseslint.config(...baseConfig(tsconfigRootDir), {
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    languageOptions: {
      globals: globals.browser,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
  });
