import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Cpu, Bell, Settings, LogOut, Map } from "lucide-react";
import { useAuth } from "../lib/auth";
import { isSuperAdmin, canManageCompanyUsers } from "../lib/roles";
import AiChatSidebar, { ChatTriggerButton } from "./AiChatSidebar";

export default function AppShell() {
    const { user, client, logout, selectedClientId, selectedClientName, setSelectedClientId } = useAuth();
    const navigate = useNavigate();
    const [theme, setTheme] = useState<"light" | "dark">(() => {
        if (typeof window !== "undefined") {
            return (localStorage.getItem("theme") as "light" | "dark") || "light";
        }
        return "light";
    });

    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const location = useLocation();

    useEffect(() => {
        if (theme === "dark") {
            document.documentElement.classList.add("dark");
        } else {
            document.documentElement.classList.remove("dark");
        }
        localStorage.setItem("theme", theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => prev === "dark" ? "light" : "dark");
    };

    const navLinks = [
        { name: "Dashboard", path: "/", icon: LayoutDashboard },
        { name: "Devices", path: "/devices", icon: Cpu },
        { name: "Sites", path: "/sites", icon: Map },
        { name: "Alerts", path: "/alerts", icon: Bell },
    ];

    const adminLinks = [
        { name: "Clients", path: "/admin/clients", icon: Settings },
        { name: "Users", path: "/admin/users", icon: Settings },
    ];

    const myCompanyLinks = [
        { name: "Users", path: "/my-company/users", icon: Settings },
    ];

    // Derived flags to conditionally show/hide sections
    const isSuperAdminUser = isSuperAdmin(user);
    const canSeeMyCompany = canManageCompanyUsers(user) && !isSuperAdminUser;
    const canSeeAdmin = isSuperAdminUser;

    let displayClientName = client?.name || "No Client Selected";
    let isImpersonating = false;

    if (isSuperAdminUser) {
        if (selectedClientId) {
            displayClientName = selectedClientName || "Selected Client";
            isImpersonating = true;
        } else {
            displayClientName = "No Client Selected";
        }
    }

    const primaryLetter = displayClientName.charAt(0).toUpperCase();

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">
            {/* Sidebar (Desktop) */}
            <aside className="fixed inset-y-0 left-0 hidden w-56 bg-slate-900 text-slate-400 md:flex flex-col z-20 shadow-xl border-r border-white/5">
                {/* Project Switcher */}
                <div className="h-16 px-4 flex items-center border-b border-white/5">
                    <div className="w-full flex items-center gap-3 px-2 py-1.5 rounded-lg group">
                        <div className="w-8 h-8 rounded-md bg-blue-600 flex items-center justify-center text-white font-bold text-xs shadow-inner shadow-white/20">
                            {primaryLetter}
                        </div>
                        <div className="flex-1 text-left">
                            <div className="text-[10px] font-bold tracking-wider uppercase text-slate-500 group-hover:text-slate-400">
                                {isImpersonating ? "Impersonating" : "Project"}
                            </div>
                            <div className="text-sm font-medium text-slate-200 truncate pr-2" title={displayClientName}>
                                {isSuperAdminUser && !isImpersonating ? (
                                    <Link to="/admin/clients" className="hover:underline hover:text-white transition-colors">Select a client</Link>
                                ) : (
                                    displayClientName
                                )}
                            </div>
                        </div>
                        {isImpersonating && (
                            <button
                                title="Stop Impersonating"
                                onClick={() => {
                                    setSelectedClientId(null);
                                    navigate('/admin/clients');
                                }}
                                className="p-1 rounded text-red-400 hover:text-white hover:bg-red-500 transition-colors"
                            >
                                <LogOut className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Navigation */}
                <div className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
                    <div className="px-3 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Menu
                    </div>
                    {navLinks.map((link) => (
                        <NavLink
                            key={link.path}
                            to={link.path}
                            className={({ isActive }) =>
                                `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 group ${isActive
                                    ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20"
                                    : "hover:bg-white/5 hover:text-slate-100"
                                }`
                            }
                        >
                            {({ isActive }) => (
                                <>
                                    <link.icon className={`w-5 h-5 ${isActive ? "text-white" : "text-slate-500 group-hover:text-slate-300 transition-colors"}`} />
                                    <span>{link.name}</span>
                                </>
                            )}
                        </NavLink>
                    ))}

                    {canSeeMyCompany && (
                        <>
                            <div className="px-3 mt-6 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                My Company
                            </div>
                            {myCompanyLinks.map((link) => (
                                <NavLink
                                    key={link.path}
                                    to={link.path}
                                    className={({ isActive }) =>
                                        `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 group ${isActive
                                            ? "bg-slate-700 text-white"
                                            : "hover:bg-white/5 hover:text-slate-100"
                                        }`
                                    }
                                >
                                    {({ isActive }) => (
                                        <>
                                            <link.icon className={`w-5 h-5 ${isActive ? "text-white" : "text-slate-500 group-hover:text-slate-300 transition-colors"}`} />
                                            <span>{link.name}</span>
                                        </>
                                    )}
                                </NavLink>
                            ))}
                        </>
                    )}

                    {canSeeAdmin && import.meta.env.VITE_ADMIN_TOKEN && (
                        <>
                            <div className="px-3 mt-6 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                Platform Admin
                            </div>
                            {adminLinks.map((link) => (
                                <NavLink
                                    key={link.path}
                                    to={link.path}
                                    className={({ isActive }) =>
                                        `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 group ${isActive
                                            ? "bg-slate-700 text-white"
                                            : "hover:bg-white/5 hover:text-slate-100"
                                        }`
                                    }
                                >
                                    {({ isActive }) => (
                                        <>
                                            <link.icon className={`w-5 h-5 ${isActive ? "text-white" : "text-slate-500 group-hover:text-slate-300 transition-colors"}`} />
                                            <span>{link.name}</span>
                                        </>
                                    )}
                                </NavLink>
                            ))}
                        </>
                    )}
                </div>

                {/* Bottom Section */}
                <div className="p-3 border-t border-white/5 space-y-1">
                    <div className="px-3 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Settings
                    </div>
                    <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium hover:bg-white/5 hover:text-slate-100 transition-colors group text-left">
                        <Settings className="w-5 h-5 text-slate-500 group-hover:text-slate-300 transition-colors" />
                        <span>Settings</span>
                    </button>
                    <button onClick={logout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium hover:bg-red-500/10 hover:text-red-400 text-slate-400 transition-colors group text-left">
                        <LogOut className="w-5 h-5 text-slate-500 group-hover:text-red-400 transition-colors" />
                        <span>Logout</span>
                    </button>
                </div>
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
                <div className="md:hidden fixed inset-0 top-16 z-20 bg-slate-900 p-4 animate-in fade-in slide-in-from-top-4 duration-200">
                    <div className="space-y-2">
                        {navLinks.map((link) => (
                            <NavLink
                                key={link.path}
                                to={link.path}
                                onClick={() => setMobileMenuOpen(false)}
                                className={({ isActive }) =>
                                    `flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-colors ${isActive
                                        ? "bg-blue-600 text-white"
                                        : "text-slate-400 hover:bg-white/5 hover:text-white"
                                    }`
                                }
                            >
                                <link.icon className="w-5 h-5" />
                                {link.name}
                            </NavLink>
                        ))}
                        {canSeeMyCompany && (
                            <div className="pt-4 mt-2 border-t border-white/5">
                                <div className="px-4 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                    My Company
                                </div>
                                {myCompanyLinks.map((link) => (
                                    <NavLink
                                        key={link.path}
                                        to={link.path}
                                        onClick={() => setMobileMenuOpen(false)}
                                        className={({ isActive }) =>
                                            `flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-colors ${isActive
                                                ? "bg-slate-700 text-white"
                                                : "text-slate-400 hover:bg-white/5 hover:text-white"
                                            }`
                                        }
                                    >
                                        <link.icon className="w-5 h-5" />
                                        {link.name}
                                    </NavLink>
                                ))}
                            </div>
                        )}
                        {canSeeAdmin && import.meta.env.VITE_ADMIN_TOKEN && (
                            <div className="pt-4 mt-2 border-t border-white/5">
                                <div className="px-4 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                    Platform Admin
                                </div>
                                {adminLinks.map((link) => (
                                    <NavLink
                                        key={link.path}
                                        to={link.path}
                                        onClick={() => setMobileMenuOpen(false)}
                                        className={({ isActive }) =>
                                            `flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-colors ${isActive
                                                ? "bg-slate-700 text-white"
                                                : "text-slate-400 hover:bg-white/5 hover:text-white"
                                            }`
                                        }
                                    >
                                        <link.icon className="w-5 h-5" />
                                        {link.name}
                                    </NavLink>
                                ))}
                            </div>
                        )}
                        <div className="pt-4 mt-4 border-t border-white/10">
                            <div className="flex items-center justify-between px-2 text-slate-400">
                                <span className="text-sm font-medium">Theme</span>
                                <button
                                    onClick={toggleTheme}
                                    className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
                                >
                                    {theme === 'light' ? '🌙' : '☀️'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Content */}
            <div className="md:pl-56 flex flex-col min-h-screen">
                {/* Topbar (Desktop) */}
                <header className="hidden md:flex h-16 sticky top-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-white/10 z-10 px-6 items-center justify-between">
                    <h1 className="text-lg font-semibold">
                        {navLinks.find(l => l.path === location.pathname)?.name || (location.pathname.startsWith("/device/") ? "Device Details" : "Viewer")}
                    </h1>
                    <div className="flex items-center gap-4 ml-auto">
                        <div id="topbar-actions" className="flex items-center gap-2 empty:hidden"></div>
                        <ChatTriggerButton
                            onClick={() => setIsChatOpen(prev => !prev)}
                            active={isChatOpen}
                        />
                        <button
                            onClick={toggleTheme}
                            className="p-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors rounded-full hover:bg-slate-100 dark:hover:bg-white/5"
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

            {/* AI Chat Sidebar — mounted once so messages survive navigation */}
            <AiChatSidebar open={isChatOpen} onClose={() => setIsChatOpen(false)} />
        </div>
    );
}
