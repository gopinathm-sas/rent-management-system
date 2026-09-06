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
    RotateCw
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
                                                <div className="p-2.5 bg-stone-100 rounded-2xl">
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
                                                        <h4 className="text-sm font-black text-slate-900 leading-tight">
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
                                                <div className="p-2.5 bg-stone-50 rounded-2xl border border-stone-100 text-[11px] text-slate-600 line-clamp-2 italic font-serif">
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
                                                    <a
                                                        href={doc.downloadUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        download={doc.originalFilename}
                                                        className="p-2 rounded-xl text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition"
                                                        title="Download File"
                                                    >
                                                        <Download size={15} />
                                                    </a>
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
                                    {aiResponse.sources.map((src, i) => (
                                        <span
                                            key={i}
                                            className="px-2.5 py-1 bg-white border border-stone-200 rounded-xl text-[10px] font-bold text-emerald-800 flex items-center gap-1"
                                        >
                                            <FileText size={10} />
                                            {src}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
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
