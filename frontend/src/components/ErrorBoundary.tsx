/**
 * Global Error Boundary — catch render errors and show a recovery UI.
 */
import React, { type ErrorInfo, type ReactNode } from 'react';
import { Container, Button } from 'react-bootstrap';

type Props = { children: ReactNode };
type State = { hasError: boolean; error: Error | null };

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, info);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <Container className="py-5 text-center">
          <div className="glass-panel p-5 mx-auto" style={{ maxWidth: 480 }}>
            <span style={{ fontSize: '4rem' }}>💥</span>
            <h3 className="fw-bold mt-3">Щось пішло не так</h3>
            <p className="text-muted mb-4">
              Сталася несподівана помилка. Спробуйте перезавантажити сторінку.
            </p>
            {import.meta.env.DEV && this.state.error && (
              <pre
                className="text-start text-danger small p-3"
                style={{ background: 'rgba(239,68,68,0.1)', overflow: 'auto' }}
              >
                {this.state.error.toString()}
              </pre>
            )}
            <Button className="btn-accent mt-3" onClick={this.handleReset}>
              🔄 Повернутися на головну
            </Button>
          </div>
        </Container>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
