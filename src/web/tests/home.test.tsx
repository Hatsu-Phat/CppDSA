import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import Home from '../app/page';
import { BRAND } from '../lib/brand';

describe('Web Home Page', () => {
  it('renders heading with project title', () => {
    render(<Home />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toBeDefined();
    expect(heading.textContent).toBe(BRAND.heroHeadline);
    expect(screen.getByText(BRAND.name)).toBeDefined();
    expect(screen.getByText(BRAND.subject)).toBeDefined();
  });
});
