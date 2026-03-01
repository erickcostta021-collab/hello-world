import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <h2 className="text-xl font-semibold text-foreground">Algo deu errado</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Ocorreu um erro inesperado. Tente recarregar a página.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={this.handleReset}>
              Tentar novamente
            </Button>
            <Button onClick={() => window.location.reload()}>
              Recarregar página
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
