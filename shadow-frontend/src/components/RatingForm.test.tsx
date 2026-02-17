import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RatingForm from './RatingForm';

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onSubmit: vi.fn(),
  agentAddress: 'aleo1abcdefghijklmnopqrstuvwxyz1234567890abcdef',
};

describe('RatingForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when not open', () => {
    const { container } = render(<RatingForm {...defaultProps} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders modal when open', () => {
    render(<RatingForm {...defaultProps} />);
    // Heading text 'Submit Rating' appears in the h2
    expect(screen.getByRole('heading', { name: /submit rating/i })).toBeInTheDocument();
  });

  it('shows truncated agent address', () => {
    render(<RatingForm {...defaultProps} />);
    // agentAddress.slice(0, 16) = 'aleo1abcdefghijk' + '...'
    expect(screen.getByText('aleo1abcdefghijk...')).toBeInTheDocument();
  });

  it('has star buttons, close, cancel and submit', () => {
    render(<RatingForm {...defaultProps} />);
    const buttons = screen.getAllByRole('button');
    // 5 stars + close(X) + cancel + submit = 8
    expect(buttons.length).toBe(8);
  });

  it('submit button is disabled when no rating selected', () => {
    render(<RatingForm {...defaultProps} />);
    // Get the submit button by its text content
    const submitBtn = screen.getByRole('button', { name: /submit rating/i });
    expect(submitBtn).toBeDisabled();
  });

  it('submit button is disabled when no job hash', async () => {
    const user = userEvent.setup();
    render(<RatingForm {...defaultProps} />);

    // Click the 4th star (buttons[3] = 4th star since close(X) is last in the header)
    // Stars are rendered first in the DOM order inside the rating section
    const starButtons = screen.getAllByRole('button').filter(btn =>
      btn.querySelector('svg.w-8')
    );
    if (starButtons.length >= 4) {
      await user.click(starButtons[3]);
    }

    const submitBtn = screen.getByRole('button', { name: /submit rating/i });
    expect(submitBtn).toBeDisabled();
  });

  it('enables submit when rating and job hash are provided', async () => {
    const user = userEvent.setup();
    render(<RatingForm {...defaultProps} />);

    // Click a star
    const starButtons = screen.getAllByRole('button').filter(btn =>
      btn.querySelector('svg.w-8')
    );
    if (starButtons.length >= 4) {
      await user.click(starButtons[3]);
    }

    // Type job hash
    const input = screen.getByPlaceholderText(/enter the job hash/i);
    await user.type(input, 'job123');

    const submitBtn = screen.getByRole('button', { name: /submit rating/i });
    expect(submitBtn).not.toBeDisabled();
  });

  it('calls onSubmit with scaled rating and job hash', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<RatingForm {...defaultProps} onSubmit={onSubmit} />);

    // Click 4th star
    const starButtons = screen.getAllByRole('button').filter(btn =>
      btn.querySelector('svg.w-8')
    );
    if (starButtons.length >= 4) {
      await user.click(starButtons[3]);
    }

    // Type job hash
    const input = screen.getByPlaceholderText(/enter the job hash/i);
    await user.type(input, 'job123');

    // Submit
    const submitBtn = screen.getByRole('button', { name: /submit rating/i });
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

  it('shows scaled rating text after star selection', async () => {
    const user = userEvent.setup();
    render(<RatingForm {...defaultProps} />);

    // Click 3rd star
    const starButtons = screen.getAllByRole('button').filter(btn =>
      btn.querySelector('svg.w-8')
    );
    if (starButtons.length >= 3) {
      await user.click(starButtons[2]);
    }

    expect(screen.getByText(/3\/5 stars/)).toBeInTheDocument();
  });
});
