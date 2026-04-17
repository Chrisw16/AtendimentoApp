import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100vh', gap: 16, padding: 32,
          fontFamily: 'sans-serif',
        }}>
          <div style={{ fontSize: 32 }}>⚠️</div>
          <h2 style={{ margin: 0, color: '#1B3A8C' }}>Erro ao carregar</h2>
          <p style={{ color: '#666', margin: 0, textAlign: 'center', maxWidth: 400 }}>
            {this.state.error?.message || 'Ocorreu um erro inesperado.'}
          </p>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            style={{
              padding: '8px 20px', borderRadius: 8, border: 'none',
              background: '#2050B8', color: '#fff', cursor: 'pointer', fontSize: 14,
            }}>
            Recarregar página
          </button>
          <details style={{ fontSize: 11, color: '#999', maxWidth: 600 }}>
            <summary style={{ cursor: 'pointer' }}>Detalhes técnicos</summary>
            <pre style={{ marginTop: 8, background: '#f5f5f5', padding: 12, borderRadius: 6, overflow: 'auto' }}>
              {this.state.error?.stack}
            </pre>
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}
