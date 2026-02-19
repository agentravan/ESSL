import { prisma } from './prisma';
import { AttendanceStatus, AttendanceFlag, ShiftMaster } from '@prisma/client';

export type DailyPunchData = {
    employeeId: string;
    date: Date;
    punches: Date[]; // Sorted ASC
};

export async function processAttendance(data: DailyPunchData) {
    const { employeeId, date, punches } = data;

    // 1. Fetch Employee & Shift Context
    const employee = await prisma.employee.findUnique({
        where: { id: employeeId },
        include: { shift: true },
    });

    if (!employee) {
        throw new Error(`Employee ${employeeId} not found`);
    }

    const shift = employee.shift;

    // 2. Identify Shift Timings (Adjust for date)
    // Assuming Shift Start Time is stored as 1970-01-01 T...
    // We need to combine 'date' with 'shift.startTime'
    const shiftStart = combineDateAndTime(date, shift.startTime);
    const shiftEnd = combineDateAndTime(date, shift.endTime);

    // If Night Shift (End < Start), End is next day
    if (shift.endTime < shift.startTime) {
        shiftEnd.setDate(shiftEnd.getDate() + 1);
    }

    // 3. Process Punches (Simple First-IN Last-OUT for now)
    // TODO: ESSL Raw data might need more complex pairing if multiple IN/OUT
    let punchIn = punches.length > 0 ? punches[0] : null;
    let punchOut = punches.length > 1 ? punches[punches.length - 1] : null;

    // 4. Calculate Metrics
    let workMinutes = 0;
    let lateMinutes = 0;
    let earlyExitMinutes = 0;
    let otMinutes = 0;
    let status: AttendanceStatus = AttendanceStatus.ABSENT;
    let flag: AttendanceFlag = AttendanceFlag.NORMAL;

    if (punchIn && punchOut) {
        workMinutes = Math.floor((punchOut.getTime() - punchIn.getTime()) / 60000);
    } else if (punchIn && !punchOut) {
        // Missing Out
        flag = AttendanceFlag.MISSING_PUNCH;
    }

    // Late Calculation
    if (punchIn) {
        const graceEnd = new Date(shiftStart.getTime() + shift.lateGraceMinutes * 60000);
        if (punchIn > graceEnd) {
            lateMinutes = Math.floor((punchIn.getTime() - shiftStart.getTime()) / 60000);
        }
    }

    // Early Exit Calculation
    if (punchOut && punchOut < shiftEnd) {
        const earlyGraceStart = new Date(shiftEnd.getTime() - shift.earlyExitGrace * 60000); // Assuming earlyExitGrace exists on logic, mapped from schema if added
        // Logic: early exit if before shift end
        earlyExitMinutes = Math.floor((shiftEnd.getTime() - punchOut.getTime()) / 60000);
    }

    // Status Determination
    if (workMinutes >= shift.fullDayThreshold) {
        status = AttendanceStatus.PRESENT;
    } else if (workMinutes >= shift.halfDayThreshold) {
        status = AttendanceStatus.HALF_DAY;
    } else if (punchIn) {
        // Worked but less than half day threshold
        status = AttendanceStatus.ABSENT; // Or SHORT_LEAVE?
    } else {
        status = AttendanceStatus.ABSENT;
    }

    // OT Calculation
    if (workMinutes > shift.fullDayThreshold + shift.otThreshold) {
        otMinutes = workMinutes - shift.fullDayThreshold;
    }

    // 5. Immutable Insert
    // Find current active version to establish next version number
    const currentActive = await prisma.attendanceLedger.findFirst({
        where: {
            employeeId,
            date,
            isActive: true,
        },
        select: { version: true, id: true },
    });

    const nextVersion = (currentActive?.version || 0) + 1;

    // Transaction: Deactivate old -> Insert new
    await prisma.$transaction(async (tx) => {
        if (currentActive) {
            await tx.attendanceLedger.update({
                where: { id: currentActive.id },
                data: { isActive: false },
            });
        }

        await tx.attendanceLedger.create({
            data: {
                employeeId,
                date,
                shiftId: shift.id,
                punchIn,
                punchOut,
                status,
                flag,
                lateMinutes,
                earlyExitMinutes,
                otMinutes,
                workMinutes,
                version: nextVersion,
                isActive: true,
                processedAt: new Date(),
                // batchId?
            },
        });
    });

    return { status, lateMinutes, workMinutes };
}

function combineDateAndTime(datePart: Date, timePart: Date): Date {
    const combined = new Date(datePart);
    combined.setHours(timePart.getHours());
    combined.setMinutes(timePart.getMinutes());
    combined.setSeconds(timePart.getSeconds());
    combined.setMilliseconds(0);
    return combined;
}
