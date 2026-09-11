import { render, screen, fireEvent } from '@testing-library/react';
import SweepHeatmap from './SweepHeatmap';

const cell = (buy, sell, ret) => ({
  buy_rsi: buy, sell_rsi: sell, total_return_pct: ret,
  cagr_pct: ret, sharpe: 1, win_rate_pct: 50, max_drawdown_pct: -5, num_trades: 3,
});

const grid2x2 = {
  ticker: 'TEST', period: '2y', strategy: 'rsi',
  buy_values: [20, 25], sell_values: [70, 75],
};

test('a partially filled sweep shows progress and pending cells', () => {
  const data = { ...grid2x2, grid: [cell(20, 70, 4), cell(25, 70, 9)], best: cell(25, 70, 9) };
  const progress = { completed: 2, total: 4, status: 'running' };
  render(<SweepHeatmap data={data} metric="total_return_pct" progress={progress} />);

  expect(screen.getByText('RUNNING · 2 / 4')).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
  // computed cells are buttons; the two not-yet-computed cells are inert
  expect(screen.getAllByRole('button')).toHaveLength(2);
  expect(screen.getAllByLabelText(/pending$/)).toHaveLength(2);
  expect(screen.getByLabelText('BUY<20 / SELL>75 pending')).toBeInTheDocument();
});

test('a finished sweep has no progress chrome and every cell is clickable', () => {
  const data = {
    ...grid2x2,
    grid: [cell(20, 70, 4), cell(25, 70, 9), cell(20, 75, -1), cell(25, 75, null)],
    best: cell(25, 70, 9),
  };
  const onSelect = jest.fn();
  render(
    <SweepHeatmap
      data={data}
      metric="total_return_pct"
      progress={{ completed: 4, total: 4, status: 'done' }}
      onSelect={onSelect}
    />,
  );

  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  expect(screen.getAllByRole('button')).toHaveLength(4);

  fireEvent.click(screen.getByRole('button', { name: '9%' }));
  expect(onSelect).toHaveBeenCalledWith(25, 70);
  // a cell that never traded renders a dash and does not drill in
  fireEvent.click(screen.getByRole('button', { name: '—' }));
  expect(onSelect).toHaveBeenCalledTimes(1);
});

test('a cancelled sweep keeps its partial grid and says so', () => {
  const data = { ...grid2x2, grid: [cell(20, 70, 4)], best: cell(20, 70, 4) };
  render(
    <SweepHeatmap data={data} metric="total_return_pct" progress={{ completed: 1, total: 4, status: 'cancelled' }} />,
  );
  expect(screen.getByText('CANCELLED · 1 / 4')).toBeInTheDocument();
  expect(screen.getAllByRole('button')).toHaveLength(1);
});
