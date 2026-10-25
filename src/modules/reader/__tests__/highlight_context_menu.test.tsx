import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { HighlightContextMenu } from '../components/HighlightContextMenu';

describe('HighlightContextMenu Component & Save Feedback', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const defaultProps = {
    position: { x: 200, y: 150 },
    selectedText: 'A wonderful sentence from the novel',
    onSave: vi.fn(),
    onClose: vi.fn(),
  };

  it('renders correctly with the selected quote preview', () => {
    render(<HighlightContextMenu {...defaultProps} />);

    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText(/A wonderful sentence from the novel/)).toBeDefined();
    expect(screen.getByLabelText('Highlight with Yellow')).toBeDefined();
  });

  it('shows "Saved" indicator and closes on successful quick highlight', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(<HighlightContextMenu {...defaultProps} onSave={onSave} onClose={onClose} />);

    const pinkButton = screen.getByLabelText('Highlight with Pink');
    await act(async () => {
      fireEvent.click(pinkButton);
    });

    expect(onSave).toHaveBeenCalledWith('pink', undefined, false);
    expect(screen.getByText('Saved')).toBeDefined();

    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('displays error alert and does not close when quick highlight fails', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Network disconnected or session expired'));
    const onClose = vi.fn();

    render(<HighlightContextMenu {...defaultProps} onSave={onSave} onClose={onClose} />);

    const greenButton = screen.getByLabelText('Highlight with Green');
    await act(async () => {
      fireEvent.click(greenButton);
    });

    expect(onSave).toHaveBeenCalledWith('green', undefined, false);

    const alert = screen.getByRole('alert');
    expect(alert).toBeDefined();
    expect(alert.textContent).toContain('Network disconnected or session expired');

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('saves custom reflection note and preserves note text on failure', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Database RLS error'));
    const onClose = vi.fn();

    render(<HighlightContextMenu {...defaultProps} onSave={onSave} onClose={onClose} />);

    // Open note input
    const noteToggle = screen.getByTitle('Attach Note');
    fireEvent.click(noteToggle);

    const textarea = screen.getByPlaceholderText('Add reflection or note...') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'This passage reminds me of chapter 1' } });

    // Toggle shared with space
    const shareToggle = screen.getByText('Private Note');
    fireEvent.click(shareToggle);
    expect(screen.getByText('Shared with Space')).toBeDefined();

    // Click Save Note
    const saveButton = screen.getByRole('button', { name: /Save Note/i });
    await act(async () => {
      fireEvent.click(saveButton);
    });

    expect(onSave).toHaveBeenCalledWith('yellow', 'This passage reminds me of chapter 1', true);

    // Verify error is shown
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Database RLS error');

    // Note is preserved inside textarea
    expect(textarea.value).toBe('This passage reminds me of chapter 1');

    // Dialog stays open so user does not lose input
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows "Saved!" button state and closes when note save succeeds', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(<HighlightContextMenu {...defaultProps} onSave={onSave} onClose={onClose} />);

    // Open note input
    const noteToggle = screen.getByTitle('Attach Note');
    fireEvent.click(noteToggle);

    const textarea = screen.getByPlaceholderText('Add reflection or note...');
    fireEvent.change(textarea, { target: { value: 'Reflective insight' } });

    const saveButton = screen.getByRole('button', { name: /Save Note/i });
    await act(async () => {
      fireEvent.click(saveButton);
    });

    expect(screen.getByText('Saved!')).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(450);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
