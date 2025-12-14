import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  error: Error | null;
}
export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };
  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }
  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.reportError(error, errorInfo);
  }
  private reportError = (error: Error, errorInfo?: ErrorInfo) => {
    try {
      const payload = {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo?.componentStack,
        url: window.location.href,
        timestamp: new Date().toISOString(),
        errorBoundary: true,
      };
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/client-errors', JSON.stringify(payload));
      } else {
        // Fallback for older browsers
        fetch('/api/client-errors', {
          method: 'POST',
          body: JSON.stringify(payload),
          headers: { 'Content-Type': 'application/json' },
        });
      }
      toast.info("Error report has been sent to the developers.");
    } catch (e) {
      console.error("Failed to report client error:", e);
    }
  };
  private handleRedirect = () => {
    toast.info("Redirecting to the homepage...");
    setTimeout(() => {
      window.location.href = '/';
    }, 1000);
  };
  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };
  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center bg-muted/40 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-md"
          >
            <Card className="w-full text-center">
              <CardHeader>
                <div className="mx-auto bg-destructive/10 text-destructive rounded-full w-12 h-12 flex items-center justify-center mb-4">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <CardTitle className="text-2xl font-display">Oops! Something went wrong.</CardTitle>
                <CardDescription>
                  An unexpected error occurred. Our team has been notified.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <details className="text-left bg-muted p-2 rounded-md text-xs">
                  <summary>Error Details</summary>
                  <pre className="mt-2 whitespace-pre-wrap break-all bg-background/50 p-2 rounded overflow-x-auto">
                    <code>{this.state.error?.message}</code>
                  </pre>
                </details>
              </CardContent>
              <CardFooter className="flex flex-col sm:flex-row justify-center gap-4">
                <Button onClick={this.handleRetry}>Retry</Button>
                <Button variant="outline" onClick={this.handleRedirect}>Go to Homepage</Button>
              </CardFooter>
            </Card>
          </motion.div>
        </div>
      );
    }
    return this.props.children;
  }
}