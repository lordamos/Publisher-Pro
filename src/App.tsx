/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import {
  Book,
  BookOpen,
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
  AlertTriangle,
  Plus,
  Undo2,
  Copy,
  Check,
  RefreshCw,
  FileText,
  FileCode,
  Clock,
  Hash,
  Megaphone,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from '@google/genai';

const MODEL = 'gemini-3-flash-preview';

// KDP covers are portrait; downscale the longest side to keep the in-memory image lightweight.
const MAX_COVER_DIMENSION = 1000;

type Chapter = { id: string; title: string; content: string };
type Marketing = {
  description: string;
  taglines: string[];
  keywords: string[];
  blurb: string;
};

let idCounter = 0;
function uid(): string {
  idCounter += 1;
  return `id-${Date.now().toString(36)}-${idCounter}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function countWords(value: string): number {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function readingMinutes(words: number): number {
  return Math.max(1, Math.ceil(words / 200));
}

function slugify(value: string): string {
  return (
    value
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'manuscript'
  );
}

/** Calls Gemini and returns the text response. Throws on failure. */
async function callGemini(contents: string, systemInstruction: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const response = await ai.models.generateContent({
    model: MODEL,
    contents,
    config: { systemInstruction },
  });
  return response.text ?? '';
}

/** Best-effort parse of a Gemini JSON response into a Marketing object. */
function parseMarketing(raw: string): Marketing {
  let text = raw.trim();
  text = text.replace(/^```(?:json)?/i, '').replace(/```$/,'').trim();
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last !== -1) text = text.slice(first, last + 1);
  const obj = JSON.parse(text);
  return {
    description: String(obj.description ?? ''),
    taglines: Array.isArray(obj.taglines) ? obj.taglines.map(String) : [],
    keywords: Array.isArray(obj.keywords) ? obj.keywords.map(String) : [],
    blurb: String(obj.blurb ?? ''),
  };
}

/** Reads an image file, downscales it onto a canvas, returns a compressed JPEG data URL. */
function resizeCoverImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error('Invalid image file'));
      img.onload = () => {
        const scale = Math.min(1, MAX_COVER_DIMENSION / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas is not supported in this browser'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function paragraphize(text: string): string {
  const blocks = text.split(/\n{2,}/).filter((b) => b.trim().length > 0);
  if (blocks.length === 0) return '<p><em>(No content.)</em></p>';
  return blocks.map((b) => `<p>${escapeHtml(b).replace(/\n/g, '<br/>')}</p>`).join('\n');
}

type BookMeta = { title: string; author: string; genre: string; description: string };

function buildBookHtml(
  meta: BookMeta,
  chapters: Chapter[],
  cover: string | null,
  marketing: Marketing | null,
): string {
  const totalWords = chapters.reduce((n, c) => n + countWords(c.content), 0);
  const coverPage = cover
    ? `<section class="cover-page"><img src="${cover}" alt="Book cover" /></section>`
    : '';
  const toc = chapters
    .map((c, i) => `<li><span class="toc-num">${i + 1}.</span> ${escapeHtml(c.title)}</li>`)
    .join('\n');
  const body = chapters
    .map(
      (c) => `<section class="chapter"><h2>${escapeHtml(c.title)}</h2>${paragraphize(c.content)}</section>`,
    )
    .join('\n');
  const marketingPage = marketing
    ? `<section class="marketing">
        <h2>About This Book</h2>
        ${marketing.description ? `<p>${escapeHtml(marketing.description)}</p>` : ''}
        ${marketing.blurb ? `<p class="blurb">${escapeHtml(marketing.blurb)}</p>` : ''}
        ${marketing.keywords.length ? `<p class="kw">${marketing.keywords.map((k) => `<span>${escapeHtml(k)}</span>`).join('')}</p>` : ''}
      </section>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(meta.title)} — ${escapeHtml(meta.author)}</title>
<style>
  :root { color-scheme: light; }
  body { font-family: Georgia, "Times New Roman", serif; color: #1e293b; margin: 0; background: #f1f5f9; }
  .page { max-width: 760px; margin: 24px auto; background: #fff; padding: 64px 72px; box-shadow: 0 1px 3px rgba(0,0,0,.12); }
  .cover-page { text-align: center; padding: 32px 0 48px; page-break-after: always; }
  .cover-page img { max-width: 340px; width: 100%; border-radius: 6px; box-shadow: 0 10px 30px rgba(0,0,0,.25); }
  .title-page { text-align: center; padding: 72px 0; page-break-after: always; border-bottom: 1px solid #e2e8f0; }
  .title-page h1 { font-size: 42px; margin: 0 0 12px; letter-spacing: -.5px; }
  .title-page .author { font-size: 18px; color: #475569; margin: 0 0 8px; }
  .title-page .genre { font-size: 13px; color: #64748b; font-style: italic; margin: 0 0 24px; }
  .title-page .desc { max-width: 520px; margin: 0 auto; color: #334155; }
  .meta { font-size: 12px; color: #94a3b8; margin-top: 28px; text-transform: uppercase; letter-spacing: 2px; }
  nav.toc { padding: 32px 0; page-break-after: always; }
  nav.toc h2 { font-size: 24px; }
  nav.toc ol, nav.toc ul { list-style: none; padding: 0; }
  nav.toc li { padding: 6px 0; border-bottom: 1px dashed #e2e8f0; }
  .toc-num { color: #94a3b8; margin-right: 8px; }
  .chapter { padding: 24px 0; page-break-before: always; }
  .chapter h2 { font-size: 28px; border-bottom: 2px solid #0f172a; padding-bottom: 8px; }
  .chapter p { line-height: 1.8; font-size: 18px; margin: 0 0 1.1em; white-space: pre-wrap; }
  .marketing { padding: 32px 0; page-break-before: always; }
  .marketing .blurb { font-style: italic; color: #334155; }
  .marketing .kw span { display: inline-block; background: #eef2ff; color: #4338ca; border-radius: 999px; padding: 2px 10px; margin: 2px; font-size: 12px; }
</style>
</head>
<body>
  <article class="page">
    ${coverPage}
    <section class="title-page">
      <h1>${escapeHtml(meta.title)}</h1>
      <p class="author">by ${escapeHtml(meta.author)}</p>
      ${meta.genre ? `<p class="genre">${escapeHtml(meta.genre)}</p>` : ''}
      ${meta.description ? `<p class="desc">${escapeHtml(meta.description)}</p>` : ''}
      <p class="meta">${chapters.length} chapters · ${totalWords.toLocaleString()} words</p>
    </section>
    <nav class="toc">
      <h2>Contents</h2>
      <ol>${toc}</ol>
    </nav>
    ${body}
    ${marketingPage}
  </article>
</body>
</html>`;
}

function buildBookMarkdown(
  meta: BookMeta,
  chapters: Chapter[],
  marketing: Marketing | null,
): string {
  const lines: string[] = [`# ${meta.title}`, '', `_by ${meta.author}_`, ''];
  if (meta.genre) lines.push(`**Genre:** ${meta.genre}`, '');
  if (meta.description) lines.push(`> ${meta.description}`, '');
  lines.push('## Contents', '');
  chapters.forEach((c, i) => lines.push(`${i + 1}. ${c.title}`));
  lines.push('');
  chapters.forEach((c) => {
    lines.push(`## ${c.title}`, '', c.content.trim(), '');
  });
  if (marketing) {
    lines.push('---', '', '## Marketing', '');
    if (marketing.description) lines.push(`**Description:** ${marketing.description}`, '');
    if (marketing.taglines.length) {
      lines.push('**Taglines:**');
      marketing.taglines.forEach((t) => lines.push(`- ${t}`));
      lines.push('');
    }
    if (marketing.keywords.length) lines.push(`**Keywords:** ${marketing.keywords.join(', ')}`, '');
    if (marketing.blurb) lines.push('**Back-cover blurb:**', '', marketing.blurb, '');
  }
  return lines.join('\n');
}

function downloadFile(name: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  // Book details (editable, in memory)
  const [title, setTitle] = useState('The Art of Publishing');
  const [author, setAuthor] = useState('Jane Doe');
  const [genre, setGenre] = useState('Nonfiction / Writing');
  const [description, setDescription] = useState(
    'A practical, modern guide to writing, editing, and publishing your first book.',
  );

  // Chapters (multi-chapter manuscript)
  const [chapters, setChapters] = useState<Chapter[]>(() => [
    {
      id: uid(),
      title: 'Chapter 1: The Blank Page',
      content:
        'The blank page is the most daunting part of the publishing journey. But with Book Publisher Pro, the words seem to flow naturally, aided by AI and real-time collaboration.',
    },
  ]);
  const [activeChapterId, setActiveChapterId] = useState<string>('');
  const activeChapter = chapters.find((c) => c.id === activeChapterId) ?? chapters[0];

  const [preset, setPreset] = useState('professional');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // AI editor state
  const [isGeneratingOutline, setIsGeneratingOutline] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [refinementSuggestions, setRefinementSuggestions] = useState('');
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);
  const [preRewrite, setPreRewrite] = useState<string | null>(null);

  // Marketing state
  const [marketing, setMarketing] = useState<Marketing | null>(null);
  const [isGeneratingMarketing, setIsGeneratingMarketing] = useState(false);
  const [marketingError, setMarketingError] = useState('');
  const [copied, setCopied] = useState('');

  // Cover state (memory-only; not persisted to storage)
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverFileName, setCoverFileName] = useState('');
  const [isSavingCover, setIsSavingCover] = useState(false);
  const [coverError, setCoverError] = useState('');
  const [coverSaved, setCoverSaved] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Export state
  const [isExporting, setIsExporting] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [showExportError, setShowExportError] = useState(false);
  const [exportedFileName, setExportedFileName] = useState('');

  // Derived stats
  const bookWords = chapters.reduce((n, c) => n + countWords(c.content), 0);
  const bookText = chapters.map((c) => `${c.title}\n\n${c.content}`).join('\n\n');
  const hasUnsavedCover = coverPreview !== null && coverPreview !== coverImage;

  // ---- Chapter operations ----
  const updateActiveChapter = (patch: Partial<Chapter>) =>
    setChapters((prev) => prev.map((c) => (c.id === activeChapter.id ? { ...c, ...patch } : c)));

  const addChapter = () => {
    const ch: Chapter = { id: uid(), title: `Chapter ${chapters.length + 1}`, content: '' };
    setChapters((prev) => [...prev, ch]);
    setActiveChapterId(ch.id);
    setRefinementSuggestions('');
    setPreRewrite(null);
  };

  const deleteChapter = (id: string) => {
    setChapters((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((c) => c.id !== id);
      if (id === activeChapter.id) setActiveChapterId(next[0].id);
      return next;
    });
  };

  // ---- Formatting ----
  const applyFormat = (before: string, after: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const content = activeChapter.content;
    const selected = content.slice(start, end) || 'text';
    const next = content.slice(0, start) + before + selected + after + content.slice(end);
    updateActiveChapter({ content: next });
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = start + before.length;
      ta.selectionEnd = start + before.length + selected.length;
    });
  };

  // ---- AI features ----
  const generateOutline = async () => {
    if (isGeneratingOutline) return;
    setIsGeneratingOutline(true);
    try {
      const text = await callGemini(
        `Generate a professional book outline for a book titled "${title}" by ${author}. Genre: ${genre}. About: ${description}. Provide a structured outline with chapters and brief descriptions.`,
        'You are a professional book editor and strategist. Create clear, compelling, and structured book outlines.',
      );
      if (text) {
        const ch: Chapter = { id: uid(), title: 'Book Outline', content: text.trim() };
        setChapters((prev) => [...prev, ch]);
        setActiveChapterId(ch.id);
        setActiveTab('editor');
      }
    } catch (error) {
      console.error('Failed to generate outline:', error);
    } finally {
      setIsGeneratingOutline(false);
    }
  };

  const handleRefineManuscript = async () => {
    if (isRefining || !activeChapter.content.trim()) return;
    setIsRefining(true);
    setRefinementSuggestions('');
    try {
      const text = await callGemini(
        `Proofread and provide editing suggestions for the following chapter. Focus on grammar, flow, and tone. Keep the suggestions concise and actionable.\n\nChapter: ${activeChapter.title}\n\n${activeChapter.content}`,
        'You are an expert book editor. Provide constructive, professional, and actionable feedback on manuscript drafts.',
      );
      if (text) {
        setRefinementSuggestions(text);
        setIsSuggestionsOpen(true);
      }
    } catch (error) {
      console.error('Failed to refine manuscript:', error);
    } finally {
      setIsRefining(false);
    }
  };

  const handleRewrite = async () => {
    if (isRewriting || !activeChapter.content.trim()) return;
    setIsRewriting(true);
    const previous = activeChapter.content;
    try {
      const text = await callGemini(
        `Rewrite the following chapter in a ${preset} tone. Improve clarity, flow, and impact while preserving the meaning. Return only the rewritten prose with no preamble or commentary.\n\n${activeChapter.content}`,
        'You are an expert developmental editor and ghostwriter.',
      );
      if (text) {
        setPreRewrite(previous);
        updateActiveChapter({ content: text.trim() });
      }
    } catch (error) {
      console.error('Failed to rewrite chapter:', error);
    } finally {
      setIsRewriting(false);
    }
  };

  const undoRewrite = () => {
    if (preRewrite === null) return;
    updateActiveChapter({ content: preRewrite });
    setPreRewrite(null);
  };

  const generateMarketing = async () => {
    if (isGeneratingMarketing) return;
    setIsGeneratingMarketing(true);
    setMarketingError('');
    try {
      const raw = await callGemini(
        `Return ONLY a JSON object (no markdown fences) with keys: "description" (a compelling 2-3 sentence book description), "taglines" (array of exactly 3 short punchy taglines), "keywords" (array of 6-10 SEO keywords), "blurb" (a back-cover blurb of about 100 words). Book title: "${title}". Author: ${author}. Genre: ${genre}. About: ${description}. Manuscript excerpt: ${bookText.slice(0, 4000)}`,
        'You are a world-class book marketer and copywriter. Always respond with valid minified JSON only.',
      );
      setMarketing(parseMarketing(raw));
    } catch (error) {
      console.error('Failed to generate marketing copy:', error);
      setMarketingError('Could not generate marketing copy. Please try again.');
    } finally {
      setIsGeneratingMarketing(false);
    }
  };

  const copyText = async (key: string, value: string) => {
    // Mark this card as the last-copied one (persists until another card is copied),
    // so the acknowledgement is always visible regardless of timing.
    setCopied(key);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return;
      }
      throw new Error('Clipboard API unavailable');
    } catch (error) {
      // Fallback for restricted/unfocused contexts where the async clipboard API rejects.
      try {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch (fallbackError) {
        console.error('Copy failed:', fallbackError);
      }
    }
  };

  // ---- Cover ----
  const handleCoverSelect = async (file?: File | null) => {
    setCoverError('');
    setCoverSaved(false);
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setCoverError('Please choose an image file (PNG or JPG).');
      return;
    }
    try {
      const dataUrl = await resizeCoverImage(file);
      setCoverPreview(dataUrl);
      setCoverFileName(file.name);
    } catch (error) {
      console.error('Failed to process cover image:', error);
      setCoverError('Could not process that image. Try a different file.');
    }
  };

  const handleSaveCover = () => {
    setCoverError('');
    setCoverSaved(false);
    if (!coverPreview) {
      setCoverError('Failed to save cover: no image selected.');
      return;
    }
    setIsSavingCover(true);
    setTimeout(() => {
      setCoverImage(coverPreview);
      setCoverSaved(true);
      setIsSavingCover(false);
    }, 600);
  };

  const handleRemoveCover = () => {
    setCoverImage(null);
    setCoverPreview(null);
    setCoverFileName('');
    setCoverSaved(false);
    setCoverError('');
    if (coverInputRef.current) coverInputRef.current.value = '';
  };

  // ---- Export ----
  const handleExport = (format: 'html' | 'md') => {
    setIsExporting(true);
    setShowSuccessToast(false);
    setShowExportError(false);
    setTimeout(() => {
      try {
        const meta: BookMeta = { title, author, genre, description };
        const base = slugify(title);
        let fileName: string;
        if (format === 'md') {
          fileName = `${base}.md`;
          downloadFile(fileName, buildBookMarkdown(meta, chapters, marketing), 'text/markdown;charset=utf-8');
        } else {
          fileName = `${base}.html`;
          downloadFile(fileName, buildBookHtml(meta, chapters, coverImage, marketing), 'text/html;charset=utf-8');
        }
        setExportedFileName(fileName);
        setIsExporting(false);
        setShowSuccessToast(true);
        setTimeout(() => setShowSuccessToast(false), 5000);
      } catch (error) {
        console.error('Export failed:', error);
        setIsExporting(false);
        setShowExportError(true);
        setTimeout(() => setShowExportError(false), 5000);
      }
    }, 500);
  };

  // ---- Dynamic progress ----
  const steps = [
    { label: 'Book details added', done: title.trim() !== '' && author.trim() !== '' },
    { label: 'Manuscript drafted', done: bookWords > 0 },
    { label: 'Cover image saved', done: coverImage !== null },
    { label: 'Marketing copy generated', done: marketing !== null },
  ];
  const completed = steps.filter((s) => s.done).length;
  const progressPct = Math.round((completed / steps.length) * 100);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Layout },
    { id: 'editor', label: 'Manuscript Editor', icon: PenTool },
    { id: 'cover', label: 'Cover Design', icon: ImageIcon },
    { id: 'marketing', label: 'Marketing Page', icon: Globe },
  ];

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
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                activeTab === item.id ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'
              }`}
            >
              <item.icon className="h-4 w-4" /> {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-2">
          <div className="text-xs text-slate-500 px-1">
            {chapters.length} chapters · {bookWords.toLocaleString()} words
          </div>
          <button className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 w-full transition-colors">
            <Settings className="h-4 w-4" /> Settings
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* TOASTS */}
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
                <p className="text-xs opacity-90">
                  Downloaded <span className="font-mono">{exportedFileName}</span> — your book file is ready.
                </p>
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
          <div className="min-w-0">
            <h2 className="text-lg font-bold truncate">{title || 'Untitled Book'}</h2>
            <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold truncate">
              Author: {author || 'Unknown'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2 mr-2" title="Active Collaborators">
              <div className="h-8 w-8 rounded-full bg-blue-500 border-2 border-white flex items-center justify-center text-xs text-white font-bold z-20">JD</div>
              <div className="h-8 w-8 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center text-xs text-white font-bold z-10">ED</div>
            </div>

            <button
              onClick={() => handleExport('md')}
              disabled={isExporting}
              title="Export as Markdown"
              className="border border-slate-300 hover:border-slate-400 hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-md text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileCode className="h-4 w-4" /> .md
            </button>

            <button
              onClick={() => handleExport('html')}
              disabled={isExporting}
              className="bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              {isExporting ? (
                <span className="flex items-center gap-2">
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                    <UploadCloud className="h-4 w-4" />
                  </motion.div>
                  Exporting...
                </span>
              ) : (
                <>
                  <UploadCloud className="h-4 w-4" /> Export to KDP
                </>
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
                {/* Book details */}
                <div className="bg-white p-6 rounded-xl border shadow-sm">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-blue-600" /> Book Details
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Title</span>
                      <input
                        aria-label="Book title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Author</span>
                      <input
                        aria-label="Author"
                        value={author}
                        onChange={(e) => setAuthor(e.target.value)}
                        className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Genre</span>
                      <input
                        aria-label="Genre"
                        value={genre}
                        onChange={(e) => setGenre(e.target.value)}
                        className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">One-line description</span>
                      <input
                        aria-label="Description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      />
                    </label>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white p-4 rounded-xl border shadow-sm">
                    <p className="text-sm text-slate-500 font-medium mb-1 flex items-center gap-1"><Hash className="h-3.5 w-3.5" /> Word Count</p>
                    <p className="text-slate-900 font-bold text-2xl">{bookWords.toLocaleString()}</p>
                  </div>
                  <div className="bg-white p-4 rounded-xl border shadow-sm">
                    <p className="text-sm text-slate-500 font-medium mb-1 flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Reading Time</p>
                    <p className="text-slate-900 font-bold text-2xl">{readingMinutes(bookWords)} min</p>
                  </div>
                  <div className="bg-white p-4 rounded-xl border shadow-sm">
                    <p className="text-sm text-slate-500 font-medium mb-1 flex items-center gap-1"><ListTree className="h-3.5 w-3.5" /> Chapters</p>
                    <p className="text-slate-900 font-bold text-2xl">{chapters.length}</p>
                  </div>
                </div>

                {/* Progress */}
                <div className="bg-white p-6 rounded-xl border shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold">Publishing Progress</h3>
                    <span className="text-sm font-semibold text-blue-600">{progressPct}%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full mb-6 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${progressPct}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                      className="bg-blue-600 h-2 rounded-full"
                    />
                  </div>
                  <ul className="space-y-4">
                    {steps.map((step) => (
                      <li key={step.label} className="flex items-center gap-3 text-sm">
                        {step.done ? (
                          <CheckCircle className="text-emerald-500 h-5 w-5 shrink-0" />
                        ) : (
                          <Circle className="text-amber-500 h-5 w-5 shrink-0" />
                        )}
                        <span className={`font-medium ${step.done ? 'text-slate-900' : 'text-slate-500'}`}>{step.label}</span>
                        {step.label === 'Cover image saved' && coverImage && (
                          <img src={coverImage} alt="Saved cover thumbnail" className="ml-auto h-10 w-auto rounded border border-slate-200 shadow-sm" />
                        )}
                        {step.label === 'Cover image saved' && !coverImage && (
                          <button onClick={() => setActiveTab('cover')} className="ml-auto text-xs font-semibold text-blue-600 hover:underline cursor-pointer">Upload cover</button>
                        )}
                        {step.label === 'Marketing copy generated' && !marketing && (
                          <button onClick={() => setActiveTab('marketing')} className="ml-auto text-xs font-semibold text-blue-600 hover:underline cursor-pointer">Generate</button>
                        )}
                      </li>
                    ))}
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
                className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-6 h-full"
              >
                {/* Chapter rail */}
                <div className="w-full lg:w-56 shrink-0 bg-white border rounded-xl shadow-sm p-3 flex flex-col">
                  <div className="flex items-center justify-between px-1 mb-2">
                    <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Chapters</h4>
                    <button onClick={addChapter} title="Add chapter" className="p-1 rounded-md hover:bg-blue-50 text-blue-600 cursor-pointer">
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="space-y-1 overflow-y-auto">
                    {chapters.map((c) => (
                      <div
                        key={c.id}
                        className={`group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors ${
                          c.id === activeChapter.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50 border border-transparent'
                        }`}
                        onClick={() => setActiveChapterId(c.id)}
                      >
                        <FileText className={`h-4 w-4 shrink-0 ${c.id === activeChapter.id ? 'text-blue-600' : 'text-slate-400'}`} />
                        <span className={`text-sm truncate flex-1 ${c.id === activeChapter.id ? 'text-blue-800 font-semibold' : 'text-slate-700'}`}>
                          {c.title || 'Untitled'}
                        </span>
                        {chapters.length > 1 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteChapter(c.id); }}
                            title="Delete chapter"
                            className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-400 hover:text-red-600 transition-all cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Canvas */}
                <div className="flex-1 bg-white border shadow-lg rounded-sm flex flex-col min-h-[500px]">
                  <div className="border-b p-3 flex flex-wrap items-center gap-3 bg-slate-50/50">
                    <div className="flex items-center gap-1 bg-white border rounded-md p-1 shadow-sm">
                      <button onClick={() => applyFormat('**', '**')} title="Bold" className="p-2 hover:bg-slate-100 rounded transition-colors text-slate-600 hover:text-slate-900 cursor-pointer">
                        <Bold className="h-4 w-4" />
                      </button>
                      <button onClick={() => applyFormat('*', '*')} title="Italic" className="p-2 hover:bg-slate-100 rounded transition-colors text-slate-600 hover:text-slate-900 cursor-pointer">
                        <Italic className="h-4 w-4" />
                      </button>
                      <button onClick={() => applyFormat('<u>', '</u>')} title="Underline" className="p-2 hover:bg-slate-100 rounded transition-colors text-slate-600 hover:text-slate-900 cursor-pointer">
                        <Underline className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="w-px h-6 bg-slate-300" />

                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleRewrite}
                        disabled={isRewriting || !activeChapter.content.trim()}
                        title="Rewrite this chapter with AI"
                        className="px-3 py-1.5 hover:bg-purple-50 rounded-md flex items-center gap-2 text-purple-600 text-sm font-semibold transition-all border border-transparent hover:border-purple-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        {isRewriting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                        <span>AI Rewrite</span>
                      </button>

                      {preRewrite !== null && (
                        <button onClick={undoRewrite} title="Undo AI rewrite" className="px-3 py-1.5 hover:bg-slate-100 rounded-md flex items-center gap-2 text-slate-600 text-sm font-semibold transition-all cursor-pointer">
                          <Undo2 className="h-4 w-4" /> Undo
                        </button>
                      )}

                      <button
                        onClick={generateOutline}
                        disabled={isGeneratingOutline}
                        title="Generate a book outline"
                        className="px-3 py-1.5 hover:bg-blue-50 rounded-md flex items-center gap-2 text-blue-600 text-sm font-semibold transition-all border border-transparent hover:border-blue-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        {isGeneratingOutline ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListTree className="h-4 w-4" />}
                        <span>Generate Outline</span>
                      </button>
                    </div>
                  </div>

                  {/* Chapter title */}
                  <input
                    aria-label="Chapter title"
                    value={activeChapter.title}
                    onChange={(e) => updateActiveChapter({ title: e.target.value })}
                    placeholder="Chapter title"
                    className="px-12 pt-8 pb-2 text-2xl font-bold outline-none w-full font-serif"
                  />
                  <textarea
                    ref={textareaRef}
                    className={`flex-1 w-full px-12 pb-12 pt-2 resize-none outline-none leading-relaxed transition-all ${
                      preset === 'classic' ? 'font-serif text-lg' : preset === 'modern' ? 'font-sans text-xl tracking-tight' : 'font-serif text-base'
                    }`}
                    value={activeChapter.content}
                    onChange={(e) => updateActiveChapter({ content: e.target.value })}
                    placeholder="Start writing your masterpiece..."
                  />
                </div>

                {/* Tools sidebar */}
                <div className="w-full lg:w-72 space-y-4 shrink-0">
                  <div className="bg-white p-4 border rounded-xl shadow-sm">
                    <h4 className="text-sm font-bold mb-3 uppercase text-slate-500 tracking-wider flex items-center gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-purple-500" /> AI Editing Assistant
                    </h4>
                    <button
                      onClick={handleRefineManuscript}
                      disabled={isRefining || !activeChapter.content.trim()}
                      className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:cursor-not-allowed mb-2"
                    >
                      {isRefining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                      Refine Chapter
                    </button>

                    {refinementSuggestions && (
                      <div className="mt-2 border-t pt-2">
                        <button
                          onClick={() => setIsSuggestionsOpen(!isSuggestionsOpen)}
                          className="w-full flex items-center justify-between text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors py-1 cursor-pointer"
                        >
                          <span className="flex items-center gap-1.5">
                            <Sparkles className="h-3 w-3 text-purple-500" /> AI SUGGESTIONS
                          </span>
                          {isSuggestionsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </button>
                        {isSuggestionsOpen && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="overflow-hidden">
                            <div className="mt-2 text-xs text-slate-700 bg-purple-50/50 p-3 rounded-lg border border-purple-100 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto shadow-inner">
                              {refinementSuggestions}
                            </div>
                          </motion.div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="bg-white p-4 border rounded-xl shadow-sm">
                    <h4 className="text-sm font-bold mb-3 uppercase text-slate-500 tracking-wider">Style Presets</h4>
                    <div className="space-y-2">
                      {[
                        { id: 'professional', label: 'Professional', sub: 'Merriweather / Inter', font: 'font-serif' },
                        { id: 'classic', label: 'Classic', sub: 'Playfair / Lato', font: 'font-serif italic' },
                        { id: 'modern', label: 'Modern', sub: 'Geist / Roboto', font: 'font-sans font-bold tracking-tight' },
                      ].map((p) => (
                        <motion.button
                          key={p.id}
                          whileHover={{ scale: 1.02, x: 4 }}
                          whileTap={{ scale: 0.98 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                          onClick={() => setPreset(p.id)}
                          className={`w-full text-left p-3 rounded-xl border transition-all relative overflow-hidden cursor-pointer ${
                            preset === p.id ? 'border-blue-500 bg-blue-50/50 shadow-sm' : 'border-slate-200'
                          }`}
                        >
                          <div className="relative z-10">
                            <span className={`block text-sm ${p.font} ${preset === p.id ? 'text-blue-700' : 'text-slate-900'}`}>{p.label}</span>
                            <span className="block font-sans text-[10px] uppercase tracking-widest text-slate-500 mt-0.5">{p.sub}</span>
                          </div>
                        </motion.button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white p-4 border rounded-xl shadow-sm">
                    <h4 className="text-sm font-bold mb-2 uppercase text-slate-500 tracking-wider">Chapter Specs</h4>
                    <div className="text-xs space-y-2 text-slate-600">
                      <div className="flex justify-between"><span>Trim:</span> <span className="font-mono font-bold">6x9 in</span></div>
                      <div className="flex justify-between"><span>Chapter words:</span> <span className="font-mono font-bold">{countWords(activeChapter.content).toLocaleString()}</span></div>
                      <div className="flex justify-between"><span>Book words:</span> <span className="font-mono font-bold">{bookWords.toLocaleString()}</span></div>
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

                <div className="w-full md:w-80 space-y-4 shrink-0">
                  <div className="bg-white p-5 border rounded-xl shadow-sm">
                    <h3 className="text-lg font-bold mb-1 flex items-center gap-2">
                      <ImageIcon className="h-5 w-5 text-blue-600" /> Book Cover
                    </h3>
                    <p className="text-xs text-slate-500 mb-4">Upload and save the cover that will be embedded in the export.</p>

                    <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleCoverSelect(e.target.files?.[0])} />

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
                      {isSavingCover ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : <><Save className="h-4 w-4" /> Save Cover</>}
                    </button>

                    {coverImage && (
                      <button onClick={handleRemoveCover} className="w-full mt-2 text-slate-500 hover:text-red-600 px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer">
                        <Trash2 className="h-4 w-4" /> Remove saved cover
                      </button>
                    )}

                    <AnimatePresence>
                      {coverError && (
                        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="mt-3 flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                          <span>{coverError}</span>
                        </motion.div>
                      )}
                      {coverSaved && !hasUnsavedCover && !coverError && (
                        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="mt-3 flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                          <CheckCircle className="h-4 w-4 shrink-0" />
                          <span>Cover saved successfully.</span>
                        </motion.div>
                      )}
                      {hasUnsavedCover && !coverError && (
                        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3 text-xs text-amber-600 font-medium flex items-center gap-1.5">
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
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="max-w-4xl mx-auto"
              >
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2"><Megaphone className="h-6 w-6 text-blue-600" /> Marketing Page Generator</h2>
                    <p className="text-slate-500 text-sm">AI-generated copy for your book's landing page, tuned to your details and manuscript.</p>
                  </div>
                  <button
                    onClick={generateMarketing}
                    disabled={isGeneratingMarketing}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer disabled:cursor-not-allowed shrink-0"
                  >
                    {isGeneratingMarketing ? <Loader2 className="h-4 w-4 animate-spin" /> : marketing ? <RefreshCw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                    {marketing ? 'Regenerate' : 'Generate Copy'}
                  </button>
                </div>

                {marketingError && (
                  <div className="mb-4 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /> <span>{marketingError}</span>
                  </div>
                )}

                {!marketing && !isGeneratingMarketing && !marketingError && (
                  <div className="bg-white border rounded-xl shadow-sm p-12 text-center text-slate-500">
                    <div className="bg-blue-100 h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Globe className="h-10 w-10 text-blue-600" />
                    </div>
                    <p className="font-medium text-slate-700 mb-1">No marketing copy yet</p>
                    <p className="text-sm max-w-md mx-auto">Click <span className="font-semibold">Generate Copy</span> to create a description, taglines, keywords, and a back-cover blurb from your book.</p>
                  </div>
                )}

                {isGeneratingMarketing && (
                  <div className="bg-white border rounded-xl shadow-sm p-12 text-center text-slate-500">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-blue-600" />
                    <p className="text-sm">Generating marketing copy…</p>
                  </div>
                )}

                {marketing && (
                  <div className="space-y-4">
                    <MarketingCard title="Description" onCopy={() => copyText('desc', marketing.description)} copied={copied === 'desc'}>
                      <p className="text-sm text-slate-700 leading-relaxed">{marketing.description}</p>
                    </MarketingCard>

                    <MarketingCard title="Taglines" onCopy={() => copyText('tags', marketing.taglines.join('\n'))} copied={copied === 'tags'}>
                      <ul className="space-y-2">
                        {marketing.taglines.map((t, i) => (
                          <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
                            <span className="text-blue-500 font-bold">{i + 1}.</span> {t}
                          </li>
                        ))}
                      </ul>
                    </MarketingCard>

                    <MarketingCard title="Keywords" onCopy={() => copyText('kw', marketing.keywords.join(', '))} copied={copied === 'kw'}>
                      <div className="flex flex-wrap gap-2">
                        {marketing.keywords.map((k, i) => (
                          <span key={i} className="bg-indigo-50 text-indigo-700 text-xs font-medium px-2.5 py-1 rounded-full border border-indigo-100">{k}</span>
                        ))}
                      </div>
                    </MarketingCard>

                    <MarketingCard title="Back-cover Blurb" onCopy={() => copyText('blurb', marketing.blurb)} copied={copied === 'blurb'}>
                      <p className="text-sm text-slate-700 leading-relaxed italic whitespace-pre-wrap">{marketing.blurb}</p>
                    </MarketingCard>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

function MarketingCard({
  title,
  onCopy,
  copied,
  children,
}: {
  title: string;
  onCopy: () => void;
  copied: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border rounded-xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-bold uppercase text-slate-500 tracking-wider">{title}</h4>
        <button onClick={onCopy} className="text-xs font-semibold text-slate-500 hover:text-blue-600 flex items-center gap-1 transition-colors cursor-pointer">
          {copied ? <><Check className="h-3.5 w-3.5 text-emerald-600" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
        </button>
      </div>
      {children}
    </div>
  );
}
