const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
    console.log('Seeding database...');

    // 1. Create Default Shift (General Shift)
    const generalShift = await prisma.shiftMaster.upsert({
        where: { name: 'General Shift' },
        update: {},
        create: {
            name: 'General Shift',
            startTime: new Date('1970-01-01T09:30:00Z'),
            endTime: new Date('1970-01-01T18:30:00Z'),
            lateGraceMinutes: 15,
            earlyExitGrace: 15,
            halfDayThreshold: 240, // 4 hours
            fullDayThreshold: 480, // 8 hours
            otThreshold: 60,
        },
    });

    console.log('Created Shift:', generalShift.name);

    // 2. Create Departments
    const departments = ['HR', 'IT', 'Operations', 'Sales'];
    for (const dept of departments) {
        await prisma.department.upsert({
            where: { name: dept },
            update: {},
            create: { name: dept, code: dept.toUpperCase().substring(0, 3) },
        });
    }

    // 3. Create Locations
    const location = await prisma.location.upsert({
        where: { name: 'Head Office' },
        update: {},
        create: { name: 'Head Office', address: 'Mumbai, India' },
    });

    // 4. Create Super Admin User
    const adminEmail = 'admin@company.com';
    const adminUser = await prisma.user.upsert({
        where: { email: adminEmail },
        update: {},
        create: {
            email: adminEmail,
            password: 'hashed_password_placeholder', // bcrypt hash in real app
            role: 'SUPER_ADMIN',
            isActive: true,
        },
    });

    // 5. Create Employee Profile for Admin (Optional but good for consistency)
    // Ensure we have a department to link
    const hrDept = await prisma.department.findUnique({ where: { name: 'HR' } });

    if (hrDept) {
        await prisma.employee.upsert({
            where: { userId: adminUser.id },
            update: {},
            create: {
                userId: adminUser.id,
                empCode: 'EMP001',
                firstName: 'Super',
                lastName: 'Admin',
                designation: 'System Administrator',
                departmentId: hrDept.id,
                locationId: location.id,
                shiftId: generalShift.id,
                joiningDate: new Date(),
            }
        });
    }

    console.log('Seeding completed.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
