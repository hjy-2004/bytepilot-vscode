import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] UI crashed:', error.message, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          color: 'var(--bytepilot-fg-primary)',
          background: 'var(--bytepilot-bg-primary)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '12px', opacity: 0.5 }}>&#9888;</div>
          <h3 style={{ marginBottom: '8px', fontWeight: 500 }}>Something went wrong</h3>
          <p style={{
            fontSize: '12px',
            color: 'var(--bytepilot-fg-secondary)',
            marginBottom: '16px',
            maxWidth: '360px',
            lineHeight: 1.5,
          }}>
            {this.state.error?.message || 'An unexpected error occurred in the UI.'}
          </p>
          <button
            onClick={this.handleRetry}
            style={{
              padding: '6px 16px',
              background: 'var(--bytepilot-btn-bg)',
              color: 'var(--bytepilot-btn-fg)',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
