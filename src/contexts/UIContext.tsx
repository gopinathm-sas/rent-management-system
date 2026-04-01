import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { X, AlertTriangle, CheckCircle, Info, HelpCircle } from 'lucide-react';

type ToastType = 'info' | 'success' | 'warning' | 'error' | 'confirm' | 'danger';

interface Toast {
    id: number;
    message: string;
    type: ToastType;
}

interface ConfirmOptions {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'confirm' | 'danger';
}

interface ConfirmState extends ConfirmOptions {
    isOpen: boolean;
    resolve: ((value: boolean) => void) | null;
}

interface UIContextType {
    showToast: (message: string, type?: ToastType) => void;
    confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export function useUI() {
    const context = useContext(UIContext);
    if (!context) {
        throw new Error('useUI must be used within a UIProvider');
    }
    return context;
}

export function UIProvider({ children }: { children: ReactNode }) {
    // --- Toast State ---
    const [toasts, setToasts] = useState<Toast[]>([]);

    // --- Confirm Dialog State ---
    const [confirmState, setConfirmState] = useState<ConfirmState>({
        isOpen: false,
        title: '',
        message: '',
        confirmText: 'Confirm',
        cancelText: 'Cancel',
        type: 'confirm',
        resolve: null
    });

    // --- Toast Logic ---
    const showToast = useCallback((message: string, type: ToastType = 'info') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);

        // Auto remove after 3s
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 3000);
    }, []);

    const removeToast = (id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    // --- Confirm Logic ---
    const confirm = useCallback(({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', type = 'confirm' }: ConfirmOptions): Promise<boolean> => {
        return new Promise((resolve) => {
            setConfirmState({
                isOpen: true,
                title,
                message,
                confirmText,
                cancelText,
                type,
                resolve
            });
        });
    }, []);

    const handleConfirm = () => {
        if (confirmState.resolve) confirmState.resolve(true);
        setConfirmState(prev => ({ ...prev, isOpen: false }));
    };

    const handleCancel = () => {
        if (confirmState.resolve) confirmState.resolve(false);
        setConfirmState(prev => ({ ...prev, isOpen: false }));
    };

    return (
        <UIContext.Provider value={{ showToast, confirm }}>
            {children}

            {/* Render Toasts (Bottom Center) */}
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none">
                {toasts.map(toast => (
                    <div
                        key={toast.id}
                        className={`pointer-events-auto flex items-center gap-3 px-6 py-3 rounded-2xl shadow-xl border animate-in slide-in-from-bottom-5 fade-in duration-300 min-w-[300px] justify-between ${toast.type === 'error' ? 'bg-rose-50 border-rose-100 text-rose-700' :
                            toast.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
                                toast.type === 'warning' ? 'bg-amber-50 border-amber-100 text-amber-700' :
                                    'bg-slate-50 border-slate-200 text-slate-700'
                            }`}
                    >
                        <div className="flex items-center gap-3">
                            {toast.type === 'error' && <AlertTriangle size={20} />}
                            {toast.type === 'success' && <CheckCircle size={20} />}
                            {toast.type === 'warning' && <AlertTriangle size={20} />}
                            {toast.type === 'info' && <Info size={20} />}
                            <span className="font-bold text-sm">{toast.message}</span>
                        </div>
                        <button onClick={() => removeToast(toast.id)} className="opacity-50 hover:opacity-100">
                            <X size={16} />
                        </button>
                    </div>
                ))}
            </div>

            {/* Render Confirm Dialog */}
            {confirmState.isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-[400px] overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-8 text-center space-y-4">
                            <div className={`mx-auto size-16 rounded-full flex items-center justify-center mb-2 ${confirmState.type === 'danger' ? 'bg-rose-100 text-rose-600' : 'bg-blue-100 text-blue-600'
                                }`}>
                                {confirmState.type === 'danger' ? <AlertTriangle size={32} /> : <HelpCircle size={32} />}
                            </div>

                            <h3 className="text-xl font-extrabold text-slate-900 leading-tight">
                                {confirmState.title}
                            </h3>
                            <p className="text-slate-500 font-medium">
                                {confirmState.message}
                            </p>
                        </div>

                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3">
                            <button
                                onClick={handleCancel}
                                className="flex-1 py-3 px-4 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors"
                            >
                                {confirmState.cancelText}
                            </button>
                            <button
                                onClick={handleConfirm}
                                className={`flex-1 py-3 px-4 rounded-xl font-bold text-white shadow-lg transition-all hover:scale-105 active:scale-95 ${confirmState.type === 'danger'
                                    ? 'bg-rose-500 hover:bg-rose-600 shadow-rose-200'
                                    : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'
                                    }`}
                            >
                                {confirmState.confirmText}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </UIContext.Provider>
    );
}
