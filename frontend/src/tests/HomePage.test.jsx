import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import axios from 'axios';
import HomePage from '../pages/HomePage';

const mockNavigate = vi.fn();

vi.mock('axios');
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const renderHomePage = () => render(
  <BrowserRouter>
    <HomePage />
  </BrowserRouter>,
);

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('renders create and join sections', () => {
    renderHomePage();

    expect(screen.getByText(/Create\s+a\s+Meeting/i)).toBeInTheDocument();
    expect(screen.getByText(/Join\s+a\s+Meeting/i)).toBeInTheDocument();
  });

  it('shows error when name empty on create', () => {
    renderHomePage();

    fireEvent.click(screen.getByRole('button', { name: /create room/i }));

    expect(screen.getByText(/Enter your display name\./i)).toBeInTheDocument();
  });

  it('shows error when room name empty', () => {
    renderHomePage();

    fireEvent.change(screen.getByLabelText(/your display name/i, { selector: '#create-name' }), {
      target: { value: 'Alice' },
    });

    fireEvent.click(screen.getByRole('button', { name: /create room/i }));

    expect(screen.getByText(/Enter a room name\./i)).toBeInTheDocument();
  });

  it('successful room creation navigates', async () => {
    axios.post.mockResolvedValue({
      data: { room_code: 'ABCD1234', name: 'Test' },
    });

    renderHomePage();

    fireEvent.change(screen.getByLabelText(/your display name/i, { selector: '#create-name' }), {
      target: { value: 'Alice' },
    });

    fireEvent.change(screen.getByLabelText(/room name/i), {
      target: { value: 'Test Meeting' },
    });

    fireEvent.click(screen.getByRole('button', { name: /create room/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/room/ABCD1234');
    });
  });

  it('shows error on API failure', async () => {
    axios.post.mockRejectedValue(new Error('Network Error'));

    renderHomePage();

    fireEvent.change(screen.getByLabelText(/your display name/i, { selector: '#create-name' }), {
      target: { value: 'Alice' },
    });

    fireEvent.change(screen.getByLabelText(/room name/i), {
      target: { value: 'Test Meeting' },
    });

    fireEvent.click(screen.getByRole('button', { name: /create room/i }));

    await waitFor(() => {
      expect(screen.getByText(/Could not create room\. Try again\./i)).toBeInTheDocument();
    });
  });

  it('join code converted to uppercase', () => {
    renderHomePage();

    const joinCodeInput = screen.getByLabelText(/room code/i);
    fireEvent.change(joinCodeInput, { target: { value: 'abcd1234' } });

    expect(joinCodeInput).toHaveValue('ABCD1234');
  });
});
