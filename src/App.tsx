/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
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
  Underline
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isExporting, setIsExporting] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [text, setText] = useState("Chapter 1\n\nThe blank page is the most daunting part of the publishing journey. But with Book Publisher Pro, the words seem to flow naturally, aided by AI and real-time collaboration.");
  const [preset, setPreset] = useState("professional");
  const [isGeneratingOutline, setIsGeneratingOutline] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [refinementSuggestions, setRefinementSuggestions] = useState("");
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);

  // Mock Data
  const book = {
    title: "The Art of Publishing",
    author: "Jane Doe",
    status: "READY_FOR_EXPORT"
  };

  const handleExport = () => {
    setIsExporting(true);
    setTimeout(() => {
      setIsExporting(false);
      setShowSuccessToast(true);
      setTimeout(() => setShowSuccessToast(false), 5000);
    }, 2500);
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
                <p className="font-bold">Success!</p>
                <p className="text-xs opacity-90">PDF generated and pushed to Amazon KDP API. Blockchain IP sealed.</p>
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
                  Generating PDF...
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
                      <CheckCircle className="text-emerald-500 h-5 w-5 shrink-0" />
                      <span className="text-slate-900 font-medium">Cover Image Optimized (1000x1600px)</span>
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
