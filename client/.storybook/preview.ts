import type { Preview } from '@storybook/react-vite';
// The app's global styles: the base reset, the design tokens and the base page styles.
import '../src/index.css';

const preview: Preview = {
  parameters: {
    layout: 'padded',
  },
};

export default preview;
