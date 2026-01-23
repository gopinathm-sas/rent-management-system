import { useState, ChangeEvent } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { analyzeReceipt } from '../services/gemini';
import { useUI } from '../contexts/UIContext';

interface ReceiptScannerProps {
    onScanComplete: (data: any) => void;
}

export default function ReceiptScanner({ onScanComplete }: ReceiptScannerProps) {
    const [scanning, setScanning] = useState(false);
    const { showToast } = useUI();

    const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setScanning(true);
        try {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const result = reader.result as string;
                if (!result) return;

                const base64String = result.split(',')[1];
                const mimeType = file.type;

                try {
                    const data = await analyzeReceipt(base64String, mimeType);
                    onScanComplete(data);
                    showToast("Receipt scanned successfully!", "success");
                } catch (err) {
                    console.error(err);
                    showToast("Failed to analyze receipt. Please try again.", "error");
                } finally {
                    setScanning(false);
                }
            };
            reader.readAsDataURL(file);
        } catch (error) {
            console.error(error);
            setScanning(false);
        }
    };

    return (
        <div className="relative">
            <input
                type="file"
                accept="image/*"
                className="hidden"
                id="receipt-upload"
                onChange={handleFileChange}
                disabled={scanning}
            />
            <label
                htmlFor="receipt-upload"
                className={`flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-semibold cursor-pointer hover:bg-indigo-700 transition-colors ${scanning ? 'opacity-70 pointer-events-none' : ''}`}
            >
                {scanning ? <Loader2 className="animate-spin" size={18} /> : <Camera size={18} />}
                {scanning ? 'Scanning...' : 'Scan Receipt'}
            </label>
        </div>
    );
}
