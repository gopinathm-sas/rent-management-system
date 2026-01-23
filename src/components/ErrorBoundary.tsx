import React, { Component, ErrorInfo, ReactNode } from 'react';

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
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="p-8 max-w-2xl mx-auto mt-20 bg-red-50 rounded-xl border border-red-200">
                    <h1 className="text-2xl font-bold text-red-800 mb-4">Something went wrong</h1>
                    <pre className="bg-white p-4 rounded-lg overflow-auto text-red-600 text-sm border border-red-100">
                        {this.state.error?.toString()}
                    </pre>
                    <p className="mt-4 text-red-700">Please report this error to the developer.</p>
                </div>
            );
        }

        return this.props.children;
    }
}
