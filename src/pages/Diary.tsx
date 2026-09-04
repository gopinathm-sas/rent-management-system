import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useData } from '../contexts/DataContext';
import { useUI } from '../contexts/UIContext';
import {
    BookOpen,
    Search,
    Calendar as CalendarIcon,
    Tag as TagIcon,
    Plus,
    X,
    Trash2,
    Check,
    Clock,
    Filter,
    Loader2,
    CheckCircle2,
    AlertCircle,
    Sparkles,
    Bot,
    Star,
    Shield,
    FolderLock,
    Bookmark
} from 'lucide-react';
import { DiaryNote, DiaryNoteColor, ImportantNote } from '../types';
import { queryDiaryAI, DiaryRagResponse } from '../services/diaryRag';
import {
    getLocalDateKey,
    formatDiaryDate,
    formatDiaryDateWithWeekday,
    formatTimeShort
} from '../lib/utils';

// Color themes configuration for sticky notes
export const NOTE_COLORS: Record<DiaryNoteColor, {
    id: DiaryNoteColor;
    label: string;
    bgCard: string;
    borderCard: string;
    textColor: string;
    headerColor: string;
    tagBg: string;
    tagBorder: string;
    tagText: string;
    dotBg: string;
    editorBg: string;
    editorBorder: string;
}> = {
    yellow: {
        id: 'yellow',
        label: 'Warm Yellow',
        bgCard: 'bg-amber-50/95',
        borderCard: 'border-amber-200/90 hover:border-amber-300',
        textColor: 'text-amber-950',
        headerColor: 'text-amber-900',
        tagBg: 'bg-amber-200/60',
        tagBorder: 'border-amber-300/80',
        tagText: 'text-amber-900',
        dotBg: 'bg-amber-400',
        editorBg: 'bg-amber-50/90',
        editorBorder: 'border-amber-200'
    },
    green: {
        id: 'green',
        label: 'Mint Green',
        bgCard: 'bg-emerald-50/95',
        borderCard: 'border-emerald-200/90 hover:border-emerald-300',
        textColor: 'text-emerald-950',
        headerColor: 'text-emerald-900',
        tagBg: 'bg-emerald-200/60',
        tagBorder: 'border-emerald-300/80',
        tagText: 'text-emerald-900',
        dotBg: 'bg-emerald-400',
        editorBg: 'bg-emerald-50/90',
        editorBorder: 'border-emerald-200'
    },
    pink: {
        id: 'pink',
        label: 'Rose Pink',
        bgCard: 'bg-rose-50/95',
        borderCard: 'border-rose-200/90 hover:border-rose-300',
        textColor: 'text-rose-950',
        headerColor: 'text-rose-900',
        tagBg: 'bg-rose-200/60',
        tagBorder: 'border-rose-300/80',
        tagText: 'text-rose-900',
        dotBg: 'bg-rose-400',
        editorBg: 'bg-rose-50/90',
        editorBorder: 'border-rose-200'
    },
    blue: {
        id: 'blue',
        label: 'Sky Blue',
        bgCard: 'bg-sky-50/95',
        borderCard: 'border-sky-200/90 hover:border-sky-300',
        textColor: 'text-sky-950',
        headerColor: 'text-sky-900',
        tagBg: 'bg-sky-200/60',
        tagBorder: 'border-sky-300/80',
        tagText: 'text-sky-900',
        dotBg: 'bg-sky-400',
        editorBg: 'bg-sky-50/90',
        editorBorder: 'border-sky-200'
    },
    purple: {
        id: 'purple',
        label: 'Lavender',
        bgCard: 'bg-purple-50/95',
        borderCard: 'border-purple-200/90 hover:border-purple-300',
        textColor: 'text-purple-950',
        headerColor: 'text-purple-900',
        tagBg: 'bg-purple-200/60',
        tagBorder: 'border-purple-300/80',
        tagText: 'text-purple-900',
        dotBg: 'bg-purple-400',
        editorBg: 'bg-purple-50/90',
        editorBorder: 'border-purple-200'
    },
    orange: {
        id: 'orange',
        label: 'Peach Orange',
        bgCard: 'bg-orange-50/95',
        borderCard: 'border-orange-200/90 hover:border-orange-300',
        textColor: 'text-orange-950',
        headerColor: 'text-orange-900',
        tagBg: 'bg-orange-200/60',
        tagBorder: 'border-orange-300/80',
        tagText: 'text-orange-900',
        dotBg: 'bg-orange-400',
        editorBg: 'bg-orange-50/90',
        editorBorder: 'border-orange-200'
    }
};

const COLOR_KEYS: DiaryNoteColor[] = ['yellow', 'green', 'pink', 'blue', 'purple', 'orange'];

const DEFAULT_CATEGORIES = ['Finance', 'Property', 'Credentials', 'Personal', 'Legal', 'General'];

// Card subtle tilt rotations for natural sticky note feel
const ROTATION_CLASSES = [
    '-rotate-[0.6deg]',
    'rotate-[0.8deg]',
    '-rotate-[1deg]',
    'rotate-[0.5deg]',
    '-rotate-[0.4deg]',
    'rotate-[1deg]'
];

