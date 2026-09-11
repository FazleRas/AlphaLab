import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the header and the four tabs', () => {
  render(<App />);
  expect(screen.getByText('ALPHALAB')).toBeInTheDocument();
  for (const tab of ['dashboard', 'scanner', 'backtest', 'watchlist']) {
    expect(screen.getByRole('button', { name: tab })).toBeInTheDocument();
  }
});
