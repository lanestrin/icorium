import type { StorybookConfig } from '@storybook/react-vite';

// Storybook documents the shared ui/ components. It reuses client/vite.config.ts (React and SCSS).
const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.stories.tsx'],
  addons: ['@storybook/addon-docs'],
};

export default config;