export default function Diary() {
    const {
        diaryNotes,
        saveDiaryNote,
        deleteDiaryNote,
        importantNotes,
        saveImportantNote,
        deleteImportantNote
    } = useData();

    const todayDateKey = useMemo(() => getLocalDateKey(new Date()), []);

    // Main Tab State: 'daily' (Daily Diary) vs 'important' (Important Details)
    const [activeTab, setActiveTab] = useState<'daily' | 'important'>('daily');

    // Filter & Search states
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTag, setSelectedTag] = useState<string | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    // AI Semantic Search Q&A State
    const [aiQuestion, setAiQuestion] = useState('');
    const [isAiSearching, setIsAiSearching] = useState(false);
    const [aiResult, setAiResult] = useState<DiaryRagResponse | null>(null);
    const [aiError, setAiError] = useState<string | null>(null);

    // Active Note Editing Modal State for Daily Notes
    const [activeDateKey, setActiveDateKey] = useState<string | null>(null);
    const [isDailyEditorOpen, setIsDailyEditorOpen] = useState(false);

    // Active Note Editing Modal State for Important Notes
    const [activeImportantNote, setActiveImportantNote] = useState<ImportantNote | null>(null);
    const [isImportantModalOpen, setIsImportantModalOpen] = useState(false);

    const handleAskAi = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const q = aiQuestion.trim();
        if (!q) return;

        setIsAiSearching(true);
        setAiError(null);
        try {
            const res = await queryDiaryAI(q, diaryNotes, importantNotes);
            setAiResult(res);
        } catch (err: any) {
            console.error("AI Search failed:", err);
            setAiError(err.message || "Failed to search diary and important notes. Please try again.");
        } finally {
            setIsAiSearching(false);
        }
    };

    const handleClearAi = () => {
        setAiQuestion('');
        setAiResult(null);
        setAiError(null);
    };

    // Collect all unique tags across all daily notes with counts
    const dailyTagsWithCount = useMemo(() => {
        const map = new Map<string, number>();
        diaryNotes.forEach(note => {
            if (Array.isArray(note.tags)) {
                note.tags.forEach(tag => {
                    const cleanTag = tag.trim();
                    if (cleanTag) {
                        map.set(cleanTag, (map.get(cleanTag) || 0) + 1);
                    }
                });
            }
        });
        return Array.from(map.entries())
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
    }, [diaryNotes]);

    // Collect all unique tags across all important notes with counts
    const importantTagsWithCount = useMemo(() => {
        const map = new Map<string, number>();
        importantNotes.forEach(note => {
            if (Array.isArray(note.tags)) {
                note.tags.forEach(tag => {
                    const cleanTag = tag.trim();
                    if (cleanTag) {
                        map.set(cleanTag, (map.get(cleanTag) || 0) + 1);
                    }
                });
            }
        });
        return Array.from(map.entries())
            .map(([tag, count]) => ({ tag, count }))
            .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
    }, [importantNotes]);

    // Categories in important notes with counts
    const importantCategoriesWithCount = useMemo(() => {
        const map = new Map<string, number>();
        importantNotes.forEach(note => {
            const cat = (note.category || 'General').trim();
            map.set(cat, (map.get(cat) || 0) + 1);
        });
        return Array.from(map.entries())
            .map(([category, count]) => ({ category, count }))
            .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
    }, [importantNotes]);

    // Check if today has an entry
    const hasTodayNote = useMemo(() => {
        return diaryNotes.some(n => n.id === todayDateKey || n.date === todayDateKey);
    }, [diaryNotes, todayDateKey]);

    // Filtered daily notes list (ordered most recent first)
    const filteredDailyNotes = useMemo(() => {
        let list = [...diaryNotes];
        list.sort((a, b) => (b.date || b.id).localeCompare(a.date || a.id));

        if (selectedTag) {
            const lowerTag = selectedTag.toLowerCase();
            list = list.filter(n => Array.isArray(n.tags) && n.tags.some(t => t.toLowerCase() === lowerTag));
        }

        if (searchQuery.trim()) {
            const queryLower = searchQuery.trim().toLowerCase();
            list = list.filter(n => {
                const contentMatch = (n.content || '').toLowerCase().includes(queryLower);
                const tagMatch = Array.isArray(n.tags) && n.tags.some(t => t.toLowerCase().includes(queryLower));
                const dateMatch = (n.date || n.id || '').includes(queryLower) || formatDiaryDate(n.date || n.id).toLowerCase().includes(queryLower);
                return contentMatch || tagMatch || dateMatch;
            });
        }

        return list;
    }, [diaryNotes, selectedTag, searchQuery]);

    // Filtered important notes list (pinned first, then newest updated)
    const filteredImportantNotes = useMemo(() => {
        let list = [...importantNotes];

        list.sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            const timeA = a.updatedAt || a.createdAt || '';
            const timeB = b.updatedAt || b.createdAt || '';
            return timeB.localeCompare(timeA);
        });

        if (selectedCategory) {
            const lowerCat = selectedCategory.toLowerCase();
            list = list.filter(n => (n.category || 'General').toLowerCase() === lowerCat);
        }

        if (selectedTag) {
            const lowerTag = selectedTag.toLowerCase();
            list = list.filter(n => Array.isArray(n.tags) && n.tags.some(t => t.toLowerCase() === lowerTag));
        }

        if (searchQuery.trim()) {
            const queryLower = searchQuery.trim().toLowerCase();
            list = list.filter(n => {
                const titleMatch = (n.title || '').toLowerCase().includes(queryLower);
                const contentMatch = (n.content || '').toLowerCase().includes(queryLower);
                const catMatch = (n.category || '').toLowerCase().includes(queryLower);
                const tagMatch = Array.isArray(n.tags) && n.tags.some(t => t.toLowerCase().includes(queryLower));
                return titleMatch || contentMatch || catMatch || tagMatch;
            });
        }

        return list;
    }, [importantNotes, selectedCategory, selectedTag, searchQuery]);

    // Open daily editor for a specific date
    const handleOpenDailyNote = (dateKey: string) => {
        setActiveDateKey(dateKey);
        setIsDailyEditorOpen(true);
    };

    // Quick open today's note
    const handleOpenTodayNote = () => {
        handleOpenDailyNote(todayDateKey);
    };

    // Open Important Note editor (existing or new)
    const handleOpenImportantNote = (note?: ImportantNote) => {
        if (note) {
            setActiveImportantNote(note);
        } else {
            setActiveImportantNote({
                id: '',
                title: '',
                content: '',
                category: 'General',
                tags: [],
                color: 'yellow',
                pinned: false
            });
        }
        setIsImportantModalOpen(true);
    };

    // Date picker jump
    const handleDateJump = (e: React.ChangeEvent<HTMLInputElement>) => {
        const picked = e.target.value;
        if (picked) {
            handleOpenDailyNote(picked);
        }
    };

    // Find and open important note by title (from AI search citations)
    const handleOpenImportantByTitle = (title: string) => {
        const found = importantNotes.find(n => n.title?.toLowerCase() === title.toLowerCase());
        if (found) {
            handleOpenImportantNote(found);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Top Header Banner */}
            <div className="bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-rose-500/10 border border-amber-200/50 rounded-3xl p-6 md:p-8 backdrop-blur-sm relative overflow-hidden shadow-sm">
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3">
                            <span className="p-3 bg-amber-500 text-white rounded-2xl shadow-md shadow-amber-500/20 ring-4 ring-amber-100">
                                <BookOpen size={24} />
                            </span>
                            <div>
                                <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
                                    Personal Assistant &amp; Diary
                                </h1>
                                <p className="text-xs md:text-sm font-semibold text-slate-500">
                                    Daily thoughts, memories, and AI-categorized important reference notes
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        {activeTab === 'daily' ? (
                            <>
                                {/* Jump to Date Picker */}
                                <div className="relative">
                                    <label className="flex items-center gap-2 px-4 py-2.5 bg-white border border-stone-200 text-slate-700 hover:text-slate-900 hover:border-amber-400 rounded-2xl text-xs md:text-sm font-bold shadow-sm transition-all cursor-pointer">
                                        <CalendarIcon size={16} className="text-amber-600" />
                                        <span>Jump to Date</span>
                                        <input
                                            type="date"
                                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                            onChange={handleDateJump}
                                        />
                                    </label>
                                </div>

                                {/* Add Today's Note Button */}
                                <button
                                    onClick={handleOpenTodayNote}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs md:text-sm font-bold shadow-md hover:shadow-lg active:scale-95 transition-all"
                                >
                                    <Plus size={16} />
                                    <span>{hasTodayNote ? "Edit Today's Note" : "Write Today's Note"}</span>
                                </button>
                            </>
                        ) : (
                            /* Add Important Note Button */
                            <button
                                onClick={() => handleOpenImportantNote()}
                                className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl text-xs md:text-sm font-bold shadow-md hover:shadow-lg active:scale-95 transition-all"
                            >
                                <Plus size={16} />
                                <span>New Important Note</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* TAB SELECTION BAR */}
            <div className="flex items-center gap-3 border-b border-stone-200/80 pb-2">
                <button
                    onClick={() => {
                        setActiveTab('daily');
                        setSelectedCategory(null);
                        setSelectedTag(null);
                    }}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-black transition-all ${
                        activeTab === 'daily'
                            ? 'bg-slate-900 text-white shadow-md'
                            : 'bg-white text-slate-600 hover:bg-stone-100 hover:text-slate-900 border border-stone-200'
                    }`}
                >
                    <CalendarIcon size={17} />
                    <span>📅 Daily Diary</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                        activeTab === 'daily' ? 'bg-slate-800 text-amber-300' : 'bg-slate-100 text-slate-600'
                    }`}>
                        {diaryNotes.length}
                    </span>
                </button>

                <button
                    onClick={() => {
                        setActiveTab('important');
                        setSelectedCategory(null);
                        setSelectedTag(null);
                    }}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-black transition-all ${
                        activeTab === 'important'
                            ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                            : 'bg-white text-slate-600 hover:bg-stone-100 hover:text-slate-900 border border-stone-200'
                    }`}
                >
                    <Star size={17} className={activeTab === 'important' ? 'fill-amber-300 text-amber-300' : ''} />
                    <span>⭐ Important Details</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                        activeTab === 'important' ? 'bg-amber-700 text-white' : 'bg-slate-100 text-slate-600'
                    }`}>
                        {importantNotes.length}
                    </span>
                </button>
            </div>

            {/* AI Diary Semantic Search / Ask Card */}
            <div className="bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-amber-500/10 border border-purple-200/60 rounded-3xl p-5 md:p-6 backdrop-blur-md shadow-sm relative overflow-hidden">
                <div className="flex flex-col gap-4">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <span className="p-2 bg-gradient-to-tr from-purple-600 to-indigo-600 text-white rounded-xl shadow-md shadow-purple-500/20">
                                <Sparkles size={18} />
                            </span>
                            <div>
                                <h2 className="text-base md:text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                                    Ask AI Assistant
                                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                                        Diary &amp; Important Notes Q&amp;A
                                    </span>
                                </h2>
                                <p className="text-xs font-semibold text-slate-500">
                                    Ask anything — &quot;What is my bank account number?&quot;, &quot;What was done on Monday?&quot;, or &quot;Show wifi password&quot;
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Question Input Form */}
                    <form onSubmit={handleAskAi} className="relative flex items-center gap-2">
                        <div className="relative flex-1">
                            <Bot size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-purple-500 pointer-events-none" />
                            <input
                                type="text"
                                placeholder="e.g. 'What is my SBI account number?' or 'What did I discuss with the electrician?'"
                                value={aiQuestion}
                                onChange={(e) => setAiQuestion(e.target.value)}
                                className="w-full pl-11 pr-10 py-3.5 bg-white/90 border border-purple-200 rounded-2xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent shadow-xs transition-all"
                            />
                            {aiQuestion && (
                                <button
                                    type="button"
                                    onClick={handleClearAi}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition"
                                >
                                    <X size={16} />
                                </button>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={isAiSearching || !aiQuestion.trim()}
                            className="flex items-center gap-2 px-5 py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-2xl text-xs md:text-sm font-extrabold shadow-md hover:shadow-lg active:scale-95 disabled:opacity-50 disabled:pointer-events-none transition-all shrink-0"
                        >
                            {isAiSearching ? (
                                <>
                                    <Loader2 size={16} className="animate-spin" />
                                    <span>Searching...</span>
                                </>
                            ) : (
                                <>
                                    <Sparkles size={16} />
                                    <span>Ask AI</span>
                                </>
                            )}
                        </button>
                    </form>

                    {/* AI Answer & Source Citations Display */}
                    {aiResult && (
                        <div className="bg-white/95 border border-purple-200/80 rounded-2xl p-4 md:p-5 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300 space-y-3">
                            <div className="flex items-start justify-between gap-2 border-b border-purple-100 pb-2.5">
                                <div className="flex items-center gap-2 text-xs font-black text-purple-900">
                                    <Bot size={16} className="text-purple-600" />
                                    <span>AI Answer</span>
                                </div>
                                <button
                                    onClick={() => setAiResult(null)}
                                    className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 text-xs transition"
                                >
                                    <X size={14} />
                                </button>
                            </div>

                            <div className="text-sm md:text-base font-medium text-slate-800 leading-relaxed whitespace-pre-wrap">
                                {aiResult.answer}
                            </div>

                            {/* Cited Source Dates & Note Titles (Clickable chips) */}
                            {((aiResult.sourceDates && aiResult.sourceDates.length > 0) || (aiResult.sourceTitles && aiResult.sourceTitles.length > 0)) && (
                                <div className="pt-2 border-t border-purple-100/60 flex flex-wrap items-center gap-2">
                                    <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
                                        <Bookmark size={12} className="text-purple-600" />
                                        Referenced Source(s):
                                    </span>

                                    {/* Daily Date chips */}
                                    {aiResult.sourceDates?.map(dKey => (
                                        <button
                                            key={dKey}
                                            onClick={() => {
                                                setActiveTab('daily');
                                                handleOpenDailyNote(dKey);
                                            }}
                                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 rounded-xl text-xs font-bold transition shadow-xs hover:scale-105 active:scale-95"
                                            title="Click to open this day's note"
                                        >
                                            <span>📅 {formatDiaryDate(dKey)}</span>
                                            <span className="text-[10px] text-purple-600 underline">View</span>
                                        </button>
                                    ))}

                                    {/* Important Note Title chips */}
                                    {aiResult.sourceTitles?.map(title => (
                                        <button
                                            key={title}
                                            onClick={() => {
                                                setActiveTab('important');
                                                handleOpenImportantByTitle(title);
                                            }}
                                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl text-xs font-bold transition shadow-xs hover:scale-105 active:scale-95"
                                            title="Click to open this important note"
                                        >
                                            <span>⭐ {title}</span>
                                            <span className="text-[10px] text-amber-600 underline">Open</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* AI Error Display */}
                    {aiError && (
                        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-xs font-semibold text-rose-800 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <AlertCircle size={16} className="text-rose-600 shrink-0" />
                                <span>{aiError}</span>
                            </div>
                            <button onClick={() => setAiError(null)} className="text-rose-500 hover:text-rose-700">
                                <X size={14} />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Search and Category / Tag Filter Bar */}
            <div className="space-y-3">
                <div className="flex flex-col md:flex-row gap-3">
                    {/* Search Input */}
                    <div className="relative flex-1">
                        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <input
                            type="text"
                            placeholder={activeTab === 'daily' ? "Search in daily notes, content, or tags..." : "Search in important titles, accounts, credentials, tags..."}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-11 pr-10 py-3 bg-white border border-stone-200 rounded-2xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent shadow-sm transition-all"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Important Notes Category Pills (Only when in Important Tab) */}
                {activeTab === 'important' && (
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none text-xs">
                        <button
                            onClick={() => setSelectedCategory(null)}
                            className={`shrink-0 px-3.5 py-1.5 rounded-full font-bold transition-all ${
                                selectedCategory === null
                                    ? 'bg-amber-600 text-white shadow-sm ring-2 ring-amber-600/20'
                                    : 'bg-white border border-stone-200 text-slate-600 hover:bg-stone-50'
                            }`}
                        >
                            All Categories ({importantNotes.length})
                        </button>

                        {importantCategoriesWithCount.map(({ category, count }) => {
                            const isSelected = selectedCategory?.toLowerCase() === category.toLowerCase();
                            return (
                                <button
                                    key={category}
                                    onClick={() => setSelectedCategory(isSelected ? null : category)}
                                    className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold transition-all ${
                                        isSelected
                                            ? 'bg-amber-600 text-white shadow-sm ring-2 ring-amber-600/30'
                                            : 'bg-white border border-stone-200 text-slate-600 hover:bg-amber-50 hover:text-amber-900 hover:border-amber-200'
                                    }`}
                                >
                                    <span>{category}</span>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isSelected ? 'bg-amber-700 text-amber-100' : 'bg-slate-100 text-slate-500'}`}>
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Tag Pills Filter Carousel */}
                {((activeTab === 'daily' && dailyTagsWithCount.length > 0) || (activeTab === 'important' && importantTagsWithCount.length > 0)) && (
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none text-xs">
                        <span className="text-[11px] font-bold text-slate-400 pl-1 shrink-0">Tags:</span>
                        {(activeTab === 'daily' ? dailyTagsWithCount : importantTagsWithCount).map(({ tag, count }) => {
                            const isSelected = selectedTag?.toLowerCase() === tag.toLowerCase();
                            return (
                                <button
                                    key={tag}
                                    onClick={() => setSelectedTag(isSelected ? null : tag)}
                                    className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold transition-all ${
                                        isSelected
                                            ? 'bg-slate-900 text-white shadow-sm ring-2 ring-slate-900/30'
                                            : 'bg-white border border-stone-200 text-slate-600 hover:bg-stone-50'
                                    }`}
                                >
                                    <TagIcon size={12} className={isSelected ? 'text-white' : 'text-slate-400'} />
                                    <span>#{tag}</span>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isSelected ? 'bg-slate-800 text-amber-300' : 'bg-slate-100 text-slate-500'}`}>
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Active Filter Indicator */}
            {(selectedCategory || selectedTag || searchQuery) && (
                <div className="flex items-center justify-between px-4 py-2.5 bg-amber-50 border border-amber-200/80 rounded-2xl text-xs font-semibold text-amber-900">
                    <div className="flex items-center gap-2">
                        <Filter size={14} className="text-amber-600" />
                        <span>
                            Showing {activeTab === 'daily' ? filteredDailyNotes.length : filteredImportantNotes.length} matching {activeTab === 'daily' ? 'daily note(s)' : 'important file(s)'}
                            {selectedCategory && <> in category <span className="font-extrabold text-amber-950">&quot;{selectedCategory}&quot;</span></>}
                            {selectedTag && <> with tag <span className="font-extrabold text-amber-950">#{selectedTag}</span></>}
                            {searchQuery && <> matching &quot;{searchQuery}&quot;</>}
                        </span>
                    </div>
                    <button
                        onClick={() => {
                            setSelectedCategory(null);
                            setSelectedTag(null);
                            setSearchQuery('');
                        }}
                        className="font-bold underline hover:text-amber-950"
                    >
                        Clear filters
                    </button>
                </div>
            )}

            {/* ========================================================================= */}
            {/* VIEW 1: DAILY DIARY GRID                                                  */}
            {/* ========================================================================= */}
            {activeTab === 'daily' && (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 items-start">
                        {/* 1. Prompt Card: Today's Note (if not created yet and not filtering out) */}
                        {!hasTodayNote && !selectedTag && !searchQuery && (
                            <div
                                onClick={handleOpenTodayNote}
                                className="group cursor-pointer border-2 border-dashed border-amber-300 hover:border-amber-500 bg-amber-50/50 hover:bg-amber-50/80 rounded-3xl p-6 min-h-[220px] flex flex-col justify-center items-center text-center transition-all duration-200 hover:-translate-y-1 hover:shadow-lg shadow-amber-500/5 relative overflow-hidden"
                            >
                                <div className="p-3.5 bg-amber-200/70 text-amber-800 rounded-2xl mb-3 group-hover:scale-110 group-hover:bg-amber-300 transition-all duration-200 shadow-sm">
                                    <Plus size={22} className="stroke-[2.5]" />
                                </div>
                                <h3 className="font-extrabold text-base text-amber-950">
                                    Add today&apos;s note
                                </h3>
                                <p className="text-xs font-bold text-amber-800/80 mt-1">
                                    {formatDiaryDate(todayDateKey)}
                                </p>
                                <span className="text-[11px] font-medium text-amber-700/70 mt-3 px-3 py-1 bg-white/70 rounded-full border border-amber-200">
                                    Click to jot down notes
                                </span>
                            </div>
                        )}

                        {/* 2. Existing Diary Sticky Note Cards */}
                        {filteredDailyNotes.map((note, index) => {
                            const colorKey = (note.color && NOTE_COLORS[note.color as DiaryNoteColor]) ? (note.color as DiaryNoteColor) : 'yellow';
                            const colorTheme = NOTE_COLORS[colorKey];
                            const rotationClass = ROTATION_CLASSES[index % ROTATION_CLASSES.length];
                            const isToday = (note.date || note.id) === todayDateKey;

                            return (
                                <div
                                    key={note.id || note.date}
                                    onClick={() => handleOpenDailyNote(note.date || note.id)}
                                    className={`group cursor-pointer ${colorTheme.bgCard} ${colorTheme.borderCard} border rounded-3xl p-5 md:p-6 min-h-[220px] flex flex-col justify-between shadow-sm hover:shadow-xl hover:shadow-slate-900/5 transition-all duration-300 hover:-translate-y-1 hover:rotate-0 ${rotationClass} relative`}
                                >
                                    {/* Tape Accent */}
                                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-12 h-4 bg-white/60 backdrop-blur-xs border border-black/5 rounded-sm shadow-xs rotate-[-1deg] pointer-events-none group-hover:opacity-80 transition" />

                                    <div>
                                        {/* Header: Date and Today Badge */}
                                        <div className="flex items-start justify-between gap-2 mb-3">
                                            <div>
                                                <h3 className={`font-black text-base md:text-lg tracking-tight ${colorTheme.headerColor}`}>
                                                    {formatDiaryDate(note.date || note.id)}
                                                </h3>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                                    {formatDiaryDateWithWeekday(note.date || note.id).split(',')[0]}
                                                </p>
                                            </div>
                                            {isToday && (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-900 text-white shadow-xs">
                                                    Today
                                                </span>
                                            )}
                                        </div>

                                        {/* Content Preview */}
                                        <div className={`text-sm leading-relaxed font-medium ${colorTheme.textColor} line-clamp-6 whitespace-pre-wrap break-words opacity-90`}>
                                            {note.content ? note.content : (
                                                <span className="italic text-slate-400">Empty note... tap to write</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Bottom Area: Tags & Last Edited */}
                                    <div className="mt-4 pt-3 border-t border-black/5 flex flex-col gap-2">
                                        {Array.isArray(note.tags) && note.tags.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5">
                                                {note.tags.slice(0, 4).map(tag => (
                                                    <span
                                                        key={tag}
                                                        className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${colorTheme.tagBg} ${colorTheme.tagBorder} ${colorTheme.tagText}`}
                                                    >
                                                        #{tag}
                                                    </span>
                                                ))}
                                                {note.tags.length > 4 && (
                                                    <span className="text-[10px] font-bold text-slate-400 px-1 py-0.5">
                                                        +{note.tags.length - 4} more
                                                    </span>
                                                )}
                                            </div>
                                        )}

                                        {note.updatedAt && (
                                            <div className="flex items-center justify-between text-[10px] font-semibold text-slate-400">
                                                <span className="flex items-center gap-1">
                                                    <Clock size={11} />
                                                    {formatTimeShort(note.updatedAt)}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Empty State */}
                    {filteredDailyNotes.length === 0 && (
                        <div className="bg-white border border-stone-200 rounded-3xl p-12 text-center max-w-md mx-auto space-y-4 shadow-sm my-8">
                            <div className="size-16 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto shadow-inner">
                                <BookOpen size={28} />
                            </div>
                            <div>
                                <h3 className="text-lg font-extrabold text-slate-900">
                                    {searchQuery || selectedTag ? "No matching daily notes" : "No diary notes yet"}
                                </h3>
                                <p className="text-xs md:text-sm font-medium text-slate-500 mt-1">
                                    {searchQuery || selectedTag
                                        ? "Try tweaking your search keywords or clearing the active tag filter."
                                        : "Start your personal diary by adding today's sticky note."}
                                </p>
                            </div>
                            {searchQuery || selectedTag ? (
                                <button
                                    onClick={() => {
                                        setSearchQuery('');
                                        setSelectedTag(null);
                                    }}
                                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition"
                                >
                                    Reset Filters
                                </button>
                            ) : (
                                <button
                                    onClick={handleOpenTodayNote}
                                    className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs md:text-sm font-bold shadow-md transition"
                                >
                                    Write Today&apos;s Note
                                </button>
                            )}
                        </div>
                    )}
                </>
            )}

            {/* ========================================================================= */}
            {/* VIEW 2: ⭐ IMPORTANT DETAILS / FILES GRID (WITH AI GENERATED HEADERS)     */}
            {/* ========================================================================= */}
            {activeTab === 'important' && (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 items-start">
                        {/* New Important Note Card Trigger */}
                        {!selectedTag && !selectedCategory && !searchQuery && (
                            <div
                                onClick={() => handleOpenImportantNote()}
                                className="group cursor-pointer border-2 border-dashed border-amber-300 hover:border-amber-500 bg-amber-50/50 hover:bg-amber-50/80 rounded-3xl p-6 min-h-[240px] flex flex-col justify-center items-center text-center transition-all duration-200 hover:-translate-y-1 hover:shadow-lg shadow-amber-500/5 relative overflow-hidden"
                            >
                                <div className="p-3.5 bg-amber-200/70 text-amber-800 rounded-2xl mb-3 group-hover:scale-110 group-hover:bg-amber-300 transition-all duration-200 shadow-sm">
                                    <Plus size={22} className="stroke-[2.5]" />
                                </div>
                                <h3 className="font-extrabold text-base text-amber-950">
                                    New Important Note
                                </h3>
                                <p className="text-xs font-bold text-amber-800/80 mt-1">
                                    Bank details, Wi-Fi, IDs, Property records
                                </p>
                                <span className="text-[11px] font-medium text-amber-700/70 mt-3 px-3 py-1 bg-white/70 rounded-full border border-amber-200">
                                    AI generates header automatically
                                </span>
                            </div>
                        )}

                        {/* Important Sticky Notes */}
                        {filteredImportantNotes.map((note, index) => {
                            const colorKey = (note.color && NOTE_COLORS[note.color as DiaryNoteColor]) ? (note.color as DiaryNoteColor) : 'yellow';
                            const colorTheme = NOTE_COLORS[colorKey];
                            const rotationClass = ROTATION_CLASSES[index % ROTATION_CLASSES.length];

                            return (
                                <div
                                    key={note.id}
                                    onClick={() => handleOpenImportantNote(note)}
                                    className={`group cursor-pointer ${colorTheme.bgCard} ${colorTheme.borderCard} border rounded-3xl p-5 md:p-6 min-h-[240px] flex flex-col justify-between shadow-sm hover:shadow-xl hover:shadow-slate-900/5 transition-all duration-300 hover:-translate-y-1 hover:rotate-0 ${rotationClass} relative`}
                                >
                                    {/* Star / Pin Accent */}
                                    <div className="absolute -top-2.5 right-6">
                                        {note.pinned ? (
                                            <span className="p-1.5 bg-amber-500 text-white rounded-xl shadow-md flex items-center justify-center">
                                                <Star size={13} className="fill-white" />
                                            </span>
                                        ) : (
                                            <div className="w-10 h-3.5 bg-white/60 backdrop-blur-xs border border-black/5 rounded-sm shadow-xs rotate-[2deg] pointer-events-none group-hover:opacity-80 transition" />
                                        )}
                                    </div>

                                    <div>
                                        {/* Category Badge */}
                                        <div className="flex items-center gap-1.5 mb-2">
                                            <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-white/90 text-slate-800 border border-black/5 shadow-xs flex items-center gap-1">
                                                <Shield size={10} className="text-amber-600" />
                                                {note.category || 'General'}
                                            </span>
                                        </div>

                                        {/* AI-Generated Header / Title */}
                                        <h3 className={`font-black text-base md:text-lg tracking-tight ${colorTheme.headerColor} mb-2 line-clamp-2`}>
                                            {note.title || 'Untitled Important Note'}
                                        </h3>

                                        {/* Content Preview */}
                                        <div className={`text-xs md:text-sm leading-relaxed font-medium ${colorTheme.textColor} line-clamp-6 whitespace-pre-wrap break-words opacity-90`}>
                                            {note.content}
                                        </div>
                                    </div>

                                    {/* Bottom Area: Tags & Updated Date */}
                                    <div className="mt-4 pt-3 border-t border-black/5 flex flex-col gap-2">
                                        {Array.isArray(note.tags) && note.tags.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5">
                                                {note.tags.slice(0, 4).map(tag => (
                                                    <span
                                                        key={tag}
                                                        className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${colorTheme.tagBg} ${colorTheme.tagBorder} ${colorTheme.tagText}`}
                                                    >
                                                        #{tag}
                                                    </span>
                                                ))}
                                                {note.tags.length > 4 && (
                                                    <span className="text-[10px] font-bold text-slate-400 px-1 py-0.5">
                                                        +{note.tags.length - 4} more
                                                    </span>
                                                )}
                                            </div>
                                        )}

                                        <div className="flex items-center justify-between text-[10px] font-semibold text-slate-400">
                                            <span className="flex items-center gap-1">
                                                <Clock size={11} />
                                                {formatTimeShort(note.updatedAt || note.createdAt)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Empty State */}
                    {filteredImportantNotes.length === 0 && (
                        <div className="bg-white border border-stone-200 rounded-3xl p-12 text-center max-w-md mx-auto space-y-4 shadow-sm my-8">
                            <div className="size-16 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto shadow-inner">
                                <FolderLock size={28} />
                            </div>
                            <div>
                                <h3 className="text-lg font-extrabold text-slate-900">
                                    {searchQuery || selectedCategory || selectedTag ? "No matching important notes" : "No important notes yet"}
                                </h3>
                                <p className="text-xs md:text-sm font-medium text-slate-500 mt-1">
                                    {searchQuery || selectedCategory || selectedTag
                                        ? "Try adjusting your search query or category filter."
                                        : "Save bank account details, keys, and important reference files here or tell your Telegram bot."}
                                </p>
                            </div>
                            {searchQuery || selectedCategory || selectedTag ? (
                                <button
                                    onClick={() => {
                                        setSearchQuery('');
                                        setSelectedCategory(null);
                                        setSelectedTag(null);
                                    }}
                                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition"
                                >
                                    Reset Filters
                                </button>
                            ) : (
                                <button
                                    onClick={() => handleOpenImportantNote()}
                                    className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs md:text-sm font-bold shadow-md transition"
                                >
                                    Create First Important Note
                                </button>
                            )}
                        </div>
                    )}
                </>
            )}

            {/* Daily Note Editor Modal */}
            {isDailyEditorOpen && activeDateKey && (
                <DailyDiaryEditorModal
                    dateKey={activeDateKey}
                    existingNote={diaryNotes.find(n => (n.date || n.id) === activeDateKey)}
                    allExistingTags={dailyTagsWithCount.map(t => t.tag)}
                    onClose={() => {
                        setIsDailyEditorOpen(false);
                        setActiveDateKey(null);
                    }}
                    onSave={saveDiaryNote}
                    onDelete={deleteDiaryNote}
                />
            )}

            {/* Important Note Editor Modal */}
            {isImportantModalOpen && activeImportantNote && (
                <ImportantNoteEditorModal
                    initialNote={activeImportantNote}
                    allExistingTags={importantTagsWithCount.map(t => t.tag)}
                    onClose={() => {
                        setIsImportantModalOpen(false);
                        setActiveImportantNote(null);
                    }}
                    onSave={saveImportantNote}
                    onDelete={deleteImportantNote}
                />
            )}
        </div>
    );
}

// ============================================================================
// 1. DAILY DIARY NOTE EDITOR MODAL COMPONENT
// ============================================================================

interface DailyDiaryEditorModalProps {
    dateKey: string;
    existingNote?: DiaryNote;
    allExistingTags: string[];
    onClose: () => void;
    onSave: (dateKey: string, data: Partial<DiaryNote>) => Promise<void>;
    onDelete: (dateKey: string) => Promise<void>;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function DailyDiaryEditorModal({
    dateKey,
    existingNote,
    allExistingTags,
    onClose,
    onSave,
    onDelete
}: DailyDiaryEditorModalProps) {
    const { showToast, confirm } = useUI();

    const [content, setContent] = useState(existingNote?.content || '');
    const [tags, setTags] = useState<string[]>(existingNote?.tags || []);
    const [color, setColor] = useState<DiaryNoteColor>((existingNote?.color as DiaryNoteColor) || 'yellow');
    const [tagInput, setTagInput] = useState('');
    const [showTagSuggestions, setShowTagSuggestions] = useState(false);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
    const [lastSavedTime, setLastSavedTime] = useState<string | undefined>(existingNote?.updatedAt);

    const activeTheme = NOTE_COLORS[color] || NOTE_COLORS.yellow;

    const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
    const latestStateRef = useRef({ content, tags, color });
    const isFirstMountRef = useRef(true);

    useEffect(() => {
        latestStateRef.current = { content, tags, color };
    }, [content, tags, color]);

    const performSave = useCallback(async (forcedPayload?: { content: string; tags: string[]; color: DiaryNoteColor }) => {
        const payload = forcedPayload || latestStateRef.current;
        try {
            setSaveStatus('saving');
            await onSave(dateKey, {
                content: payload.content,
                tags: payload.tags,
                color: payload.color,
                date: dateKey
            });
            setSaveStatus('saved');
            setLastSavedTime(new Date().toISOString());
        } catch (err: any) {
            console.error("Auto-save diary note failed:", err);
            setSaveStatus('error');
            showToast("Failed to save diary note. Retrying...", 'error');
        }
    }, [dateKey, onSave, showToast]);

    useEffect(() => {
        if (isFirstMountRef.current) {
            isFirstMountRef.current = false;
            return;
        }

        setSaveStatus('saving');
        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
        }

        saveTimerRef.current = setTimeout(() => {
            performSave();
        }, 750);

        return () => {
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
            }
        };
    }, [content, tags, color, performSave]);

    const handleClose = async () => {
        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
            await performSave();
        }
        onClose();
    };

    const handleAddTag = (rawTag: string) => {
        const clean = rawTag.trim().replace(/^#+/, '');
        if (!clean) return;
        const alreadyHas = tags.some(t => t.toLowerCase() === clean.toLowerCase());
        if (!alreadyHas) {
            setTags(prev => [...prev, clean]);
        }
        setTagInput('');
        setShowTagSuggestions(false);
    };

    const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            handleAddTag(tagInput);
        } else if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
            setTags(prev => prev.slice(0, -1));
        }
    };

    const handleRemoveTag = (tagToRemove: string) => {
        setTags(prev => prev.filter(t => t !== tagToRemove));
    };

    const tagSuggestions = useMemo(() => {
        if (!tagInput.trim()) return [];
        const query = tagInput.trim().toLowerCase();
        return allExistingTags
            .filter(t => t.toLowerCase().includes(query) && !tags.some(curr => curr.toLowerCase() === t.toLowerCase()))
            .slice(0, 5);
    }, [tagInput, allExistingTags, tags]);

    const handleDelete = async () => {
        const confirmed = await confirm({
            title: `Delete Note for ${formatDiaryDate(dateKey)}?`,
            message: "Are you sure you want to permanently delete this day's note? This action cannot be undone.",
            confirmText: 'Delete Note',
            cancelText: 'Keep Note',
            type: 'danger'
        });

        if (confirmed) {
            try {
                if (saveTimerRef.current) {
                    clearTimeout(saveTimerRef.current);
                    saveTimerRef.current = null;
                }
                await onDelete(dateKey);
                showToast("Diary note deleted.", 'info');
                onClose();
            } catch (err: any) {
                console.error("Error deleting note:", err);
                showToast(`Failed to delete note: ${err.message}`, 'error');
            }
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className={`w-full max-w-2xl ${activeTheme.editorBg} border ${activeTheme.editorBorder} rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-colors duration-300 animate-in zoom-in-95`}
            >
                {/* Modal Top Bar */}
                <div className="p-4 sm:p-6 border-b border-black/5 flex items-center justify-between gap-3 bg-white/40 backdrop-blur-xs">
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                                {formatDiaryDateWithWeekday(dateKey)}
                            </h2>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                            {saveStatus === 'saving' && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 animate-pulse">
                                    <Loader2 size={12} className="animate-spin" />
                                    Saving changes...
                                </span>
                            )}
                            {saveStatus === 'saved' && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                                    <CheckCircle2 size={12} />
                                    Saved
                                </span>
                            )}
                            {saveStatus === 'error' && (
                                <button
                                    onClick={() => performSave()}
                                    className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 hover:underline"
                                >
                                    <AlertCircle size={12} />
                                    Save failed &bull; Retry
                                </button>
                            )}
                            {saveStatus === 'idle' && lastSavedTime && (
                                <span className="text-[11px] font-medium text-slate-400">
                                    Last saved {formatTimeShort(lastSavedTime)}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Color Palette Selector & Close Button */}
                    <div className="flex items-center gap-2 sm:gap-3">
                        <div className="flex items-center gap-1 bg-white/70 p-1.5 rounded-2xl border border-stone-200 shadow-xs">
                            {COLOR_KEYS.map(cKey => (
                                <button
                                    key={cKey}
                                    type="button"
                                    title={NOTE_COLORS[cKey].label}
                                    onClick={() => setColor(cKey)}
                                    className={`size-6 rounded-full ${NOTE_COLORS[cKey].dotBg} flex items-center justify-center transition-all ${color === cKey ? 'ring-2 ring-slate-900 scale-110' : 'hover:scale-105 opacity-80'
                                        }`}
                                >
                                    {color === cKey && <Check size={12} className="text-slate-900 stroke-[3]" />}
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={handleClose}
                            className="p-2 rounded-2xl bg-white/80 border border-stone-200 text-slate-500 hover:text-slate-900 hover:bg-white shadow-xs transition"
                            title="Close and save"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Modal Body: Textarea */}
                <div className="p-4 sm:p-6 flex-1 overflow-y-auto space-y-4">
                    <textarea
                        autoFocus
                        rows={10}
                        placeholder="Write your thoughts, daily events, things you completed, or reminders..."
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        className={`w-full bg-transparent border-0 resize-none text-base sm:text-lg leading-relaxed font-medium ${activeTheme.textColor} placeholder:text-slate-400/80 focus:outline-none focus:ring-0`}
                    />
                </div>

                {/* Tag Input & Chips Area */}
                <div className="px-4 sm:px-6 py-3 border-t border-black/5 bg-white/30 backdrop-blur-xs space-y-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                        {tags.map(tag => (
                            <span
                                key={tag}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold border ${activeTheme.tagBg} ${activeTheme.tagBorder} ${activeTheme.tagText} shadow-xs animate-in zoom-in-90`}
                            >
                                <span>#{tag}</span>
                                <button
                                    type="button"
                                    onClick={() => handleRemoveTag(tag)}
                                    className="hover:text-rose-600 rounded-full p-0.5 transition"
                                >
                                    <X size={12} />
                                </button>
                            </span>
                        ))}

                        <div className="relative inline-block flex-1 min-w-[140px]">
                            <div className="flex items-center gap-1">
                                <TagIcon size={14} className="text-slate-400 shrink-0" />
                                <input
                                    type="text"
                                    placeholder={tags.length === 0 ? "Add tag (e.g. Ideas, Repairs)..." : "Add tag..."}
                                    value={tagInput}
                                    onChange={(e) => {
                                        setTagInput(e.target.value);
                                        setShowTagSuggestions(true);
                                    }}
                                    onFocus={() => setShowTagSuggestions(true)}
                                    onKeyDown={handleTagKeyDown}
                                    className="w-full bg-transparent text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none py-1"
                                />
                                {tagInput.trim() && (
                                    <button
                                        type="button"
                                        onClick={() => handleAddTag(tagInput)}
                                        className="px-2 py-0.5 bg-slate-900 text-white rounded-lg text-[10px] font-bold shrink-0"
                                    >
                                        Add
                                    </button>
                                )}
                            </div>

                            {showTagSuggestions && tagSuggestions.length > 0 && (
                                <div className="absolute left-0 bottom-full mb-2 bg-white rounded-2xl shadow-xl border border-stone-200 p-1.5 z-20 min-w-[180px] animate-in fade-in slide-in-from-bottom-2">
                                    <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                        Suggested Existing Tags
                                    </div>
                                    {tagSuggestions.map(suggestion => (
                                        <button
                                            key={suggestion}
                                            type="button"
                                            onClick={() => handleAddTag(suggestion)}
                                            className="w-full text-left px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-amber-50 hover:text-amber-900 rounded-xl flex items-center justify-between transition"
                                        >
                                            <span>#{suggestion}</span>
                                            <span className="text-[10px] text-amber-600 font-normal">Reuse</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Modal Footer */}
                <div className="p-4 sm:p-6 border-t border-black/5 bg-white/50 flex items-center justify-between gap-3">
                    <div>
                        {existingNote && (
                            <button
                                type="button"
                                onClick={handleDelete}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-rose-600 hover:bg-rose-50 text-xs font-bold transition"
                            >
                                <Trash2 size={15} />
                                <span>Delete Note</span>
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={handleClose}
                            className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 active:scale-95 text-white font-extrabold text-sm rounded-2xl shadow-md transition-all"
                        >
                            Done
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// 2. ⭐ IMPORTANT NOTE EDITOR MODAL COMPONENT (AI HEADERS, PIN, CATEGORY)
// ============================================================================

interface ImportantNoteEditorModalProps {
    initialNote: ImportantNote;
    allExistingTags: string[];
    onClose: () => void;
    onSave: (noteId: string, data: Partial<ImportantNote>) => Promise<string>;
    onDelete: (noteId: string) => Promise<void>;
}

function ImportantNoteEditorModal({
    initialNote,
    allExistingTags,
    onClose,
    onSave,
    onDelete
}: ImportantNoteEditorModalProps) {
    const { showToast, confirm } = useUI();

    const [noteId, setNoteId] = useState(initialNote.id || '');
    const [title, setTitle] = useState(initialNote.title || '');
    const [content, setContent] = useState(initialNote.content || '');
    const [category, setCategory] = useState(initialNote.category || 'General');
    const [pinned, setPinned] = useState(!!initialNote.pinned);
    const [tags, setTags] = useState<string[]>(initialNote.tags || []);
    const [color, setColor] = useState<DiaryNoteColor>((initialNote.color as DiaryNoteColor) || 'yellow');
    const [tagInput, setTagInput] = useState('');
    const [showTagSuggestions, setShowTagSuggestions] = useState(false);
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
    const [isSavingManual, setIsSavingManual] = useState(false);

    const activeTheme = NOTE_COLORS[color] || NOTE_COLORS.yellow;

    const handleAddTag = (rawTag: string) => {
        const clean = rawTag.trim().replace(/^#+/, '');
        if (!clean) return;
        const alreadyHas = tags.some(t => t.toLowerCase() === clean.toLowerCase());
        if (!alreadyHas) {
            setTags(prev => [...prev, clean]);
        }
        setTagInput('');
        setShowTagSuggestions(false);
    };

    const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            handleAddTag(tagInput);
        } else if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
            setTags(prev => prev.slice(0, -1));
        }
    };

    const handleRemoveTag = (tagToRemove: string) => {
        setTags(prev => prev.filter(t => t !== tagToRemove));
    };

    const tagSuggestions = useMemo(() => {
        if (!tagInput.trim()) return [];
        const query = tagInput.trim().toLowerCase();
        return allExistingTags
            .filter(t => t.toLowerCase().includes(query) && !tags.some(curr => curr.toLowerCase() === t.toLowerCase()))
            .slice(0, 5);
    }, [tagInput, allExistingTags, tags]);

    // Handle Manual Save
    const handleSave = async () => {
        const trimmedContent = content.trim();
        if (!trimmedContent) {
            showToast("Note content cannot be empty.", 'error');
            return;
        }

        const effectiveTitle = title.trim() || trimmedContent.slice(0, 40) + '...';

        try {
            setIsSavingManual(true);
            setSaveStatus('saving');
            await onSave(noteId, {
                title: effectiveTitle,
                content: trimmedContent,
                category: category.trim() || 'General',
                pinned,
                color,
                tags
            });
            setSaveStatus('saved');
            showToast("Important note saved successfully!", 'success');
            onClose();
        } catch (err: any) {
            console.error("Save important note error:", err);
            setSaveStatus('error');
            showToast(`Failed to save: ${err.message}`, 'error');
        } finally {
            setIsSavingManual(false);
        }
    };

    const handleDelete = async () => {
        if (!noteId) {
            onClose();
            return;
        }

        const confirmed = await confirm({
            title: `Delete "${title || 'Important Note'}"?`,
            message: "Are you sure you want to delete this important note? This cannot be undone.",
            confirmText: 'Delete Note',
            cancelText: 'Keep Note',
            type: 'danger'
        });

        if (confirmed) {
            try {
                await onDelete(noteId);
                showToast("Important note deleted.", 'info');
                onClose();
            } catch (err: any) {
                console.error("Delete note error:", err);
                showToast(`Failed to delete: ${err.message}`, 'error');
            }
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className={`w-full max-w-2xl ${activeTheme.editorBg} border ${activeTheme.editorBorder} rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-colors duration-300 animate-in zoom-in-95`}
            >
                {/* Modal Top Bar */}
                <div className="p-4 sm:p-6 border-b border-black/5 flex items-center justify-between gap-3 bg-white/40 backdrop-blur-xs">
                    <div className="flex items-center gap-2">
                        <span className="p-2 bg-amber-500 text-white rounded-xl shadow-xs">
                            <Star size={18} className="fill-white" />
                        </span>
                        <div>
                            <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                                {noteId ? "Edit Important File" : "New Important File"}
                            </h2>
                            <p className="text-[11px] font-bold text-slate-500">
                                Sticky note with custom or AI-generated header
                            </p>
                        </div>
                    </div>

                    {/* Color Palette Selector & Close Button */}
                    <div className="flex items-center gap-2 sm:gap-3">
                        <div className="flex items-center gap-1 bg-white/70 p-1.5 rounded-2xl border border-stone-200 shadow-xs">
                            {COLOR_KEYS.map(cKey => (
                                <button
                                    key={cKey}
                                    type="button"
                                    title={NOTE_COLORS[cKey].label}
                                    onClick={() => setColor(cKey)}
                                    className={`size-6 rounded-full ${NOTE_COLORS[cKey].dotBg} flex items-center justify-center transition-all ${color === cKey ? 'ring-2 ring-slate-900 scale-110' : 'hover:scale-105 opacity-80'
                                        }`}
                                >
                                    {color === cKey && <Check size={12} className="text-slate-900 stroke-[3]" />}
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={onClose}
                            className="p-2 rounded-2xl bg-white/80 border border-stone-200 text-slate-500 hover:text-slate-900 hover:bg-white shadow-xs transition"
                            title="Close"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Modal Body: Title, Category & Content Inputs */}
                <div className="p-4 sm:p-6 flex-1 overflow-y-auto space-y-4">
                    {/* Header / Title Input */}
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                            Header / Title (e.g. Bank Account Details)
                        </label>
                        <input
                            type="text"
                            placeholder="e.g. HDFC Bank Account Details, Wi-Fi Password"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full px-4 py-2.5 bg-white/80 border border-black/10 rounded-2xl text-base font-black text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-xs"
                        />
                    </div>

                    {/* Category Selector & Pin Toggle Row */}
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex-1 min-w-[160px]">
                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                                Category
                            </label>
                            <select
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                className="w-full px-3 py-2 bg-white/80 border border-black/10 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-xs"
                            >
                                {DEFAULT_CATEGORIES.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                                Pin to Top
                            </label>
                            <button
                                type="button"
                                onClick={() => setPinned(!pinned)}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition shadow-xs ${
                                    pinned
                                        ? 'bg-amber-500 text-white'
                                        : 'bg-white/80 border border-black/10 text-slate-600 hover:bg-white'
                                }`}
                            >
                                <Star size={14} className={pinned ? 'fill-white' : ''} />
                                <span>{pinned ? 'Pinned' : 'Pin Note'}</span>
                            </button>
                        </div>
                    </div>

                    {/* Content Textarea */}
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                            Note Content / Details
                        </label>
                        <textarea
                            rows={8}
                            placeholder="Enter account numbers, keys, property notes, contact numbers, or reference information..."
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            className={`w-full p-4 bg-white/60 border border-black/10 rounded-2xl resize-none text-sm md:text-base leading-relaxed font-medium ${activeTheme.textColor} placeholder:text-slate-400/80 focus:outline-none focus:ring-2 focus:ring-amber-500`}
                        />
                    </div>
                </div>

                {/* Tag Input & Chips Area */}
                <div className="px-4 sm:px-6 py-3 border-t border-black/5 bg-white/30 backdrop-blur-xs space-y-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                        {tags.map(tag => (
                            <span
                                key={tag}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold border ${activeTheme.tagBg} ${activeTheme.tagBorder} ${activeTheme.tagText} shadow-xs animate-in zoom-in-90`}
                            >
                                <span>#{tag}</span>
                                <button
                                    type="button"
                                    onClick={() => handleRemoveTag(tag)}
                                    className="hover:text-rose-600 rounded-full p-0.5 transition"
                                >
                                    <X size={12} />
                                </button>
                            </span>
                        ))}

                        <div className="relative inline-block flex-1 min-w-[140px]">
                            <div className="flex items-center gap-1">
                                <TagIcon size={14} className="text-slate-400 shrink-0" />
                                <input
                                    type="text"
                                    placeholder={tags.length === 0 ? "Add tag (e.g. Banking, WiFi)..." : "Add tag..."}
                                    value={tagInput}
                                    onChange={(e) => {
                                        setTagInput(e.target.value);
                                        setShowTagSuggestions(true);
                                    }}
                                    onFocus={() => setShowTagSuggestions(true)}
                                    onKeyDown={handleTagKeyDown}
                                    className="w-full bg-transparent text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none py-1"
                                />
                                {tagInput.trim() && (
                                    <button
                                        type="button"
                                        onClick={() => handleAddTag(tagInput)}
                                        className="px-2 py-0.5 bg-slate-900 text-white rounded-lg text-[10px] font-bold shrink-0"
                                    >
                                        Add
                                    </button>
                                )}
                            </div>

                            {showTagSuggestions && tagSuggestions.length > 0 && (
                                <div className="absolute left-0 bottom-full mb-2 bg-white rounded-2xl shadow-xl border border-stone-200 p-1.5 z-20 min-w-[180px] animate-in fade-in slide-in-from-bottom-2">
                                    <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                        Suggested Existing Tags
                                    </div>
                                    {tagSuggestions.map(suggestion => (
                                        <button
                                            key={suggestion}
                                            type="button"
                                            onClick={() => handleAddTag(suggestion)}
                                            className="w-full text-left px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-amber-50 hover:text-amber-900 rounded-xl flex items-center justify-between transition"
                                        >
                                            <span>#{suggestion}</span>
                                            <span className="text-[10px] text-amber-600 font-normal">Reuse</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Modal Footer */}
                <div className="p-4 sm:p-6 border-t border-black/5 bg-white/50 flex items-center justify-between gap-3">
                    <div>
                        {noteId && (
                            <button
                                type="button"
                                onClick={handleDelete}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-rose-600 hover:bg-rose-50 text-xs font-bold transition"
                            >
                                <Trash2 size={15} />
                                <span>Delete Note</span>
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2.5 rounded-2xl text-xs font-bold text-slate-600 hover:bg-black/5 transition"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            disabled={isSavingManual || !content.trim()}
                            onClick={handleSave}
                            className="flex items-center gap-2 px-6 py-2.5 bg-amber-600 hover:bg-amber-700 active:scale-95 disabled:opacity-50 text-white font-extrabold text-sm rounded-2xl shadow-md transition-all"
                        >
                            {isSavingManual ? (
                                <>
                                    <Loader2 size={16} className="animate-spin" />
                                    <span>Saving...</span>
                                </>
                            ) : (
                                <span>Save Important Note</span>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
