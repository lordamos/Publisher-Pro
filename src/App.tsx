/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Book, 
  PenTool, 
  Layout, 
  Settings, 
  UploadCloud, 
  CheckCircle, 
  Circle,
  Wand2,
  Globe,
  ListTree,
  Loader2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Bold,
  Italic,
  Underline,
  Image as ImageIcon,
  Save,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";

const COVER_STORAGE_KEY = "bookPublisherPro:coverImage";
// KDP covers are portrait; downscale the longest side so it reliably fits in localStorage.
const MAX_COVER_DIMENSION = 1000;

/**
 * Reads an image file, downscales it onto a canvas, and returns a compressed
 * JPEG data URL. Keeps stored covers small enough to persist reliably.
 */
function resizeCoverImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error("Invalid image file"));
      img.onload = () => {
        const scale = Math.min(1, MAX_COVER_DIMENSION / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas is not supported in this browser"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/** Escapes a string for safe inclusion in HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Builds a self-contained HTML "book" file: a title page (with the saved cover
 * embedded inline when available) followed by the manuscript text. This is the
 * real artifact produced by the "Export to KDP" action.
 */
function buildManuscriptHtml(
  meta: { title: string; author: string },
  manuscript: string,
  cover: string | null,
): string {
  const wordCount = manuscript.trim() ? manuscript.trim().split(/\s+/).length : 0;
  const paragraphs = manuscript
    .split(/\n{2,}/)
    .filter((block) => block.trim().length > 0)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
  const coverPage = cover
    ? `<section class="cover-page"><img src="${cover}" alt="Book cover" /></section>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(meta.title)} — ${escapeHtml(meta.author)}</title>
<style>
  :root { color-scheme: light; }
  body { font-family: Georgia, "Times New Roman", serif; color: #1e293b; margin: 0; background: #f8fafc; }
  .page { max-width: 720px; margin: 0 auto; background: #fff; padding: 64px 72px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  .cover-page { text-align: center; padding: 48px 0; page-break-after: always; }
  .cover-page img { max-width: 320px; width: 100%; border-radius: 6px; box-shadow: 0 10px 30px rgba(0,0,0,.25); }
  .title-page { text-align: center; padding: 96px 0; page-break-after: always; border-bottom: 1px solid #e2e8f0; }
  .title-page h1 { font-size: 40px; margin: 0 0 12px; letter-spacing: -.5px; }
  .title-page p { font-size: 18px; color: #475569; margin: 0; }
  .meta { font-size: 12px; color: #94a3b8; margin-top: 32px; text-transform: uppercase; letter-spacing: 2px; }
  .manuscript { line-height: 1.8; font-size: 18px; }
  .manuscript p { margin: 0 0 1.1em; white-space: pre-wrap; }
</style>
</head>
<body>
  <article class="page">
    ${coverPage}
    <section class="title-page">
      <h1>${escapeHtml(meta.title)}</h1>
      <p>by ${escapeHtml(meta.author)}</p>
      <p class="meta">${wordCount.toLocaleString()} words</p>
    </section>
    <section class="manuscript">
      ${paragraphs || "<p><em>(No manuscript content.)</em></p>"}
    </section>
  </article>
</body>
</html>`;
}

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isExporting, setIsExporting] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [showExportError, setShowExportError] = useState(false);
  const [exportedFileName, setExportedFileName] = useState("");
  const [text, setText] = useState("Chapter 1\n\nThe blank page is the most daunting part of the publishing journey. But with Book Publisher Pro, the words seem to flow naturally, aided by AI and real-time collaboration.");
  const [preset, setPreset] = useState("professional");
  const [isGeneratingOutline, setIsGeneratingOutline] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [refinementSuggestions, setRefinementSuggestions] = useState("");
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);

  // Cover design state
  const [coverImage, setCoverImage] = useState<string | null>(null); // persisted cover
  const [coverPreview, setCoverPreview] = useState<string | null>(null); // pending/selected cover
  const [coverFileName, setCoverFileName] = useState("");
  const [isSavingCover, setIsSavingCover] = useState(false);
  const [coverError, setCoverError] = useState("");
  const [coverSaved, setCoverSaved] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Mock Data
  const book = {
    title: "The Art of Publishing",
    author: "Jane Doe",
    status: "READY_FOR_EXPORT"
  };

  // Load any previously saved cover on mount.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(COVER_STORAGE_KEY);
      if (stored) {
        setCoverImage(stored);
        setCoverPreview(stored);
      }
    } catch (error) {
      console.error("Failed to load saved cover:", error);
    }
  }, []);

  const handleCoverSelect = async (file?: File | null) => {
    setCoverError("");
    setCoverSaved(false);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setCoverError("Please choose an image file (PNG or JPG).");
      return;
    }
    try {
      const dataUrl = await resizeCoverImage(file);
      setCoverPreview(dataUrl);
      setCoverFileName(file.name);
    } catch (error) {
      console.error("Failed to process cover image:", error);
      setCoverError("Could not process that image. Try a different file.");
    }
  };

  const handleSaveCover = () => {
    setCoverError("");
    setCoverSaved(false);
    if (!coverPreview) {
      setCoverError("Failed to save cover: no image selected.");
      return;
    }
    setIsSavingCover(true);
    // Brief delay so the saving state is visible, then persist.
    setTimeout(() => {
      try {
        localStorage.setItem(COVER_STORAGE_KEY, coverPreview);
        setCoverImage(coverPreview);
        setCoverSaved(true);
      } catch (error) {
        console.error("Failed to save cover:", error);
        setCoverError("Failed to save cover. The image may be too large to store.");
      } finally {
        setIsSavingCover(false);
      }
    }, 600);
  };

  const handleRemoveCover = () => {
    try {
      localStorage.removeItem(COVER_STORAGE_KEY);
    } catch (error) {
      console.error("Failed to remove cover:", error);
    }
    setCoverImage(null);
    setCoverPreview(null);
    setCoverFileName("");
    setCoverSaved(false);
    setCoverError("");
    if (coverInputRef.current) coverInputRef.current.value = "";
  };

  const hasUnsavedCover = coverPreview !== null && coverPreview !== coverImage;

  const handleExport = () => {
    setIsExporting(true);
    setShowSuccessToast(false);
    setShowExportError(false);
    // Brief delay so the "Exporting..." state is visible, then build and download a real file.
    setTimeout(() => {
      try {
        const html = buildManuscriptHtml(book, text, coverImage);
        const safeTitle =
          book.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() ||
          "manuscript";
        const fileName = `${safeTitle}.html`;
        const blob = new Blob([html], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        setExportedFileName(fileName);
        setIsExporting(false);
        setShowSuccessToast(true);
        setTimeout(() => setShowSuccessToast(false), 5000);
      } catch (error) {
        console.error("Export failed:", error);
        setIsExporting(false);
        setShowExportError(true);
        setTimeout(() => setShowExportError(false), 5000);
      }
    }, 800);
  };

  const generateOutline = async () => {
    if (isGeneratingOutline) return;
    setIsGeneratingOutline(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Generate a professional book outline for a book titled "${book.title}" by ${book.author}. The book is about the art of publishing. Provide a structured outline with chapters and brief descriptions.`,
        config: {
          systemInstruction: "You are a professional book editor and strategist. Create clear, compelling, and structured book outlines.",
        }
      });
      
      if (response.text) {
        setText(prev => prev + "\n\n--- AI GENERATED OUTLINE ---\n\n" + response.text);
      }
    } catch (error) {
      console.error("Failed to generate outline:", error);
    } finally {
      setIsGeneratingOutline(false);
    }
  };

  const handleRefineManuscript = async () => {
    if (isRefining || !text.trim()) return;
    setIsRefining(true);
    setRefinementSuggestions("");
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Proofread and provide editing suggestions for the following manuscript text. Focus on grammar, flow, and tone. Keep the suggestions concise and actionable.\n\nManuscript:\n${text}`,
        config: {
          systemInstruction: "You are an expert book editor. Provide constructive, professional, and actionable feedback on manuscript drafts.",
        }
      });
      
      if (response.text) {
        setRefinementSuggestions(response.text);
        setIsSuggestionsOpen(true);
      }
    } catch (error) {
      console.error("Failed to refine manuscript:", error);
    } finally {
      setIsRefining(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 w-full overflow-hidden">
      
      {/* SIDEBAR */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0">
        <div className="p-4 bg-slate-950 border-b border-slate-800">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Book className="h-5 w-5 text-blue-500" />
            Publisher<span className="text-blue-500">Pro</span>
          </h1>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${activeTab === 'dashboard' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}
          >
            <Layout className="h-4 w-4" /> Dashboard
          </button>
          <button 
            onClick={() => setActiveTab('editor')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${activeTab === 'editor' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}
          >
            <PenTool className="h-4 w-4" /> Manuscript Editor
          </button>
          <button 
            onClick={() => setActiveTab('cover')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${activeTab === 'cover' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}
          >
            <ImageIcon className="h-4 w-4" /> Cover Design
          </button>
          <button 
            onClick={() => setActiveTab('marketing')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${activeTab === 'marketing' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}
          >
            <Globe className="h-4 w-4" /> Marketing Page
          </button>
        </nav>

        <div className="p-4 border-t border-slate-800">
          <button className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 w-full transition-colors">
            <Settings className="h-4 w-4" /> Settings
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        
        {/* SUCCESS TOAST */}
        <AnimatePresence>
          {showSuccessToast && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-4 right-4 z-50 bg-emerald-600 text-white px-6 py-3 rounded-lg shadow-2xl flex items-center gap-3"
            >
              <CheckCircle className="h-5 w-5" />
              <div>
                <p className="font-bold">Export complete!</p>
                <p className="text-xs opacity-90">Downloaded <span className="font-mono">{exportedFileName}</span> — your book file is ready for KDP.</p>
              </div>
            </motion.div>
          )}
          {showExportError && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-4 right-4 z-50 bg-red-600 text-white px-6 py-3 rounded-lg shadow-2xl flex items-center gap-3"
            >
              <AlertTriangle className="h-5 w-5" />
              <div>
                <p className="font-bold">Export failed</p>
                <p className="text-xs opacity-90">Could not generate the book file. Please try again.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* TOP HEADER */}
        <header className="h-16 bg-white border-b flex items-center justify-between px-6 shadow-sm shrink-0">
          <div>
            <h2 className="text-lg font-bold">{book.title}</h2>
            <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Author: {book.author}</p>
          </div>
          <div className="flex items-center gap-4">
            {/* Presence Avatars */}
            <div className="flex -space-x-2 mr-4" title="Active Collaborators">
              <div className="h-8 w-8 rounded-full bg-blue-500 border-2 border-white flex items-center justify-center text-xs text-white font-bold z-20">JD</div>
              <div className="h-8 w-8 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center text-xs text-white font-bold z-10">ED</div>
            </div>
            
            <button 
              onClick={handleExport}
              disabled={isExporting}
              className="bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              {isExporting ? (
                <span className="flex items-center gap-2">
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  >
                    <UploadCloud className="h-4 w-4" />
                  </motion.div>
                  Exporting...
                </span>
              ) : (
                <><UploadCloud className="h-4 w-4" /> Export to KDP</>
              )}
            </button>
          </div>
        </header>

        {/* TAB CONTENT */}
        <main className="flex-1 overflow-y-auto p-6 bg-slate-50">
          
          <AnimatePresence mode="wait">
            {/* DASHBOARD TAB */}
            {activeTab === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="max-w-4xl mx-auto space-y-6"
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white p-4 rounded-xl border shadow-sm">
                    <p className="text-sm text-slate-500 font-medium mb-1">Manuscript Status</p>
                    <p className="text-emerald-600 font-bold flex items-center gap-1"><CheckCircle className="h-4 w-4"/> Complete</p>
                  </div>
                  <div className="bg-white p-4 rounded-xl border shadow-sm">
                    <p className="text-sm text-slate-500 font-medium mb-1">Artwork Pipeline</p>
                    <p className="text-emerald-600 font-bold flex items-center gap-1"><CheckCircle className="h-4 w-4"/> Complete</p>
                  </div>
                  <div className="bg-white p-4 rounded-xl border shadow-sm border-blue-200 ring-1 ring-blue-500">
                    <p className="text-sm text-blue-600 font-medium mb-1">Layout Pipeline</p>
                    <p className="text-slate-900 font-bold flex items-center gap-1"><Circle className="h-4 w-4 text-blue-500 animate-pulse"/> In Review</p>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-xl border shadow-sm">
                  <h3 className="text-lg font-bold mb-4">Publishing Progress</h3>
                  <div className="w-full bg-slate-100 h-2 rounded-full mb-6 overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: "75%" }}
                      transition={{ duration: 1.5, ease: "easeOut" }}
                      className="bg-blue-600 h-2 rounded-full"
                    ></motion.div>
                  </div>
                  <ul className="space-y-4">
                    <li className="flex items-center gap-3 text-sm">
                      <CheckCircle className="text-emerald-500 h-5 w-5 shrink-0" />
                      <span className="text-slate-900 font-medium">Manuscript Drafted & Edited</span>
                    </li>
                    <li className="flex items-center gap-3 text-sm">
                      {coverImage ? (
                        <CheckCircle className="text-emerald-500 h-5 w-5 shrink-0" />
                      ) : (
                        <Circle className="text-amber-500 h-5 w-5 shrink-0" />
                      )}
                      <span className={`font-medium ${coverImage ? 'text-slate-900' : 'text-slate-500'}`}>
                        Cover Image Optimized (1000x1600px)
                      </span>
                      {coverImage ? (
                        <img src={coverImage} alt="Saved cover thumbnail" className="ml-auto h-10 w-auto rounded border border-slate-200 shadow-sm" />
                      ) : (
                        <button 
                          onClick={() => setActiveTab('cover')}
                          className="ml-auto text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
                        >
                          Upload cover
                        </button>
                      )}
                    </li>
                    <li className="flex items-center gap-3 text-sm">
                      <CheckCircle className="text-emerald-500 h-5 w-5 shrink-0" />
                      <span className="text-slate-900 font-medium">Metadata & ISBN Assigned</span>
                    </li>
                    <li className="flex items-center gap-3 text-sm">
                      <Circle className="text-blue-500 h-5 w-5 shrink-0" />
                      <span className="text-blue-700 font-medium">Pending: Export to KDP & Blockchain Seal</span>
                    </li>
                  </ul>
                </div>
              </motion.div>
            )}

            {/* EDITOR TAB */}
            {activeTab === 'editor' && (
              <motion.div 
                key="editor"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="max-w-5xl mx-auto flex flex-col md:flex-row gap-6 h-full"
              >
                {/* Canvas */}
                <div className="flex-1 bg-white border shadow-lg rounded-sm flex flex-col min-h-[500px]">
                  <div className="border-b p-3 flex items-center gap-3 bg-slate-50/50">
                    <div className="flex items-center gap-1 bg-white border rounded-md p-1 shadow-sm">
                      <button title="Bold" className="p-2 hover:bg-slate-100 rounded transition-colors text-slate-600 hover:text-slate-900">
                        <Bold className="h-4 w-4" />
                      </button>
                      <button title="Italic" className="p-2 hover:bg-slate-100 rounded transition-colors text-slate-600 hover:text-slate-900">
                        <Italic className="h-4 w-4" />
                      </button>
                      <button title="Underline" className="p-2 hover:bg-slate-100 rounded transition-colors text-slate-600 hover:text-slate-900">
                        <Underline className="h-4 w-4" />
                      </button>
                    </div>
                    
                    <div className="w-px h-6 bg-slate-300"></div>
                    
                    <div className="flex items-center gap-2">
                      <button 
                        title="AI Rewrite"
                        className="px-3 py-1.5 hover:bg-purple-50 rounded-md flex items-center gap-2 text-purple-600 text-sm font-semibold transition-all border border-transparent hover:border-purple-200"
                      >
                        <Wand2 className="h-4 w-4" /> 
                        <span>AI Rewrite</span>
                      </button>
                      
                      <button 
                        onClick={generateOutline}
                        disabled={isGeneratingOutline}
                        title="Generate Book Outline"
                        className="px-3 py-1.5 hover:bg-blue-50 rounded-md flex items-center gap-2 text-blue-600 text-sm font-semibold transition-all border border-transparent hover:border-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isGeneratingOutline ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ListTree className="h-4 w-4" />
                        )}
                        <span>Generate Outline</span>
                      </button>
                    </div>
                  </div>
                  <textarea 
                    className={`flex-1 w-full p-12 resize-none outline-none leading-relaxed transition-all ${
                      preset === 'classic' ? 'font-serif text-lg' : 
                      preset === 'modern' ? 'font-sans text-xl tracking-tight' : 
                      'font-serif text-base'
                    }`}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Start writing your masterpiece..."
                  />
                </div>

                {/* Sidebar Settings */}
                <div className="w-full md:w-64 space-y-4 shrink-0">
                  {/* AI Editing Assistant */}
                  <div className="bg-white p-4 border rounded-xl shadow-sm">
                    <h4 className="text-sm font-bold mb-3 uppercase text-slate-500 tracking-wider flex items-center gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                      AI Editing Assistant
                    </h4>
                    <button 
                      onClick={handleRefineManuscript}
                      disabled={isRefining}
                      className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:cursor-not-allowed mb-2"
                    >
                      {isRefining ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Wand2 className="h-4 w-4" />
                      )}
                      Refine Manuscript
                    </button>

                    <AnimatePresence>
                      {refinementSuggestions && (
                        <div className="mt-2 border-t pt-2">
                          <button 
                            onClick={() => setIsSuggestionsOpen(!isSuggestionsOpen)}
                            className="w-full flex items-center justify-between text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors py-1"
                          >
                            <span className="flex items-center gap-1.5">
                              <Sparkles className="h-3 w-3 text-purple-500" />
                              AI SUGGESTIONS
                            </span>
                            {isSuggestionsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          </button>
                          {isSuggestionsOpen && (
                            <motion.div 
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="mt-2 text-xs text-slate-700 bg-purple-50/50 p-3 rounded-lg border border-purple-100 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto shadow-inner">
                                {refinementSuggestions}
                              </div>
                            </motion.div>
                          )}
                        </div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="bg-white p-4 border rounded-xl shadow-sm">
                    <h4 className="text-sm font-bold mb-3 uppercase text-slate-500 tracking-wider">Style Presets</h4>
                    <div className="space-y-2">
                      {[
                        { id: 'professional', label: 'Professional', sub: 'Merriweather / Inter', font: 'font-serif' },
                        { id: 'classic', label: 'Classic', sub: 'Playfair / Lato', font: 'font-serif italic' },
                        { id: 'modern', label: 'Modern', sub: 'Geist / Roboto', font: 'font-sans font-bold tracking-tight' }
                      ].map((p) => (
                        <motion.button 
                          key={p.id}
                          whileHover={{ 
                            scale: 1.02, 
                            x: 4,
                            backgroundColor: preset === p.id ? 'rgba(239, 246, 255, 1)' : 'rgba(248, 250, 252, 1)',
                            borderColor: preset === p.id ? 'rgba(59, 130, 246, 1)' : 'rgba(203, 213, 225, 1)',
                            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.05)"
                          }}
                          whileTap={{ scale: 0.98 }}
                          transition={{ type: "spring", stiffness: 400, damping: 17 }}
                          onClick={() => setPreset(p.id)} 
                          className={`w-full text-left p-3 rounded-xl border transition-all relative overflow-hidden group ${
                            preset === p.id 
                              ? 'border-blue-500 bg-blue-50/50 shadow-sm' 
                              : 'border-slate-200'
                          }`}
                        >
                          {preset === p.id && (
                            <motion.div 
                              layoutId="active-preset"
                              className="absolute inset-0 border-2 border-blue-500 rounded-xl pointer-events-none"
                              transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                            />
                          )}
                          <div className="relative z-10">
                            <span className={`block text-sm ${p.font} ${preset === p.id ? 'text-blue-700' : 'text-slate-900'}`}>
                              {p.label}
                            </span>
                            <motion.span 
                              animate={{ opacity: preset === p.id ? 1 : 0.7 }}
                              className="block font-sans text-[10px] uppercase tracking-widest text-slate-500 mt-0.5"
                            >
                              {p.sub}
                            </motion.span>
                          </div>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                  
                  <div className="bg-white p-4 border rounded-xl shadow-sm">
                    <h4 className="text-sm font-bold mb-2 uppercase text-slate-500 tracking-wider">Page Specs</h4>
                    <div className="text-xs space-y-2 text-slate-600">
                      <div className="flex justify-between"><span>Trim:</span> <span className="font-mono font-bold">6x9 in</span></div>
                      <div className="flex justify-between"><span>Bleed:</span> <span className="font-mono font-bold">0.125 in</span></div>
                      <div className="flex justify-between"><span>Words:</span> <span className="font-mono font-bold">{text.trim() === '' ? 0 : text.trim().split(/\s+/).length}</span></div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* COVER DESIGN TAB */}
            {activeTab === 'cover' && (
              <motion.div 
                key="cover"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="max-w-5xl mx-auto flex flex-col md:flex-row gap-6"
              >
                {/* Cover Preview */}
                <div className="flex-1 bg-white border shadow-sm rounded-xl p-6 flex flex-col items-center justify-center min-h-[500px]">
                  {coverPreview ? (
                    <motion.img 
                      key={coverPreview}
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      src={coverPreview}
                      alt="Book cover preview"
                      className="max-h-[440px] w-auto rounded-md shadow-2xl border border-slate-200 object-contain"
                      style={{ aspectRatio: '1000 / 1600' }}
                    />
                  ) : (
                    <div className="w-[275px] h-[440px] rounded-md border-2 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center text-slate-400 gap-3 p-6 text-center">
                      <ImageIcon className="h-10 w-10" />
                      <p className="text-sm font-medium">No cover yet</p>
                      <p className="text-xs">Upload a cover image (recommended 1000×1600px) to preview it here.</p>
                    </div>
                  )}
                </div>

                {/* Cover Controls */}
                <div className="w-full md:w-80 space-y-4 shrink-0">
                  <div className="bg-white p-5 border rounded-xl shadow-sm">
                    <h3 className="text-lg font-bold mb-1 flex items-center gap-2">
                      <ImageIcon className="h-5 w-5 text-blue-600" /> Book Cover
                    </h3>
                    <p className="text-xs text-slate-500 mb-4">Upload and save the cover that will be exported to KDP.</p>

                    <input 
                      ref={coverInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleCoverSelect(e.target.files?.[0])}
                    />

                    <button 
                      onClick={() => coverInputRef.current?.click()}
                      className="w-full border border-slate-300 hover:border-blue-400 hover:bg-blue-50 text-slate-700 px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer mb-2"
                    >
                      <UploadCloud className="h-4 w-4" /> {coverPreview ? 'Choose a different image' : 'Upload cover image'}
                    </button>

                    {coverFileName && (
                      <p className="text-xs text-slate-500 truncate mb-3" title={coverFileName}>
                        Selected: <span className="font-medium text-slate-700">{coverFileName}</span>
                      </p>
                    )}

                    <button 
                      onClick={handleSaveCover}
                      disabled={isSavingCover || !coverPreview}
                      className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:cursor-not-allowed"
                    >
                      {isSavingCover ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
                      ) : (
                        <><Save className="h-4 w-4" /> Save Cover</>
                      )}
                    </button>

                    {coverImage && (
                      <button 
                        onClick={handleRemoveCover}
                        className="w-full mt-2 text-slate-500 hover:text-red-600 px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" /> Remove saved cover
                      </button>
                    )}

                    <AnimatePresence>
                      {coverError && (
                        <motion.div 
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          className="mt-3 flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3"
                        >
                          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                          <span>{coverError}</span>
                        </motion.div>
                      )}
                      {coverSaved && !hasUnsavedCover && !coverError && (
                        <motion.div 
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          className="mt-3 flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3"
                        >
                          <CheckCircle className="h-4 w-4 shrink-0" />
                          <span>Cover saved successfully.</span>
                        </motion.div>
                      )}
                      {hasUnsavedCover && !coverError && (
                        <motion.p 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="mt-3 text-xs text-amber-600 font-medium flex items-center gap-1.5"
                        >
                          <Circle className="h-3 w-3" /> Unsaved changes
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="bg-white p-5 border rounded-xl shadow-sm">
                    <h4 className="text-sm font-bold mb-2 uppercase text-slate-500 tracking-wider">Cover Specs</h4>
                    <div className="text-xs space-y-2 text-slate-600">
                      <div className="flex justify-between"><span>Recommended:</span> <span className="font-mono font-bold">1000×1600</span></div>
                      <div className="flex justify-between"><span>Format:</span> <span className="font-mono font-bold">JPG / PNG</span></div>
                      <div className="flex justify-between"><span>Status:</span> <span className={`font-mono font-bold ${coverImage ? 'text-emerald-600' : 'text-amber-600'}`}>{coverImage ? 'Saved' : 'Pending'}</span></div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* MARKETING TAB */}
            {activeTab === 'marketing' && (
              <motion.div 
                key="marketing"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="max-w-4xl mx-auto text-center py-20"
              >
                <div className="bg-blue-100 h-24 w-24 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Globe className="h-12 w-12 text-blue-600" />
                </div>
                <h2 className="text-3xl font-bold mb-2">Marketing Page Generator</h2>
                <p className="text-slate-500 mb-8 max-w-md mx-auto">Your public landing page will be generated automatically once the book is published. We'll handle SEO, social cards, and buy links.</p>
                <button 
                  onClick={() => setActiveTab('dashboard')} 
                  className="bg-blue-600 text-white px-6 py-2 rounded-full font-semibold hover:bg-blue-700 transition-colors"
                >
                  Return to Dashboard
                </button>
              </motion.div>
            )}
          </AnimatePresence>

        </main>
      </div>
    </div>
  );
}
