import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button"; // Will create if missing
import { CalendarDays, Clock, FileText, Download } from "lucide-react";

export default function EmployeeDashboard() {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight">My Dashboard</h2>
                <div className="flex space-x-2">
                    <span className="text-sm text-slate-500">Today: 15 Oct, 2026</span>
                </div>
            </div>

            {/* Status Card */}
            <Card className="bg-gradient-to-r from-blue-600 to-blue-800 text-white border-0">
                <CardContent className="p-6 flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-medium opacity-90">Today's Status</h3>
                        <div className="text-4xl font-bold mt-2 flex items-center">
                            <div className="h-4 w-4 bg-green-400 rounded-full mr-3 shadow-[0_0_10px_rgba(74,222,128,0.8)]"></div>
                            PRESENT
                        </div>
                        <p className="mt-2 text-blue-100 text-sm">Punch In: 09:24 AM</p>
                    </div>
                    <div className="text-right">
                        <div className="text-sm opacity-80">Shift Efficiency</div>
                        <div className="text-2xl font-bold">94%</div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-6 md:grid-cols-3">
                {/* Main Calendar Area */}
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle>Attendance Calendar</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="min-h-[300px] flex items-center justify-center border rounded-md bg-slate-50 text-muted-foreground">
                            [ Calendar Component Placeholder ]
                        </div>
                        <div className="mt-4 flex flex-wrap gap-4 text-xs">
                            <div className="flex items-center"><div className="w-3 h-3 bg-green-500 rounded mr-2"></div> Present</div>
                            <div className="flex items-center"><div className="w-3 h-3 bg-red-500 rounded mr-2"></div> Absent</div>
                            <div className="flex items-center"><div className="w-3 h-3 bg-yellow-500 rounded mr-2"></div> Late</div>
                            <div className="flex items-center"><div className="w-3 h-3 bg-blue-500 rounded mr-2"></div> Leave</div>
                            <div className="flex items-center"><div className="w-3 h-3 bg-purple-500 rounded mr-2"></div> Holiday</div>
                        </div>
                    </CardContent>
                </Card>

                {/* Quick Actions */}
                <Card>
                    <CardHeader>
                        <CardTitle>Quick Actions</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <Button className="w-full justify-start bg-blue-600 hover:bg-blue-700 text-white">
                            <FileText className="mr-2 h-4 w-4" /> Apply Leave
                        </Button>
                        <Button className="w-full justify-start" variant="outline">
                            <Clock className="mr-2 h-4 w-4" /> Apply OD / WFH
                        </Button>
                        <Button className="w-full justify-start" variant="outline">
                            <CalendarDays className="mr-2 h-4 w-4" /> View Attendance
                        </Button>
                        <Button className="w-full justify-start" variant="outline">
                            <Download className="mr-2 h-4 w-4" /> Download Salary Slip
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
