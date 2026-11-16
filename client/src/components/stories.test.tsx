// Runs every story of every component, so a story that no longer matches its component, or an
// interaction in a story's play function that no longer holds, fails npm run verify. It also fails
// when a shared component has no stories. The Storybook build itself runs in CI (npm run build-storybook).
import type { ComponentType } from 'react';
import { render } from '@testing-library/react';
import { composeStories } from '@storybook/react-vite';
import { clearAllMocks } from 'storybook/test';
import { beforeEach, describe, expect, it } from 'vitest';

type StoryModule = Parameters<typeof composeStories>[0];
/** A composed story: a component that renders the story, plus its play function when it has one. */
type ComposedStory = ComponentType & { play?: (context: { canvasElement: HTMLElement }) => Promise<void> };

const MODULES = import.meta.glob<StoryModule>('./**/*.stories.tsx', { eager: true });

/**
 * The shared components, which must each have a sibling Name.stories.tsx: everything in ui/, the page
 * banner, the dialog and the file row's ⋯ menu.
 */
const SHARED_COMPONENTS = [
  ...Object.keys(import.meta.glob(['./ui/*.tsx', '!./ui/*.test.tsx', '!./ui/*.stories.tsx'])),
  './Banner.tsx',
  './modals/Modal.tsx',
  './files/RowMenu.tsx',
];

describe('stories', () => {
  // Stories share the fn() spies from their meta args; Storybook clears them between stories, so do the same.
  beforeEach(() => clearAllMocks());

  it('finds story files across the components folder', () => {
    expect(Object.keys(MODULES)).toEqual(expect.arrayContaining(['./ui/Button.stories.tsx', './ui/Card.stories.tsx']));
  });

  it('has stories for every shared component', () => {
    const missing = SHARED_COMPONENTS.filter((file) => !(file.replace(/\.tsx$/, '.stories.tsx') in MODULES));
    expect(missing).toEqual([]);
  });

  for (const [file, module] of Object.entries(MODULES)) {
    // composeStories can't infer story types from a glob of mixed modules; each one is a component.
    const stories = Object.entries(composeStories(module)) as [string, ComposedStory][];

    it(`${file} has stories`, () => {
      expect(stories.length).toBeGreaterThan(0);
    });

    // Renders the story, then runs its play function: the story's interaction assertions.
    it.each(stories)(`${file}: %s`, async (_name, Story) => {
      const { container } = render(<Story />);
      expect(container.firstElementChild ?? document.body.querySelector('[role="dialog"]')).not.toBeNull();
      await Story.play?.({ canvasElement: container });
    });
  }
});
