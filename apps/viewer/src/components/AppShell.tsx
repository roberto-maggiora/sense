import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

export default function AppShell() {
    const [theme, setTheme] = useState<"light" | "dark">(() => {
        if (typeof window !== "undefined") {
            return (localStorage.getItem("theme") as "light" | "dark") || "light";
        }
        return "light";
    });

    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const location = useLocation();

    useEffect(() => {
        const root = window.document.documentElement;
        if (theme === "dark") {
            root.classList.add("dark");
        } else {
            root.classList.remove("dark");
        }
        localStorage.setItem("theme", theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme((prev) => (prev === "light" ? "dark" : "light"));
    };

    const navLinks = [
        { name: "Dashboard", path: "/" },
        { name: "Devices", path: "/devices" },
        { name: "Alerts", path: "/alerts" },
    ];

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">
            {/* Sidebar (Desktop) */}
            <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 md:block z-20">
                <div className="flex h-16 items-center px-6 border-b border-slate-200 dark:border-white/10">
                    <span className="text-xl font-bold tracking-tight">Sense</span>
                </div>
                <nav className="p-4 space-y-1">
                    {navLinks.map((link) => (
                        <Link
                            key={link.path}
                            to={link.path}
                            className={`block px-4 py-2 rounded-md text-sm font-medium transition-colors ${location.pathname === link.path
                                    ? "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400"
                                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"
                                }`}
                        >
                            {link.name}
                        </Link>
                    ))}
                </nav>
            </aside>

            {/* Mobile Header */}
            <div className="md:hidden flex items-center justify-between h-16 px-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-white/10 sticky top-0 z-30">
                <Link to="/" className="font-bold text-lg">Sense</Link>
                <button
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 rounded-md"
                >
                    {mobileMenuOpen ? (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    ) : (
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                    )}
                </button>
            </div>

            {/* Mobile Menu */}
            {mobileMenuOpen && (
                <div className="md:hidden fixed inset-0 top-16 z-20 bg-slate-50 dark:bg-slate-950 p-4">
                    <div className="space-y-4">
                        {navLinks.map((link) => (
                            <Link
                                key={link.path}
                                to={link.path}
                                onClick={() => setMobileMenuOpen(false)}
                                className={`block px-4 py-3 rounded-lg text-base font-medium ${location.pathname === link.path
                                        ? "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400"
                                        : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10"
                                    }`}
                            >
                                {link.name}
                            </Link>
                        ))}
                        <div className="pt-4 border-t border-slate-200 dark:border-white/10">
                            <div className="flex items-center justify-between px-2">
                                <span className="text-sm font-medium">Theme</span>
                                <button
                                    onClick={toggleTheme}
                                    className="p-2 rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800"
                                >
                                    {theme === 'light' ? '🌙' : '☀️'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Content */}
            <div className="md:pl-64 flex flex-col min-h-screen">
                {/* Topbar (Desktop) */}
                <header className="hidden md:flex h-16 sticky top-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-white/10 z-10 px-6 items-center justify-between">
                    <h1 className="text-lg font-semibold">
                        {navLinks.find(l => l.path === location.pathname)?.name || (location.pathname.startsWith("/device/") ? "Device Details" : "Viewer")}
                    </h1>
                    <div className="flex items-center gap-4">
                        <span className="text-xs font-mono px-2 py-1 rounded bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400">
                            test-client
                        </span>
                        <button
                            onClick={toggleTheme}
                            className="p-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                            title="Toggle Theme"
                        >
                            {theme === 'light' ? (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                            ) : (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                            )}
                        </button>
                    </div>
                </header>

                {/* Page Content */}
                <main className="flex-1 p-6">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
