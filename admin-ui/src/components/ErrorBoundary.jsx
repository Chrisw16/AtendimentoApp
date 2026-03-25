import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: 16, opacity: .4 }}>⚠️</div>
          <h2 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: '1.3rem', marginBottom: 8 }}>Algo deu errado</h2>
          <p style={{ color: 'var(--muted)', fontSize: '.85rem', marginBottom: 16 }}>
            {this.state.error?.message || 'Erro inesperado'}
          </p>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
          >
            🔄 Recarregar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
