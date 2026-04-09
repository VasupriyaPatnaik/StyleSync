import { render, screen } from '@testing-library/react';
import App from './App';

test('renders StyleSync heading', () => {
  render(<App />);
  const title = screen.getByText(/stylesync/i);
  expect(title).toBeInTheDocument();
});
