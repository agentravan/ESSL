import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Clock, CheckSquare, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ManagerDashboard() {
    return (
        <div className="space-y-6">
            <h2 className="text-3xl font-bold tracking-tight">Manager Module</h2>

            {/* Team Stats */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Team Presence</CardTitle>
                        <Users className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">92%</div>
                        <p className="text-xs text-muted-foreground">12/13 Present</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
                        <CheckSquare className="h-4 w-4 text-orange-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">4</div>
                        <p className="text-xs text-muted-foreground">Requires action</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Late Arrivals</CardTitle>
                        <Clock className="h-4 w-4 text-yellow-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">2</div>
                        <p className="text-xs text-muted-foreground">Exceeded grace period</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Recent Approvals */}
                <Card className="h-full">
                    <CardHeader>
                        <CardTitle>Approval Queue</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="flex items-center justify-between rounded-lg border p-3">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold">JD</div>
                                        <div>
                                            <p className="text-sm font-medium">John Doe</p>
                                            <p className="text-xs text-muted-foreground">Casual Leave • 2 Days</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700">Reject</Button>
                                        <Button size="sm" className="bg-green-600 hover:bg-green-700">Approve</Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Team Status Table */}
                <Card className="h-full">
                    <CardHeader>
                        <CardTitle>Team Status Today</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between border-b pb-2 text-sm font-medium text-muted-foreground">
                                <span>Employee</span>
                                <span>Status</span>
                                <span>In Time</span>
                            </div>
                            {/* Mock Rows */}
                            <div className="flex items-center justify-between py-2 text-sm">
                                <span className="font-medium">Sarah Smith</span>
                                <span className="text-green-600 flex items-center"><div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div> Present</span>
                                <span>09:25 AM</span>
                            </div>
                            <div className="flex items-center justify-between py-2 text-sm">
                                <span className="font-medium">Mike Johnson</span>
                                <span className="text-amber-600 flex items-center"><div className="w-2 h-2 bg-amber-500 rounded-full mr-2"></div> Late</span>
                                <span>09:50 AM</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
