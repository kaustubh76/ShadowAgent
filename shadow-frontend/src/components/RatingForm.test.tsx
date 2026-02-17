import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '../test/utils';
import userEvent from '@testing-library/user-event';
import RatingForm from './RatingForm';

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onSubmit: vi.fn(),
  agentAddress: 'aleo1abcdefghijklmnopqrstuvwxyz1234567890abcdef',
};

describe('RatingForm', () => {
  it('renders nothing when not open', () => {
    const { container } = render(<RatingForm {...defaultProps} isOpen={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders modal when open', () => {
    render(<RatingForm {...defaultProps} />);
    expect(screen.getByText('Submit Rating')).toBeInTheDocument();
  });

  it('shows truncated agent address', () => {
    render(<RatingForm {...defaultProps} />);
    expect(screen.getByText(/aleo1abcdefghijklmn\.\.\./)).toBeInTheDocument();
  });

  it('has 5 star buttons', () => {
    render(<RatingForm {...defaultProps} />);
    // Find star buttons by their role
    const buttons = screen.getAllByRole('button');
    // 5 stars + close + cancel + submit = 8 buttons
    expect(buttons.length).toBe(8);
  });

  it('submit button is disabled when no rating selected', () => {
    render(<RatingForm {...defaultProps} />);
    const submitBtn = screen.getByText('Submit Rating').closest('button');
    expect(submitBtn).toBeDisabled();
  });

  it('submit button is disabled when no job hash', async () => {
    const user = userEvent.setup();
    render(<RatingForm {...defaultProps} />);

    // Click the 4th star
    const starButtons = screen.getAllByRole('button');
    await user.click(starButtons[3]); // 4th star (0-indexed)

    const submitBtn = screen.getByText('Submit Rating').closest('button');
    expect(submitBtn).toBeDisabled();
  });

  it('enables submit when rating and job hash are provided', async () => {
    const user = userEvent.setup();
    render(<RatingForm {...defaultProps} />);

    // Click the 4th star
    const starButtons = screen.getAllByRole('button');
    await user.click(starButtons[3]);

    // Type job hash
    const input = screen.getByPlaceholderText(/enter the job hash/i);
    await user.type(input, 'job123');

    const submitBtn = screen.getByText('Submit Rating').closest('button');
    expect(submitBtn).not.toBeDisabled();
  });

  it('calls onSubmit with scaled rating and job hash', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<RatingForm {...defaultProps} onSubmit={onSubmit} />);

    // Click 4th star (rating = 4, scaled = 40)
    const starButtons = screen.getAllByRole('button');
    await user.click(starButtons[3]);

    // Type job hash
    const input = screen.getByPlaceholderText(/enter the job hash/i);
    await user.type(input, 'job123');

    // Submit
    const submitBtn = screen.getByText('Submit Rating').closest('button')!;
    await user.click(submitBtn);

    expect(onSubmit).toHaveBeenCalledWith(40, 'job123');
  });

  it('calls onClose when cancel is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<RatingForm {...defaultProps} onClose={onClose} />);

    await user.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows scaled rating text after selection', async () => {
    const user = userEvent.setup();
    render(<RatingForm {...defaultProps} />);

    const starButtons = screen.getAllByRole('button');
    await user.click(starButtons[2]); // 3rd star

    expect(screen.getByText(/3\/5 stars \(scaled: 30\/50\)/)).toBeInTheDocument();
  });
});
