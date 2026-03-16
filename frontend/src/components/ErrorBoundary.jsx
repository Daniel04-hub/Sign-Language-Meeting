import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: 680,
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
            }}
          >
            <div className="card-body p-4">
              <h2 style={{ marginBottom: 8, fontWeight: 700 }}>Something went wrong</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
                An unexpected error occurred in the app.
              </p>

              <pre
                style={{
                  background: '#3A3A3C',
                  border: '1px solid var(--border-color)',
                  borderRadius: 8,
                  color: '#E5E5EA',
                  padding: 12,
                  maxHeight: 220,
                  overflow: 'auto',
                  marginBottom: 16,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {this.state.error?.message || 'Unknown error'}
              </pre>

              <div className="d-flex gap-2">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => window.location.reload()}
                >
                  Reload Page
                </button>
                <button
                  type="button"
                  className="btn btn-outline-light"
                  onClick={() => { window.location.href = '/'; }}
                >
                  Go Home
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
