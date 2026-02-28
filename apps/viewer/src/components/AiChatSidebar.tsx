/**
 * AiChatSidebar — non-modal right-side panel.
 *
 * Intentionally NOT a dialog/modal:
 *   - No backdrop/overlay so the dashboard stays fully clickable.
 *   - No body-scroll lock so the page is scrollable behind the panel.
 *   - No focus trap — the user can freely tab/click anywhere in the app.
 *
 * We use a simple fixed-position aside that slides in from the right.
 * Only the Escape key closes it (no capturing / blocking of other events).
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { KeyboardEvent } from 'react';
import { X, MessageCircle, Send, Bot } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = 'bot' | 'user';

interface ChatMessage {
    id: string;
    role: Role;
    text: string;
}

const BOT_GREETING: ChatMessage = {
    id: 'greeting',
    role: 'bot',
    text: "Hi, I'm Sense. Ask me anything about your data 🍸",
};

const DEMO_QUESTION = "Can you tell me the average temperature of the office last week?";
const DEMO_ANSWER = "No idea! I'll drink some vodka and get back to you";
const FALLBACK_ANSWER = "Not wired yet — ask me again after I've had a drink 🍸";

function getBotReply(userText: string): string {
    if (userText.toLowerCase().includes('average temperature') ||
        userText.toLowerCase().includes('office last week')) {
        return DEMO_ANSWER;
    }
    return FALLBACK_ANSWER;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface AiChatSidebarProps {
    open: boolean;
    onClose: () => void;
}

export default function AiChatSidebar({ open, onClose }: AiChatSidebarProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([BOT_GREETING]);
    const [input, setInput] = useState('');
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const bodyRef = useRef<HTMLDivElement>(null);

    // Auto-scroll message list to bottom
    useEffect(() => {
        if (bodyRef.current) {
            bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
        }
    }, [messages]);

    // Focus input when panel opens
    useEffect(() => {
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 80);
        }
    }, [open]);

    // Escape key closes panel — non-capturing so it does not block other handlers
    useEffect(() => {
        if (!open) return;
        const handler = (e: globalThis.KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, onClose]);

    const sendMessage = useCallback(() => {
        const text = input.trim();
        if (!text) return;

        const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', text };
        const botMsg: ChatMessage = { id: `b-${Date.now() + 1}`, role: 'bot', text: getBotReply(text) };

        setMessages(prev => [...prev, userMsg, botMsg]);
        setInput('');
        // Reset textarea height
        if (inputRef.current) {
            inputRef.current.style.height = 'auto';
        }
    }, [input]);

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    // Fixed header height to offset the panel correctly (matches AppShell topbar h-16 = 64px)
    const TOP_OFFSET = 'top-16';

    return (
        // No backdrop — the panel is a pure overlay that does not dim or block the page.
        <aside
            aria-label="SenseBot AI assistant"
            role="complementary"
            className={`fixed ${TOP_OFFSET} right-0 bottom-0 w-full sm:w-[420px] z-30 flex flex-col
                bg-white dark:bg-slate-900
                border-l border-slate-200 dark:border-white/10
                shadow-2xl shadow-slate-900/20 dark:shadow-black/50
                transition-transform duration-300 ease-in-out
                ${open ? 'translate-x-0' : 'translate-x-full'}`}
        >
            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 dark:border-white/10 bg-gradient-to-r from-blue-600 to-indigo-600 text-white shrink-0">
                <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                    <Bot className="w-5 h-5 text-white" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm leading-tight">SenseBot</div>
                    <div className="text-[11px] text-white/70 leading-tight">Data assistant (coming soon)</div>
                </div>
                <button
                    aria-label="Close SenseBot panel"
                    onClick={onClose}
                    className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
                >
                    <X className="w-5 h-5" aria-hidden="true" />
                </button>
            </div>

            {/* ── Message list ─────────────────────────────────────────────── */}
            <div
                ref={bodyRef}
                className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
            >
                {messages.map(msg => (
                    <div
                        key={msg.id}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} items-end gap-2`}
                    >
                        {msg.role === 'bot' && (
                            <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center shrink-0 mb-1">
                                <Bot className="w-4 h-4 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
                            </div>
                        )}
                        <div
                            className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm
                                ${msg.role === 'user'
                                    ? 'bg-blue-600 text-white rounded-br-sm'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-bl-sm'
                                }`}
                        >
                            {msg.text}
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Footer / Input ─────────────────────────────────────────────── */}
            <div className="px-4 py-3 border-t border-slate-100 dark:border-white/10 bg-white dark:bg-slate-900 shrink-0">
                <div className="flex items-end gap-2 rounded-xl border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-slate-800 px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500/40 focus-within:border-blue-400 dark:focus-within:border-blue-500/50 transition-all">
                    <textarea
                        ref={inputRef}
                        rows={1}
                        value={input}
                        onChange={e => {
                            setInput(e.target.value);
                            e.target.style.height = 'auto';
                            e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                        }}
                        onKeyDown={handleKeyDown}
                        placeholder={DEMO_QUESTION}
                        aria-label="Message SenseBot"
                        className="flex-1 bg-transparent resize-none text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none min-h-[24px] max-h-[120px] leading-relaxed"
                        style={{ height: '24px' }}
                    />
                    <button
                        aria-label="Send message"
                        onClick={sendMessage}
                        disabled={!input.trim()}
                        className="shrink-0 p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors self-end mb-0.5"
                    >
                        <Send className="w-4 h-4" aria-hidden="true" />
                    </button>
                </div>
                <p className="text-[10px] text-slate-400 dark:text-slate-600 text-center mt-2">
                    Enter to send · Shift+Enter for new line
                </p>
            </div>
        </aside>
    );
}

// ─── Trigger button ───────────────────────────────────────────────────────────

interface ChatTriggerButtonProps {
    onClick: () => void;
    active?: boolean;
}

export function ChatTriggerButton({ onClick, active }: ChatTriggerButtonProps) {
    return (
        <button
            aria-label={active ? 'Close SenseBot panel' : 'Open SenseBot panel'}
            aria-expanded={active}
            onClick={onClick}
            className={`p-2 rounded-full transition-colors ${active
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
                }`}
            title="SenseBot"
        >
            <MessageCircle className="w-5 h-5" aria-hidden="true" />
        </button>
    );
}
