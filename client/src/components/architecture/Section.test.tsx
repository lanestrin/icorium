import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Path } from './Section';

describe('Path', () => {
  it('keeps the exact path text and allows a line break after each slash', () => {
    const path = 'client/src/components/compare/CategoryChart.tsx';
    const { container } = render(<Path>{path}</Path>);
    const code = container.querySelector('code')!;
    expect(code).toHaveTextContent(path, { normalizeWhitespace: false });
    expect(code.textContent).toBe(path);
    expect(code.querySelectorAll('wbr')).toHaveLength(4); // one per slash
    expect(code.innerHTML).toBe('client/<wbr>src/<wbr>components/<wbr>compare/<wbr>CategoryChart.tsx');
  });

  it('renders a name without slashes unchanged', () => {
    const { container } = render(<Path>package.json</Path>);
    expect(container.querySelector('code')!.innerHTML).toBe('package.json');
  });
});
