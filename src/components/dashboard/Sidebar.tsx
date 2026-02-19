'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
    LayoutDashboard,
    Users,
    CalendarDays,
    Clock,
    FileText,
    Settings,
    LogOut,
    ShieldCheck,
} from 'lucide-react';

const roleMenus = {
    HR_ADMIN: [
        { name: 'Dashboard', href: '/dashboard/hr', icon: LayoutDashboard },
        { name: 'Employees', href: '/dashboard/hr/employees', icon: Users },
        { name: 'Attendance', href: '/dashboard/hr/attendance', icon: Clock },
        { name: 'Reports', href: '/dashboard/hr/reports', icon: FileText },
        { name: 'Settings', href: '/dashboard/hr/settings', icon: Settings },
    ],
    MANAGER: [
        { name: 'Dashboard', href: '/dashboard/manager', icon: LayoutDashboard },
        { name: 'My Team', href: '/dashboard/manager/team', icon: Users },
        { name: 'Approvals', href: '/dashboard/manager/approvals', icon: ShieldCheck },
    ],
    EMPLOYEE: [
        { name: 'Dashboard', href: '/dashboard/employee', icon: LayoutDashboard },
        { name: 'My Attendance', href: '/dashboard/employee/attendance', icon: CalendarDays },
        { name: 'Leave Apply', href: '/dashboard/employee/leave', icon: FileText },
    ],
};

// Mock Role for now - In real app, get from Session
const CURRENT_ROLE = 'HR_ADMIN';

export function Sidebar() {
    const pathname = usePathname();
    const menus = roleMenus[CURRENT_ROLE as keyof typeof roleMenus] || roleMenus.EMPLOYEE;

    return (
        <div className="flex h-full w-64 flex-col bg-slate-900 text-white">
            <div className="flex h-16 items-center justify-center border-b border-slate-800">
                <h1 className="text-xl font-bold tracking-tight">ESSL <span className="text-blue-400">Next</span></h1>
            </div>

            <div className="flex-1 overflow-y-auto py-4">
                <nav className="space-y-1 px-2">
                    {menus.map((item) => {
                        const isActive = pathname.startsWith(item.href);
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                className={cn(
                                    'flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors',
                                    isActive
                                        ? 'bg-blue-600 text-white'
                                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                                )}
                            >
                                <item.icon className="mr-3 h-5 w-5" />
                                {item.name}
                            </Link>
                        );
                    })}
                </nav>
            </div>

            <div className="border-t border-slate-800 p-4">
                <button className="flex w-full items-center rounded-md px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white">
                    <LogOut className="mr-3 h-5 w-5" />
                    Logout
                </button>
            </div>
        </div>
    );
}
