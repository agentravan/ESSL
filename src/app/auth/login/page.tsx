'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Lock } from 'lucide-react';

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    // Mock Login Handler
    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        // Simulate API call
        setTimeout(() => {
            setLoading(false);
            // Simple mock redirect based on email for testing UI flows
            if (email.includes('hr')) {
                router.push('/dashboard/hr');
            } else if (email.includes('manager')) {
                router.push('/dashboard/manager');
            } else {
                router.push('/dashboard/employee');
            }
        }, 1000);
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-4">
            <Card className="w-full max-w-md border-0 bg-white/95 shadow-2xl backdrop-blur">
                <CardHeader className="space-y-1 text-center">
                    <div className="flex justify-center mb-4">
                        <div className="p-3 bg-blue-100 rounded-full">
                            <Lock className="h-6 w-6 text-blue-600" />
                        </div>
                    </div>
                    <CardTitle className="text-2xl font-bold tracking-tight text-slate-900">
                        Allied Medical Limited
                    </CardTitle>
                    <CardDescription className="text-slate-500">
                        Attendance & Leave Control Panel
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="name@company.com"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="password">Password</Label>
                                <a href="#" className="text-xs text-blue-600 hover:underline">Forgot password?</a>
                            </div>
                            <Input
                                id="password"
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                        <Button className="w-full bg-blue-600 hover:bg-blue-700" type="submit" disabled={loading}>
                            {loading ? 'Signing in...' : 'Sign In'}
                        </Button>
                    </form>
                </CardContent>
                <CardFooter className="justify-center border-t p-4">
                    <p className="text-xs text-slate-400">
                        Internal HR System | Confidential • Allied Medical
                    </p>
                </CardFooter>
            </Card>
        </div>
    );
}
