import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="h-screen w-screen bg-surface-950 text-white flex flex-col items-center justify-center p-8 text-center">
                    <h1 className="text-3xl font-bold text-red-500 mb-4">Something went wrong.</h1>
                    <p className="text-surface-300 mb-8 max-w-lg">
                        The application encountered an unexpected error.
                        Please try clearing your data if this persists.
                    </p>

                    <div className="bg-surface-900 p-4 rounded-lg border border-red-900/50 mb-8 text-left max-w-2xl w-full overflow-auto max-h-64">
                        <code className="font-mono text-xs text-red-200 block whitespace-pre-wrap">
                            {this.state.error?.toString()}
                        </code>
                    </div>

                    <button
                        onClick={() => {
                            localStorage.clear();
                            window.location.reload();
                        }}
                        className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium"
                    >
                        Clear Data & Reset App
                    </button>
                    <p className="text-xs text-surface-500 mt-2">Warning: This will delete your library configuration.</p>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
