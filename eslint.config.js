import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat();

export default [
  ...compat.extends('plugin:@angular-eslint/recommended', 'plugin:prettier/recommended'),
  {
    files: ['*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['tsconfig.json'],
        createDefaultProgram: true,
      },
    },
    rules: {
      'prettier/prettier': 'error',
      // your other rules here
    },
  },
];
