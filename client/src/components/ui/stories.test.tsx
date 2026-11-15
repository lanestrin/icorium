// Renders every story of every ui/ component, so a story that no longer matches its component fails
// npm run verify. The Storybook build itself stays out of verify (npm run build-storybook).
import type { ComponentType } from 'react';
import { render } from '@testing-library/react';
import { composeStories } from '@storybook/react-vite';
import { describe, expect, it } from 'vitest';

type StoryModule = Parameters<typeof composeStories>[0];

const MODULES = import.meta.glob<StoryModule>('./*.stories.tsx', { eager: true });

describe('ui stories', () => {
  it('finds the story files', () => {
    expect(Object.keys(MODULES).sort()).toEqual(['./Button.stories.tsx', './Card.stories.tsx']);
  });

  for (const [file, module] of Object.entries(MODULES)) {
    // composeStories can't infer story types from a glob of mixed modules; each one is a component.
    const stories = Object.entries(composeStories(module)) as [string, ComponentType][];

    it(`${file} has stories`, () => {
      expect(stories.length).toBeGreaterThan(0);
    });

    it.each(stories)(`${file}: %s renders`, (_name, Story) => {
      const { container } = render(<Story />);
      expect(container.firstElementChild).not.toBeNull();
    });
  }
});
