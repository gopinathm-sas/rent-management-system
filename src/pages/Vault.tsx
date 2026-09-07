import React, { useState, useMemo } from 'react';
import { useData } from '../contexts/DataContext';
import { useUI } from '../contexts/UIContext';
import { functions } from '../services/firebase';
import { httpsCallable } from 'firebase/functions';
import {
    FolderLock,
    Upload,
    FileText,
    FileImage,
    FileCode,
    File,
    Search,
    Trash2,
    Download,
    Edit3,
    Check,
    X,
    Sparkles,
    CheckCircle2,
    Clock,
    AlertCircle,
    Info,
    HelpCircle,
    Send,
    RotateCw,
    Eye,
    ExternalLink,
    ZoomIn,
    ZoomOut,
    Maximize2,
    Copy
} from 'lucide-react';
import { VaultDocument } from '../types';

export default function Vault() {
    const { vaultDocuments, uploadVaultDocument, updateVaultDocumentTitle, deleteVaultDocument, reprocessVaultDocument } = useData();
    const { showToast } = useUI();

    const [activeTab, setActiveTab] = useState<'documents' | 'ask'>('documents');
    const [searchQuery, setSearchQuery] = useState('');
    const [uploading, setUploading] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [editingDocId, setEditingDocId] = useState<string | null>(null);
    const [editTitleValue, setEditTitleValue] = useState('');
    const [docToDelete, setDocToDelete] = useState<VaultDocument | null>(null);

    // Preview Modal state
    const [previewDoc, setPreviewDoc] = useState<VaultDocument | null>(null);
    const [previewTab, setPreviewTab] = useState<'document' | 'text'>('document');
    const [zoomLevel, setZoomLevel] = useState<number>(100);
    const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
    const [pdfLoading, setPdfLoading] = useState(false);
    const [pdfViewerEngine, setPdfViewerEngine] = useState<'native' | 'google'>('native');

    // AI Q&A state
    const [askQuestion, setAskQuestion] = useState('');
    const [askingAi, setAskingAi] = useState(false);
    const [aiResponse, setAiResponse] = useState<{
        answer: string;
        sources?: string[];
        error?: string;
    } | null>(null);

    const filteredDocs = useMemo(() => {
        if (!searchQuery.trim()) return vaultDocuments;
        const q = searchQuery.toLowerCase().trim();
        return vaultDocuments.filter(d =>
            d.title.toLowerCase().includes(q) ||
            d.originalFilename.toLowerCase().includes(q) ||
            (d.extractedTextSample && d.extractedTextSample.toLowerCase().includes(q))
        );
    }, [vaultDocuments, searchQuery]);

    const stats = useMemo(() => {
        const total = vaultDocuments.length;
        const indexed = vaultDocuments.filter(d => d.extractionStatus === 'success').length;
        const totalBytes = vaultDocuments.reduce((sum, d) => sum + (d.sizeBytes || 0), 0);
        return { total, indexed, totalBytes };
    }, [vaultDocuments]);

    const formatFileSize = (bytes: number) => {
        if (!bytes || bytes === 0) return '0 B';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const getFileIcon = (contentType: string, filename: string) => {
        const mime = (contentType || '').toLowerCase();
        const lower = (filename || '').toLowerCase();
        if (mime.includes('pdf') || lower.endsWith('.pdf')) {
            return <FileText className="text-rose-500" size={24} />;
        }
        if (mime.startsWith('image/') || /\.(png|jpe?g|webp|heic|bmp)$/i.test(lower)) {
            return <FileImage className="text-blue-500" size={24} />;
        }
        if (mime.includes('text') || /\.(txt|md|csv|json)$/i.test(lower)) {
            return <FileCode className="text-emerald-500" size={24} />;
        }
        return <File className="text-slate-500" size={24} />;
    };

    const handleFileUpload = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        setUploading(true);

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                if (file.size > 50 * 1024 * 1024) {
                    showToast(`File ${file.name} exceeds 50MB limit`, 'error');
                    continue;
                }
                const defaultTitle = file.name.replace(/\.[^/.]+$/, "");
                await uploadVaultDocument(file, defaultTitle);
            }
            showToast('Document uploaded! Extraction and indexing initiated.', 'success');
        } catch (err: any) {
            console.error('Upload error:', err);
            showToast(`Upload failed: ${err.message || 'Unknown error'}`, 'error');
        } finally {
            setUploading(false);
        }
    };

    const handleSaveTitle = async (docId: string) => {
        if (!editTitleValue.trim()) return;
        try {
            await updateVaultDocumentTitle(docId, editTitleValue.trim());
            setEditingDocId(null);
            showToast('Title updated', 'success');
        } catch (err: any) {
            showToast(`Failed to update title: ${err.message}`, 'error');
        }
    };

    const handleDelete = async () => {
        if (!docToDelete) return;
        try {
            await deleteVaultDocument(docToDelete.id, docToDelete.storagePath);
            showToast(`Deleted ${docToDelete.title}`, 'success');
            setDocToDelete(null);
        } catch (err: any) {
            showToast(`Failed to delete: ${err.message}`, 'error');
        }
    };

    const handleAskAi = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const q = askQuestion.trim();
        if (!q) return;

        setAskingAi(true);
        setAiResponse(null);

        try {
            const askFn = httpsCallable<{ question: string }, { answer: string; sources?: string[] }>(functions, 'askVaultAI');
            const res = await askFn({ question: q });
            setAiResponse({
                answer: res.data.answer,
                sources: res.data.sources
            });
        } catch (err: any) {
            console.error("AI Q&A error:", err);
            setAiResponse({
                answer: "Could not query your Personal Vault right now.",
                error: err.message || "Failed to query vault"
            });
        } finally {
            setAskingAi(false);
        }
    };

    const handleRetry = async (docId: string) => {
        try {
            await reprocessVaultDocument(docId);
            showToast('Retrying document extraction & indexing...', 'info');
        } catch (err: any) {
            showToast(err.message || 'Failed to trigger retry', 'error');
        }
    };

    const openPreview = (doc: VaultDocument) => {
        setPreviewDoc(doc);
        setPreviewTab('document');
        setZoomLevel(100);
        setPdfViewerEngine('native');
    };

    const copyExtractedText = (text?: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        showToast('Extracted text copied to clipboard!', 'success');
    };

    // Load PDF as blob URL for same-origin inline rendering in iframe/object
    React.useEffect(() => {
        if (!previewDoc) {
            if (pdfBlobUrl) {
                URL.revokeObjectURL(pdfBlobUrl);
                setPdfBlobUrl(null);
            }
            return;
        }

        const isPdf = previewDoc.contentType.includes('pdf') || previewDoc.originalFilename.toLowerCase().endsWith('.pdf');
        if (!isPdf || !previewDoc.downloadUrl) {
            return;
        }

        let isMounted = true;
        setPdfLoading(true);

        fetch(previewDoc.downloadUrl)
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.blob();
            })
            .then(rawBlob => {
                if (!isMounted) return;
                const pdfBlob = new Blob([rawBlob], { type: 'application/pdf' });
                const blobUrl = URL.createObjectURL(pdfBlob);
                setPdfBlobUrl(blobUrl);
                setPdfLoading(false);
            })
            .catch(err => {
                console.warn('PDF blob conversion notice (using direct URL):', err);
                if (isMounted) {
                    setPdfLoading(false);
                }
            });

        return () => {
            isMounted = false;
            if (pdfBlobUrl) {
                URL.revokeObjectURL(pdfBlobUrl);
                setPdfBlobUrl(null);
            }
        };
    }, [previewDoc?.id, previewDoc?.downloadUrl]);

    // Close preview on Escape key
    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setPreviewDoc(null);
                setDocToDelete(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-stone-200/80 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-emerald-100 text-emerald-800 rounded-2xl">
                        <FolderLock size={28} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                            Personal Vault
                            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">
                                RAG Search
                            </span>
                        </h1>
                        <p className="text-xs text-slate-500 font-medium">
                            Upload personal documents, agreements & certificates with AI text extraction & Telegram retrieval
                        </p>
                    </div>
                </div>

                {/* Metrics */}
                <div className="flex items-center gap-3 text-xs font-semibold text-slate-600 bg-stone-50 p-2 rounded-2xl border border-stone-200/60">
                    <div className="px-3 py-1.5 bg-white rounded-xl shadow-xs border border-stone-100">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Total Files</span>
                        <span className="text-slate-900 font-black text-sm">{stats.total}</span>
                    </div>
                    <div className="px-3 py-1.5 bg-white rounded-xl shadow-xs border border-stone-100">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Searchable</span>
                        <span className="text-emerald-700 font-black text-sm">{stats.indexed}</span>
                    </div>
                    <div className="px-3 py-1.5 bg-white rounded-xl shadow-xs border border-stone-100">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Storage</span>
                        <span className="text-slate-900 font-black text-sm">{formatFileSize(stats.totalBytes)}</span>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-2 border-b border-stone-200">
                <button
                    onClick={() => setActiveTab('documents')}
                    className={`pb-3 px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition-all ${
                        activeTab === 'documents'
                            ? 'border-emerald-600 text-emerald-800'
                            : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                >
                    <FileText size={16} />
                    Documents & Files ({vaultDocuments.length})
                </button>
                <button
                    onClick={() => setActiveTab('ask')}
                    className={`pb-3 px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition-all ${
                        activeTab === 'ask'
                            ? 'border-emerald-600 text-emerald-800'
                            : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                >
                    <Sparkles size={16} className="text-amber-500" />
                    Vault AI Q&A Search
                </button>
            </div>

            {activeTab === 'documents' ? (
                <>
                    {/* Drag & Drop Upload Zone */}
                    <div
                        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                        onDragLeave={() => setDragActive(false)}
                        onDrop={(e) => {
                            e.preventDefault();
                            setDragActive(false);
                            handleFileUpload(e.dataTransfer.files);
                        }}
                        className={`border-2 border-dashed rounded-3xl p-8 text-center transition-all bg-white ${
                            dragActive
                                ? 'border-emerald-500 bg-emerald-50/50 scale-[0.99]'
                                : 'border-stone-200 hover:border-emerald-400 hover:bg-stone-50/50'
                        }`}
                    >
                        <div className="flex flex-col items-center justify-center space-y-3">
                            <div className="p-4 bg-emerald-50 text-emerald-700 rounded-full">
                                <Upload size={28} />
                            </div>
                            <div>
                                <h3 className="text-sm font-black text-slate-800">
                                    {uploading ? 'Uploading & Processing Document...' : 'Upload Personal Documents'}
                                </h3>
                                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                                    Drag and drop any file here (PDFs, ID proofs, scanned agreements, images, receipts) or browse
                                </p>
                            </div>

                            <label className="cursor-pointer inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-2xl shadow-sm transition-transform active:scale-95">
                                <Upload size={14} />
                                Browse Files
                                <input
                                    type="file"
                                    multiple
                                    className="hidden"
                                    onChange={(e) => handleFileUpload(e.target.files)}
                                    disabled={uploading}
                                />
                            </label>
                            <p className="text-[11px] text-slate-400 font-medium">Supports PDF, JPG, PNG, DOCX, TXT (Max 50MB)</p>
                        </div>
                    </div>

                    {/* Search & Filter Bar */}
                    <div className="flex items-center justify-between gap-4">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                type="text"
                                placeholder="Search documents by title or keywords..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-white border border-stone-200 rounded-2xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                        </div>
                    </div>

                    {/* Documents Grid */}
                    {filteredDocs.length === 0 ? (
                        <div className="bg-white rounded-3xl p-12 text-center border border-stone-200/80">
                            <Info className="mx-auto text-slate-300 mb-3" size={36} />
                            <h4 className="text-sm font-bold text-slate-700">No documents found</h4>
                            <p className="text-xs text-slate-400 mt-1">
                                {searchQuery ? 'Try matching another search query.' : 'Upload your first document above to get started!'}
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {filteredDocs.map((doc) => {
                                const isEditing = editingDocId === doc.id;
                                const isSuccess = doc.extractionStatus === 'success';
                                const isPending = doc.extractionStatus === 'pending';
                                const isFailed = doc.extractionStatus === 'failed';
                                const isUnsupported = doc.extractionStatus === 'unsupported';

                                return (
                                    <div
                                        key={doc.id}
                                        className="bg-white border border-stone-200/90 hover:border-emerald-300 rounded-3xl p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4"
                                    >
                                        <div className="space-y-3">
                                            {/* Top Row: Icon & Status Badge */}
                                            <div className="flex items-start justify-between gap-2">
                                                <div
                                                    onClick={() => openPreview(doc)}
                                                    className="p-2.5 bg-stone-100 hover:bg-emerald-50 rounded-2xl cursor-pointer transition"
                                                    title="Click to preview document"
                                                >
                                                    {getFileIcon(doc.contentType, doc.originalFilename)}
                                                </div>

                                                <div>
                                                    {isSuccess && (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                            <CheckCircle2 size={11} />
                                                            Indexed ({doc.chunkCount || 1} chunks)
                                                        </span>
                                                    )}
                                                    {isPending && (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
                                                            <Clock size={11} />
                                                            Extracting...
                                                        </span>
                                                    )}
                                                    {isUnsupported && (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                                                            <HelpCircle size={11} />
                                                            Title Only
                                                        </span>
                                                    )}
                                                    {isFailed && (
                                                        <div className="flex items-center gap-1">
                                                            <span
                                                                className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200"
                                                                title={doc.error || 'Extraction failed'}
                                                            >
                                                                <AlertCircle size={11} />
                                                                Failed
                                                            </span>
                                                            <button
                                                                onClick={() => handleRetry(doc.id)}
                                                                className="p-1 rounded-lg text-rose-600 hover:text-rose-800 hover:bg-rose-100 transition"
                                                                title="Retry Extraction"
                                                            >
                                                                <RotateCw size={12} />
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Title Edit or Display */}
                                            <div>
                                                {isEditing ? (
                                                    <div className="flex items-center gap-1.5 mt-1">
                                                        <input
                                                            type="text"
                                                            value={editTitleValue}
                                                            onChange={(e) => setEditTitleValue(e.target.value)}
                                                            className="flex-1 px-2.5 py-1 text-xs font-bold border border-emerald-400 rounded-xl focus:outline-none"
                                                            autoFocus
                                                        />
                                                        <button
                                                            onClick={() => handleSaveTitle(doc.id)}
                                                            className="p-1.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700"
                                                        >
                                                            <Check size={13} />
                                                        </button>
                                                        <button
                                                            onClick={() => setEditingDocId(null)}
                                                            className="p-1.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200"
                                                        >
                                                            <X size={13} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-start justify-between group">
                                                        <h4
                                                            onClick={() => openPreview(doc)}
                                                            className="text-sm font-black text-slate-900 leading-tight cursor-pointer hover:text-emerald-700 transition"
                                                            title="Click to preview document"
                                                        >
                                                            {doc.title}
                                                        </h4>
                                                        <button
                                                            onClick={() => {
                                                                setEditingDocId(doc.id);
                                                                setEditTitleValue(doc.title);
                                                            }}
                                                            className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-slate-700 transition"
                                                            title="Edit Title"
                                                        >
                                                            <Edit3 size={13} />
                                                        </button>
                                                    </div>
                                                )}
                                                <p className="text-[11px] text-slate-400 truncate mt-0.5 font-mono">
                                                    {doc.originalFilename}
                                                </p>
                                            </div>

                                            {/* Text Sample preview if available */}
                                            {doc.extractedTextSample && (
                                                <div
                                                    onClick={() => {
                                                        openPreview(doc);
                                                        setPreviewTab('text');
                                                    }}
                                                    className="p-2.5 bg-stone-50 hover:bg-emerald-50/50 rounded-2xl border border-stone-100 text-[11px] text-slate-600 line-clamp-2 italic font-serif cursor-pointer transition"
                                                    title="Click to view full extracted text"
                                                >
                                                    "{doc.extractedTextSample}..."
                                                </div>
                                            )}
                                        </div>

                                        {/* Bottom Action Row */}
                                        <div className="pt-3 border-t border-stone-100 flex items-center justify-between text-xs text-slate-400">
                                            <div className="flex items-center gap-2 text-[10px]">
                                                <span>{formatFileSize(doc.sizeBytes)}</span>
                                                <span>•</span>
                                                <span>{new Date(doc.uploadedAt).toLocaleDateString()}</span>
                                            </div>

                                            <div className="flex items-center gap-1">
                                                {doc.downloadUrl && (
                                                    <>
                                                        <button
                                                            onClick={() => openPreview(doc)}
                                                            className="p-2 rounded-xl text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition"
                                                            title="Preview Document"
                                                        >
                                                            <Eye size={15} />
                                                        </button>
                                                        <a
                                                            href={doc.downloadUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="p-2 rounded-xl text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition"
                                                            title="Open in New Tab"
                                                        >
                                                            <ExternalLink size={15} />
                                                        </a>
                                                        <a
                                                            href={doc.downloadUrl}
                                                            download={doc.originalFilename}
                                                            className="p-2 rounded-xl text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition"
                                                            title="Download File"
                                                        >
                                                            <Download size={15} />
                                                        </a>
                                                    </>
                                                )}
                                                <button
                                                    onClick={() => setDocToDelete(doc)}
                                                    className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                                                    title="Delete Document"
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            ) : (
                /* AI Q&A Tab */
                <div className="bg-white rounded-3xl p-6 md:p-8 border border-stone-200 space-y-6 shadow-xs">
                    <div>
                        <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                            <Sparkles className="text-amber-500" size={20} />
                            Ask Vault AI (RAG Document Q&A)
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">
                            Ask questions about your uploaded contracts, policies, certificates, and ID details. Responses are strictly grounded in your indexed documents.
                        </p>
                    </div>

                    <form onSubmit={handleAskAi} className="flex gap-2">
                        <input
                            type="text"
                            placeholder="e.g. What is the policy number on my vehicle insurance? or When does the lease expire?"
                            value={askQuestion}
                            onChange={(e) => setAskQuestion(e.target.value)}
                            className="flex-1 px-4 py-3 bg-stone-50 border border-stone-200 rounded-2xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                        />
                        <button
                            type="submit"
                            disabled={askingAi || !askQuestion.trim()}
                            className="px-6 py-3 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold text-xs rounded-2xl shadow-sm transition flex items-center gap-2"
                        >
                            {askingAi ? (
                                <>
                                    <div className="size-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                    Searching...
                                </>
                            ) : (
                                <>
                                    <Send size={14} />
                                    Ask
                                </>
                            )}
                        </button>
                    </form>

                    {/* Quick suggestion chips */}
                    <div className="flex flex-wrap gap-2 text-xs">
                        <span className="text-slate-400 font-bold self-center text-[10px] uppercase">Suggestions:</span>
                        {['Summarise my rental agreement', 'What is my electricity consumer number?', 'Show my bank account & IFSC details'].map((sug, i) => (
                            <button
                                key={i}
                                onClick={() => {
                                    setAskQuestion(sug);
                                }}
                                className="px-3 py-1 bg-stone-100 hover:bg-stone-200 text-slate-700 rounded-xl text-[11px] font-medium transition"
                            >
                                {sug}
                            </button>
                        ))}
                    </div>

                    {/* Response Card */}
                    {aiResponse && (
                        <div className="p-6 bg-stone-50 rounded-3xl border border-stone-200 space-y-4 animate-in fade-in duration-200">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
                                    <Sparkles size={16} />
                                </div>
                                <h4 className="text-sm font-black text-slate-900">AI Grounded Response</h4>
                            </div>

                            <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-line font-medium">
                                {aiResponse.answer}
                            </div>

                            {aiResponse.sources && aiResponse.sources.length > 0 && (
                                <div className="pt-3 border-t border-stone-200/80 flex flex-wrap items-center gap-2">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase">Referenced Document(s):</span>
                                    {aiResponse.sources.map((src, i) => {
                                        const matchedDoc = vaultDocuments.find(d => d.title === src || d.originalFilename === src);
                                        return (
                                            <button
                                                key={i}
                                                onClick={() => {
                                                    if (matchedDoc) {
                                                        openPreview(matchedDoc);
                                                    }
                                                }}
                                                className={`px-2.5 py-1 bg-white border border-stone-200 rounded-xl text-[10px] font-bold text-emerald-800 flex items-center gap-1 transition ${
                                                    matchedDoc ? 'hover:bg-emerald-50 hover:border-emerald-300 cursor-pointer shadow-2xs' : ''
                                                }`}
                                                title={matchedDoc ? 'Click to preview document' : undefined}
                                            >
                                                <FileText size={10} />
                                                {src}
                                                {matchedDoc && <Eye size={10} className="text-emerald-600 ml-0.5" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Document Preview Modal */}
            {previewDoc && (
                <div
                    className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 md:p-6 animate-in fade-in duration-150"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setPreviewDoc(null);
                    }}
                >
                    <div className="bg-white rounded-3xl max-w-5xl w-full h-[90vh] shadow-2xl border border-stone-200 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
                        {/* Modal Header */}
                        <div className="p-3 sm:px-6 sm:py-3.5 border-b border-stone-200 flex items-center justify-between gap-3 bg-stone-50/80">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="p-2 bg-white rounded-xl shadow-xs border border-stone-200 shrink-0">
                                    {getFileIcon(previewDoc.contentType, previewDoc.originalFilename)}
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-sm sm:text-base font-black text-slate-900 truncate leading-tight">
                                        {previewDoc.title}
                                    </h3>
                                    <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-slate-400 truncate mt-0.5">
                                        <span className="font-mono truncate max-w-xs">{previewDoc.originalFilename}</span>
                                        <span>•</span>
                                        <span>{formatFileSize(previewDoc.sizeBytes)}</span>
                                        <span>•</span>
                                        <span>{new Date(previewDoc.uploadedAt).toLocaleDateString()}</span>
                                    </div>
                                </div>
                            </div>

                            {/* View Selector Tabs */}
                            <div className="hidden sm:flex items-center gap-1 bg-stone-200/70 p-1 rounded-2xl">
                                <button
                                    onClick={() => setPreviewTab('document')}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                                        previewTab === 'document'
                                            ? 'bg-white text-slate-900 shadow-xs'
                                            : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                >
                                    <FileText size={13} />
                                    Document Preview
                                </button>
                                <button
                                    onClick={() => setPreviewTab('text')}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                                        previewTab === 'text'
                                            ? 'bg-white text-emerald-800 shadow-xs'
                                            : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                >
                                    <Sparkles size={13} className="text-amber-500" />
                                    Extracted Text
                                </button>
                            </div>

                            {/* Header Action Buttons */}
                            <div className="flex items-center gap-1">
                                {previewDoc.downloadUrl && (
                                    <>
                                        <a
                                            href={previewDoc.downloadUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-2 rounded-xl text-slate-600 hover:text-emerald-700 hover:bg-stone-200/70 transition"
                                            title="Open in new window / tab"
                                        >
                                            <ExternalLink size={16} />
                                        </a>
                                        <a
                                            href={previewDoc.downloadUrl}
                                            download={previewDoc.originalFilename}
                                            className="p-2 rounded-xl text-slate-600 hover:text-emerald-700 hover:bg-stone-200/70 transition"
                                            title="Download original file"
                                        >
                                            <Download size={16} />
                                        </a>
                                    </>
                                )}
                                <button
                                    onClick={() => setPreviewDoc(null)}
                                    className="p-2 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-stone-200/70 transition ml-1"
                                    title="Close Preview (Esc)"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Mobile Tabs Switcher */}
                        <div className="sm:hidden flex items-center justify-around border-b border-stone-200 bg-stone-50 p-1.5">
                            <button
                                onClick={() => setPreviewTab('document')}
                                className={`px-4 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
                                    previewTab === 'document' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                                }`}
                            >
                                <FileText size={13} /> Document
                            </button>
                            <button
                                onClick={() => setPreviewTab('text')}
                                className={`px-4 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
                                    previewTab === 'text' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-500'
                                }`}
                            >
                                <Sparkles size={13} /> Extracted Text
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="flex-1 bg-stone-100/60 p-2 sm:p-4 md:p-6 overflow-hidden flex flex-col">
                            {previewTab === 'document' ? (
                                <div className="flex-1 w-full h-full bg-white rounded-2xl border border-stone-200 shadow-xs overflow-hidden flex flex-col">
                                    {/* Handle PDFs */}
                                    {(previewDoc.contentType.includes('pdf') || previewDoc.originalFilename.toLowerCase().endsWith('.pdf')) ? (
                                        previewDoc.downloadUrl ? (
                                            <div className="flex flex-col h-full">
                                                {/* PDF Toolbar */}
                                                <div className="px-3 sm:px-4 py-2 bg-stone-50 border-b border-stone-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-[11px] text-slate-500 uppercase tracking-wide flex items-center gap-1">
                                                            <FileText size={13} className="text-rose-500" />
                                                            PDF Reader
                                                        </span>
                                                    </div>

                                                    <div className="flex items-center gap-1.5">
                                                        {/* Engine Switcher */}
                                                        <div className="flex items-center bg-stone-200/70 p-0.5 rounded-xl text-[11px] font-bold">
                                                            <button
                                                                onClick={() => setPdfViewerEngine('native')}
                                                                className={`px-2.5 py-1 rounded-lg transition ${
                                                                    pdfViewerEngine === 'native'
                                                                        ? 'bg-white text-slate-900 shadow-2xs'
                                                                        : 'text-slate-600 hover:text-slate-900'
                                                                }`}
                                                                title="Fast in-browser viewer"
                                                            >
                                                                Native
                                                            </button>
                                                            <button
                                                                onClick={() => setPdfViewerEngine('google')}
                                                                className={`px-2.5 py-1 rounded-lg transition ${
                                                                    pdfViewerEngine === 'google'
                                                                        ? 'bg-white text-slate-900 shadow-2xs'
                                                                        : 'text-slate-600 hover:text-slate-900'
                                                                }`}
                                                                title="Google Docs cloud viewer"
                                                            >
                                                                Google Viewer
                                                            </button>
                                                        </div>

                                                        {/* Open External Tab */}
                                                        <a
                                                            href={pdfBlobUrl || previewDoc.downloadUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="p-1.5 rounded-lg hover:bg-stone-200/70 text-slate-600 transition flex items-center gap-1 text-[11px] font-bold"
                                                            title="Open in new window"
                                                        >
                                                            <ExternalLink size={13} />
                                                            <span className="hidden md:inline">Open Tab</span>
                                                        </a>
                                                    </div>
                                                </div>

                                                {/* PDF Frame Container */}
                                                <div className="flex-1 w-full h-full relative bg-stone-100">
                                                    {pdfLoading && (
                                                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/80 backdrop-blur-2xs text-slate-500 gap-2">
                                                            <div className="size-6 border-2 border-emerald-600/30 border-t-emerald-600 rounded-full animate-spin" />
                                                            <span className="text-xs font-bold text-slate-600">Loading PDF document...</span>
                                                        </div>
                                                    )}

                                                    {pdfViewerEngine === 'native' ? (
                                                        <object
                                                            data={pdfBlobUrl || `${previewDoc.downloadUrl}#toolbar=1`}
                                                            type="application/pdf"
                                                            className="w-full h-full border-0"
                                                        >
                                                            <iframe
                                                                src={`https://docs.google.com/viewer?url=${encodeURIComponent(previewDoc.downloadUrl)}&embedded=true`}
                                                                title={previewDoc.title}
                                                                className="w-full h-full border-0"
                                                            />
                                                        </object>
                                                    ) : (
                                                        <iframe
                                                            src={`https://docs.google.com/viewer?url=${encodeURIComponent(previewDoc.downloadUrl)}&embedded=true`}
                                                            title={previewDoc.title}
                                                            className="w-full h-full border-0"
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center h-full p-8 text-center text-slate-500">
                                                <AlertCircle className="text-amber-500 mb-2" size={32} />
                                                <p className="text-xs font-bold">PDF file URL is not available.</p>
                                            </div>
                                        )
                                    ) : (previewDoc.contentType.startsWith('image/') || /\.(png|jpe?g|webp|heic|bmp|gif)$/i.test(previewDoc.originalFilename)) ? (
                                        /* Handle Images with Zoom */
                                        <div className="flex flex-col h-full">
                                            {/* Image Toolbar */}
                                            <div className="px-4 py-2 bg-stone-50 border-b border-stone-200 flex items-center justify-between text-xs text-slate-600">
                                                <span className="font-bold text-[11px] text-slate-500">Image Preview</span>
                                                <div className="flex items-center gap-1.5">
                                                    <button
                                                        onClick={() => setZoomLevel(prev => Math.max(50, prev - 25))}
                                                        className="p-1.5 rounded-lg hover:bg-stone-200/70 text-slate-600 transition"
                                                        title="Zoom Out"
                                                    >
                                                        <ZoomOut size={14} />
                                                    </button>
                                                    <span className="font-mono text-[11px] font-bold min-w-10 text-center">{zoomLevel}%</span>
                                                    <button
                                                        onClick={() => setZoomLevel(prev => Math.min(300, prev + 25))}
                                                        className="p-1.5 rounded-lg hover:bg-stone-200/70 text-slate-600 transition"
                                                        title="Zoom In"
                                                    >
                                                        <ZoomIn size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => setZoomLevel(100)}
                                                        className="px-2 py-1 rounded-lg hover:bg-stone-200/70 text-[10px] font-bold text-slate-600 transition ml-1"
                                                        title="Reset Zoom to 100%"
                                                    >
                                                        Reset
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-stone-900/5">
                                                <img
                                                    src={previewDoc.downloadUrl}
                                                    alt={previewDoc.title}
                                                    style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'center center' }}
                                                    className="max-h-[70vh] max-w-full object-contain rounded-xl shadow-md transition-transform duration-100"
                                                />
                                            </div>
                                        </div>
                                    ) : (previewDoc.contentType.includes('text') || /\.(txt|csv|json|md)$/i.test(previewDoc.originalFilename)) ? (
                                        /* Plain Text / Code View */
                                        <div className="flex-1 p-6 overflow-auto bg-stone-900 text-stone-100 font-mono text-xs leading-relaxed rounded-2xl">
                                            <pre className="whitespace-pre-wrap font-mono">
                                                {previewDoc.extractedTextSample || "No plain text content available to preview."}
                                            </pre>
                                        </div>
                                    ) : (
                                        /* Other Binary Files */
                                        <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-4">
                                            <div className="p-4 bg-stone-100 rounded-3xl text-slate-600">
                                                {getFileIcon(previewDoc.contentType, previewDoc.originalFilename)}
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-black text-slate-800">
                                                    In-browser preview is not supported for this file type
                                                </h4>
                                                <p className="text-xs text-slate-500 max-w-md mt-1">
                                                    You can open this document in your device's native app or view the AI-extracted OCR text in the tab above.
                                                </p>
                                            </div>
                                            {previewDoc.downloadUrl && (
                                                <div className="flex gap-2">
                                                    <a
                                                        href={previewDoc.downloadUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5"
                                                    >
                                                        <ExternalLink size={14} /> Open in External App
                                                    </a>
                                                    <a
                                                        href={previewDoc.downloadUrl}
                                                        download={previewDoc.originalFilename}
                                                        className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-slate-800 font-bold text-xs rounded-xl transition flex items-center gap-1.5"
                                                    >
                                                        <Download size={14} /> Download
                                                    </a>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                /* Extracted OCR Text Tab */
                                <div className="flex-1 bg-white rounded-2xl border border-stone-200 shadow-xs p-4 sm:p-6 overflow-hidden flex flex-col space-y-3">
                                    <div className="flex items-center justify-between pb-3 border-b border-stone-100">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                                                <Sparkles className="text-amber-500" size={15} />
                                                AI Extracted Document Text
                                            </span>
                                            {previewDoc.extractionStatus === 'success' && (
                                                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">
                                                    {previewDoc.chunkCount || 1} Chunks Indexed
                                                </span>
                                            )}
                                        </div>
                                        {previewDoc.extractedTextSample && (
                                            <button
                                                onClick={() => copyExtractedText(previewDoc.extractedTextSample)}
                                                className="px-3 py-1 bg-stone-100 hover:bg-stone-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                                            >
                                                <Copy size={12} /> Copy Text
                                            </button>
                                        )}
                                    </div>

                                    <div className="flex-1 overflow-auto bg-stone-50 p-4 rounded-xl border border-stone-200/60 font-serif text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                                        {previewDoc.extractedTextSample ? (
                                            previewDoc.extractedTextSample
                                        ) : (
                                            <div className="text-center py-12 text-slate-400">
                                                <Info className="mx-auto mb-2 text-slate-300" size={28} />
                                                <p className="text-xs font-medium">No extracted text available for this document.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {docToDelete && (
                <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-xl border border-stone-200 space-y-4 animate-in zoom-in-95 duration-150">
                        <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl w-fit">
                            <Trash2 size={24} />
                        </div>
                        <div>
                            <h3 className="text-base font-black text-slate-900">Delete Vault Document?</h3>
                            <p className="text-xs text-slate-500 mt-1">
                                Are you sure you want to permanently delete <strong className="text-slate-800 font-bold">"{docToDelete.title}"</strong>?
                                This will remove the document file, metadata, and all searchable vector chunks.
                            </p>
                        </div>
                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={() => setDocToDelete(null)}
                                className="flex-1 px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-slate-700 font-bold text-xs rounded-xl transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDelete}
                                className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
