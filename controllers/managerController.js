const { Employee, Attendance, Leave, Asset, Payroll, Expense, Appreciation, CompanyPolicy, Offboarding, Payslip, Holiday, Letter, Notification, AppreciationComment, SuperAdmin, PrePayment, IncrementPromotion } = require('../models');
const { sequelize } = require('../config/db');
const { Op } = require('sequelize');
const fs = require('fs');
const path = require('path');
const { sendEmail } = require('../services/emailService');

const DEFAULT_EMPLOYEE_PASSWORD = process.env.EMPLOYEE_DEFAULT_PASSWORD || 'Emp@1234';
const toAmount = (value) => {
    const amount = parseFloat(value);
    return Number.isFinite(amount) ? amount : 0;
};

const calculateNetSalary = (basic, allowances, deductions) =>
    parseFloat((toAmount(basic) + toAmount(allowances) - toAmount(deductions)).toFixed(2));

const getLatestPayrollForEmployee = async (employeeId, transaction) => Payroll.findOne({
    where: { employee_id: employeeId },
    order: [['payment_date', 'DESC'], ['payroll_id', 'DESC']],
    transaction
});

const ensurePayrollForEmployee = async (employeeId, fallbackDate, transaction) => {
    let payroll = await getLatestPayrollForEmployee(employeeId, transaction);
    if (!payroll) {
        payroll = await Payroll.create({
            employee_id: employeeId,
            basic_salary: 0,
            allowances: 0,
            deductions: 0,
            net_salary: 0,
            payment_date: fallbackDate || new Date().toISOString().split('T')[0]
        }, { transaction });
    }
    return payroll;
};

const applyPrePaymentToPayroll = async (record, direction, transaction) => {
    const payroll = await ensurePayrollForEmployee(record.employee_id, record.date, transaction);
    const amount = toAmount(record.amount);
    const currentAllowances = toAmount(payroll.allowances);
    const currentDeductions = toAmount(payroll.deductions);

    let nextAllowances = currentAllowances;
    let nextDeductions = currentDeductions;

    if (record.payment_type === 'Advance') {
        nextDeductions = Math.max(0, currentDeductions + (direction * amount));
    } else {
        nextAllowances = Math.max(0, currentAllowances + (direction * amount));
    }

    await payroll.update({
        allowances: nextAllowances,
        deductions: nextDeductions,
        net_salary: calculateNetSalary(payroll.basic_salary, nextAllowances, nextDeductions)
    }, { transaction });
};

const applyIncrementPromotionToPayroll = async (record, direction, transaction) => {
    const employee = await Employee.findByPk(record.employee_id, { transaction });
    if (!employee) {
        throw new Error('Employee not found');
    }

    const payroll = await ensurePayrollForEmployee(record.employee_id, record.effective_date, transaction);
    const targetSalary = direction === 1 ? toAmount(record.new_salary) : toAmount(record.current_salary);
    const targetDesignation = direction === 1
        ? (record.new_designation || employee.designation)
        : (record.designation || record.current_role || employee.designation);

    await payroll.update({
        basic_salary: targetSalary,
        net_salary: calculateNetSalary(targetSalary, payroll.allowances, payroll.deductions),
        payment_date: payroll.payment_date || record.effective_date || null
    }, { transaction });

    if (record.change_type === 'Promotion' && targetDesignation) {
        await employee.update({ designation: targetDesignation }, { transaction });
    }
};

const sendPayrollStatusNotification = async (payroll, status, senderEmail) => {
    if (!payroll?.Employee?.email || !['Approved', 'Rejected'].includes(status)) {
        return;
    }

    const message = `Your payroll for ${payroll.payment_date || 'the selected period'} has been ${status.toLowerCase()}.`;

    await Notification.create({
        userId: payroll.Employee.email.toLowerCase(),
        role: 'employee',
        message,
        type: 'PayrollStatus',
        senderRole: 'manager',
        senderEmail,
        isRead: false
    });

    if (global.globalNotificationService) {
        await global.globalNotificationService.sendGlobalNotification({
            senderRole: 'manager',
            senderEmail,
            recipientEmails: [payroll.Employee.email],
            recipientRole: 'employee',
            message,
            type: 'payroll_status_update'
        });
    }
};

const OFFBOARDING_CATEGORIES = ['Warning', 'Resignation', 'Complaint'];
const OFFBOARDING_STATUSES = ['Pending', 'In Progress', 'Completed'];

const normalizeOffboardingCategory = (category, fallback = 'Resignation') => {
    const match = OFFBOARDING_CATEGORIES.find(c => c.toLowerCase() === String(category || '').toLowerCase());
    return match || fallback;
};

const normalizeOffboardingStatus = (status, fallback = 'Pending') => {
    const match = OFFBOARDING_STATUSES.find(s => s.toLowerCase() === String(status || '').toLowerCase());
    return match || fallback;
};

// DASHBOARD
exports.getDashboardStats = async (req, res) => {
    try {
        console.log(`[API TRACE] getDashboardStats triggered by ${req.user.email}`);
        const today = new Date().toISOString().split('T')[0];
        const employees = await Employee.findAll({ attributes: ['employee_id', 'status', 'email'] });
        console.log(`[API TRACE] Found ${employees.length} employees for dashboard stats.`);
        
        const totalEmployeesCount = employees.length;
        const activeEmployeesCount = employees.filter(e => e.status === 'Active').length;
        
        // 2. Attendance Stats
        const todaysAttendance = await Attendance.count({ 
            where: { date: today },
            distinct: true,
            col: 'employee_id'
        });

        // 3. Leave Stats
        const totalLeaveRequests = await Leave.count();
        const pendingLeaves = await Leave.count({ where: { status: 'Pending' } });
        const approvedLeaves = await Leave.count({ where: { status: 'Approved' } });
        const rejectedLeaves = await Leave.count({ where: { status: 'Rejected' } });

        // Count employees on approved leave TODAY
        const onLeaveToday = await Leave.count({
            where: {
                status: 'Approved',
                start_date: { [Op.lte]: today },
                end_date: { [Op.gte]: today }
            },
            distinct: true,
            col: 'employee_id'
        });

        const recentLeaves = await Leave.findAll({ include: [Employee], limit: 3, order: [['leave_id', 'DESC']] });

        res.status(200).json({
            success: true,
            data: {
                totalEmployees: totalEmployeesCount,
                activeEmployees: activeEmployeesCount,
                todaysAttendance,
                onLeaveToday,
                totalLeaveRequests,
                pendingLeaves,
                approvedLeaves,
                rejectedLeaves,
                recentActivities: recentLeaves
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// EMPLOYEES
exports.getEmployees = async (req, res) => {
    try {
        const fullList = await Employee.findAll({
            attributes: ['employee_id', 'employee_name', 'email', 'role', 'status', 'department', 'designation', 'joining_date', 'work_mode', 'location']
        });
        console.log(`[API] Found ${fullList.length} employees in database.`);
        res.status(200).json({ success: true, count: fullList.length, data: fullList });
    } catch (err) {
        console.error('[API ERROR] Failed to fetch employees:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.createEmployee = async (req, res) => {
        console.log('[API DEBUG] createEmployee triggered');
    try {
        const data = { ...req.body };
        if (!data.role) data.role = 'Employee';
        // Manager-created employee accounts use a default password unless explicitly provided.
        if (!data.password || !String(data.password).trim()) {
            data.password = DEFAULT_EMPLOYEE_PASSWORD;
        }

        if (req.user && req.user.role === 'Manager' && !data.manager_id) {
            let mgrEmp = await Employee.findOne({ where: { email: req.user.email } });
            if (!mgrEmp) {
                mgrEmp = await Employee.create({
                    employee_name: req.user.name || 'Manager',
                    email: req.user.email,
                    role: 'Employee',
                    designation: 'Manager',
                    department: 'Management',
                    joining_date: new Date()
                });
            }
            data.manager_id = mgrEmp.employee_id;
        }

        const plainPassword = data.password;
        const emp = await Employee.create(data);

        // NOTIFY
        const welcomeMsg = `Welcome to the team, ${emp.employee_name}! Your account is ready.`;
        await Notification.create({
            userId: emp.email.toLowerCase(),
            role: 'employee',
            message: welcomeMsg,
            type: 'Welcome',
            senderRole: 'manager',
            senderId: req.user.email
        });

        if (global.globalNotificationService) {
            global.globalNotificationService.sendGlobalNotification({ senderRole: 'manager', senderEmail: req.user.email, recipientEmails: [emp.email.toLowerCase()], message: welcomeMsg, type: 'welcome' });
        }

        let emailSent = false;
        let emailError = null;
        try {
            const employeeName = emp.employee_name || data.employee_name || 'Employee';
            const message = `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
                    <div style="background-color: #2563eb; color: white; padding: 20px; text-align: center;">
                        <h1 style="margin: 0;">Welcome to HRM Portal</h1>
                    </div>
                    <div style="padding: 20px;">
                        <p>Hello <strong>${employeeName}</strong>,</p>
                        <p>Your employee account has been created by your manager.</p>
                        <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin: 20px 0;">
                            <p style="margin: 5px 0;"><strong>Login Email:</strong> ${emp.email}</p>
                            <p style="margin: 5px 0;"><strong>Default Password:</strong> ${plainPassword}</p>
                        </div>
                        <p>Please log in and change your password as soon as possible.</p>
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="http://localhost:5173/login" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Login to HRM Portal</a>
                        </div>
                        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                        <p style="font-size: 12px; color: #777;">This is an automated message, please do not reply to this email.</p>
                    </div>
                </div>
            `;

            await sendEmail({
                email: emp.email,
                subject: 'Your HRM Employee Account Credentials',
                html: message,
                text: [
                    'Welcome to HRM Portal',
                    '',
                    `Hello ${employeeName},`,
                    'Your employee account has been created by your manager.',
                    `Login Email: ${emp.email}`,
                    `Default Password: ${plainPassword}`,
                    '',
                    'Please change your password after first login.',
                    'Login URL: http://localhost:5173/login'
                ].join('\n')
            });
            emailSent = true;
        } catch (emailErr) {
            console.error('[Manager] Failed to send employee credentials email:', emailErr.message);
            emailError = emailErr.message;
        }

        res.status(201).json({ success: true, data: emp, defaultPasswordSent: true, emailSent, emailError });
    } catch (err) { console.error('[API ERROR]', err); res.status(400).json({ success: false, error: err.message }); }
};

exports.updateEmployee = async (req, res) => {
        console.log('[API DEBUG] updateEmployee triggered');
    try {
        const emp = await Employee.findByPk(req.params.id);
        if(!emp) return res.status(404).json({ success: false, error: "Not found" });
        await emp.update(req.body);
        res.status(200).json({ success: true, data: emp });
    } catch (err) { console.error('[API ERROR]', err); res.status(400).json({ success: false, error: err.message }); }
};

exports.deleteEmployee = async (req, res) => {
    try {
        const emp = await Employee.findByPk(req.params.id);
        if(!emp) return res.status(404).json({ success: false, error: "Not found" });

        // Manually handle related records to prevent FK constraint violations
        const empId = emp.employee_id;
        await Attendance.destroy({ where: { employee_id: empId } });
        await Leave.destroy({ where: { employee_id: empId } });
        await Payroll.destroy({ where: { employee_id: empId } });
        await Expense.destroy({ where: { employee_id: empId } });
        await PrePayment.destroy({ where: { employee_id: empId } });
        await IncrementPromotion.destroy({ where: { employee_id: empId } });
        await Appreciation.destroy({ where: { employee_id: empId } });
        await Offboarding.destroy({ where: { employee_id: empId } });
        await Payslip.destroy({ where: { employee_id: empId } });
        
        // Unlink from Assets instead of deleting the asset hardware
        await Asset.update({ assigned_employee: null, status: 'Available' }, { where: { assigned_employee: empId } });

        await emp.destroy();
        res.status(200).json({ success: true, message: "Employee and all associated records deleted permanently" });
    } catch (err) { console.error('[API ERROR]', err); res.status(400).json({ success: false, error: err.message }); }
};

// ATTENDANCE
exports.getAttendance = async (req, res) => {
    try {
        const records = await Attendance.findAll({ include: [Employee], order: [['date', 'DESC']] });
        res.status(200).json({ success: true, data: records });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

exports.createAttendance = async (req, res) => {
        console.log('[API DEBUG] createAttendance triggered');
    try {
        const emp = await Employee.findByPk(req.body.employee_id);
        if (!emp) return res.status(400).json({ success: false, error: "Employee not found" });

        const record = await Attendance.create(req.body);
        const rRecord = await Attendance.findByPk(record.attendance_id, { include: [Employee] });
        res.status(201).json({ success: true, data: rRecord });
    } catch (err) { console.error('[API ERROR]', err); res.status(400).json({ success: false, error: err.message }); }
};

exports.updateAttendance = async (req, res) => {
        console.log('[API DEBUG] updateAttendance triggered');
    try {
        const att = await Attendance.findByPk(req.params.id);
        if(!att) return res.status(404).json({ success: false, error: "Not found" });
        await att.update(req.body);
        const rAtt = await Attendance.findByPk(att.attendance_id, { include: [Employee] });
        res.status(200).json({ success: true, data: rAtt });
    } catch (err) { console.error('[API ERROR]', err); res.status(400).json({ success: false, error: err.message }); }
};

exports.deleteAttendance = async (req, res) => {
    try {
        const att = await Attendance.findByPk(req.params.id);
        if(!att) return res.status(404).json({ success: false, error: "Not found" });
        await att.destroy();
        res.status(200).json({ success: true, message: "Record deleted" });
    } catch (err) { console.error('[API ERROR]', err); res.status(400).json({ success: false, error: err.message }); }
};

// LEAVES
exports.getLeaves = async (req, res) => {
    try {
        const records = await Leave.findAll({ include: [Employee], order: [['leave_id', 'DESC']] });
        res.status(200).json({ success: true, data: records });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

exports.updateLeave = async (req, res) => {
        console.log('[API DEBUG] updateLeave triggered');
    try {
        const leave = await Leave.findByPk(req.params.id, { include: [Employee] });
        if(!leave) return res.status(404).json({ success: false, error: "Not found" });
        
        const oldStatus = leave.status;
        await leave.update(req.body);
        const rLeave = await Leave.findByPk(leave.leave_id, { include: [Employee] });

        // NOTIFY EMPLOYEE IF STATUS CHANGED
        if (req.body.status && req.body.status !== oldStatus) {
            const emp = rLeave.Employee;
            if (emp && emp.email) {
                const message = `Your leave application (${rLeave.leave_type}) has been ${req.body.status}.`;
                
                await Notification.create({
                    userId: emp.email.toLowerCase(),
                    role: 'employee',
                    message,
                    type: 'LeaveStatus',
                    senderRole: 'manager',
                    senderEmail: req.user.email
                });

                if (global.globalNotificationService) {
                    await global.globalNotificationService.sendGlobalNotification({
                        senderRole: 'manager',
                        senderEmail: req.user.email,
                        recipientEmails: [emp.email],
                        message,
                        type: 'leave_status'
                    });
                }
            }
        }

        res.status(200).json({ success: true, data: rLeave });
    } catch (err) { console.error('[API ERROR]', err); res.status(400).json({ success: false, error: err.message }); }
};

exports.deleteLeave = async (req, res) => {
    try {
        const leave = await Leave.findByPk(req.params.id);
        if(!leave) return res.status(404).json({ success: false, error: "Not found" });
        await leave.destroy();
        res.status(200).json({ success: true, message: "Record deleted" });
    } catch (err) { console.error('[API ERROR]', err); res.status(400).json({ success: false, error: err.message }); }
};

// ASSETS
exports.getAssets = async (req, res) => {
    try {
        const assets = await Asset.findAll({ include: [Employee] });
        res.status(200).json({ success: true, data: assets });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

exports.createAsset = async (req, res) => {
        console.log('[API DEBUG] createAsset triggered');
    try {
        let emp = null;
        if (req.body.assigned_employee) {
            emp = await Employee.findByPk(req.body.assigned_employee);
            if (!emp) return res.status(400).json({ success: false, error: "Assigned employee not found" });
        }
        const asset = await Asset.create(req.body);
        const rAsset = await Asset.findByPk(asset.asset_id, { include: [Employee] });

        // NOTIFY
        if (emp) {
            const message = `A new asset has been assigned to you: ${rAsset.asset_name} (${rAsset.asset_type})`;
            await Notification.create({
                userId: emp.email.toLowerCase(),
                role: 'employee',
                message,
                type: 'AssetAssignment',
                senderRole: 'manager',
                senderEmail: req.user.email
            });

            if (global.globalNotificationService) {
                await global.globalNotificationService.sendGlobalNotification({
                    senderRole: 'manager',
                    senderEmail: req.user.email,
                    recipientEmails: [emp.email],
                    message,
                    type: 'asset_assignment'
                });
            }
        }

        res.status(201).json({ success: true, data: rAsset });
    } catch (err) { console.error('[API ERROR]', err); res.status(400).json({ success: false, error: err.message }); }
};

exports.updateAsset = async (req, res) => {
        console.log('[API DEBUG] updateAsset triggered');
    try {
        const asset = await Asset.findByPk(req.params.id);
        if(!asset) return res.status(404).json({ success: false, error: "Not found" });
        
        const oldAssigned = asset.assigned_employee;
        await asset.update(req.body);
        const rAsset = await Asset.findByPk(asset.asset_id, { include: [Employee] });

        // IF ASSIGNMENT CHANGED OR NEWLY ASSIGNED
        if (rAsset.assigned_employee && rAsset.assigned_employee !== oldAssigned) {
            const emp = rAsset.Employee;
            if (emp) {
                const message = `An asset has been updated/assigned to you: ${rAsset.asset_name}`;
                await Notification.create({
                    userId: emp.email.toLowerCase(),
                    role: 'employee',
                    message,
                    type: 'AssetAssignment',
                    senderRole: 'manager',
                    senderEmail: req.user.email
                });

                if (global.globalNotificationService) {
                    await global.globalNotificationService.sendGlobalNotification({
                        senderRole: 'manager',
                        senderEmail: req.user.email,
                        recipientEmails: [emp.email],
                        message,
                        type: 'asset_assignment'
                    });
                }
            }
        }

        res.status(200).json({ success: true, data: rAsset });
    } catch (err) { console.error('[API ERROR]', err); res.status(400).json({ success: false, error: err.message }); }
};

exports.deleteAsset = async (req, res) => {
    try {
        const asset = await Asset.findByPk(req.params.id);
        if(!asset) return res.status(404).json({ success: false, error: "Not found" });
        await asset.destroy();
        res.status(200).json({ success: true, message: "Record deleted" });
    } catch (err) { console.error('[API ERROR]', err); res.status(400).json({ success: false, error: err.message }); }
};

// PAYROLL
exports.getPayrolls = async (req, res) => {
    try {
        const payrolls = await Payroll.findAll({ include: [Employee], order: [['payment_date', 'DESC'], ['payroll_id', 'DESC']] });
        res.status(200).json({ success: true, data: payrolls });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

exports.createPayroll = async (req, res) => {
        console.log('[API DEBUG] createPayroll triggered');
    try {
        const emp = await Employee.findByPk(req.body.employee_id);
        if (!emp) return res.status(400).json({ success: false, error: "Employee not found" });

        const payload = {
            ...req.body,
            basic_salary: toAmount(req.body.basic_salary),
            allowances: toAmount(req.body.allowances),
            deductions: toAmount(req.body.deductions),
            status: req.body.status || 'Pending',
        };
        payload.net_salary = calculateNetSalary(payload.basic_salary, payload.allowances, payload.deductions);

        const p = await Payroll.create(payload);
        const rp = await Payroll.findByPk(p.payroll_id, { include: [Employee] });

        // NOTIFY
        if (rp.Employee) {
            const message = `Your payroll record for ${rp.payment_date || 'this month'} has been created.`;
            await Notification.create({
                userId: rp.Employee.email.toLowerCase(),
                role: 'employee',
                message,
                type: 'Payroll',
                senderRole: 'manager',
                senderEmail: req.user.email
            });

            if (global.globalNotificationService) {
                await global.globalNotificationService.sendGlobalNotification({
                    senderRole: 'manager',
                    senderEmail: req.user.email,
                    recipientEmails: [rp.Employee.email],
                    message,
                    type: 'payroll'
                });
            }
        }

        res.status(201).json({ success: true, data: rp });
    } catch (err) { console.error('[API ERROR]', err); res.status(400).json({ success: false, error: err.message }); }
};

exports.updatePayroll = async (req, res) => {
        console.log('[API DEBUG] updatePayroll triggered');
    try {
        const p = await Payroll.findByPk(req.params.id);
        if(!p) return res.status(404).json({ success: false, error: "Not found" });

        const payload = {
            ...req.body,
            basic_salary: req.body.basic_salary !== undefined ? toAmount(req.body.basic_salary) : toAmount(p.basic_salary),
            allowances: req.body.allowances !== undefined ? toAmount(req.body.allowances) : toAmount(p.allowances),
            deductions: req.body.deductions !== undefined ? toAmount(req.body.deductions) : toAmount(p.deductions),
        };
        payload.net_salary = calculateNetSalary(payload.basic_salary, payload.allowances, payload.deductions);

        const previousStatus = p.status;
        await p.update(payload);
        const rp = await Payroll.findByPk(p.payroll_id, { include: [Employee] });

        // NOTIFY
        if (rp.Employee) {
            const message = `Your payroll record has been updated.`;
            await Notification.create({
                userId: rp.Employee.email.toLowerCase(),
                role: 'employee',
                message,
                type: 'Payroll',
                senderRole: 'manager',
                senderEmail: req.user.email
            });

            if (global.globalNotificationService) {
                await global.globalNotificationService.sendGlobalNotification({
                    senderRole: 'manager',
                    senderEmail: req.user.email,
                    recipientEmails: [rp.Employee.email],
                    message,
                    type: 'payroll'
                });
            }
        }

        res.status(200).json({ success: true, data: rp });
    } catch (err) { console.error('[API ERROR]', err); res.status(400).json({ success: false, error: err.message }); }
};

exports.deletePayroll = async (req, res) => {
    try {
        const p = await Payroll.findByPk(req.params.id);
        if(!p) return res.status(404).json({ success: false, error: "Not found" });
        await p.destroy();
        res.status(200).json({ success: true, message: "Record deleted" });
    } catch (err) { console.error('[API ERROR]', err); res.status(400).json({ success: false, error: err.message }); }
};

exports.generatePayslip = async (req, res) => {
    try {
        const payroll = await Payroll.findByPk(req.params.id, { include: [Employee] });
        if(!payroll) return res.status(404).json({ success: false, error: "Payroll record not found" });
        if (payroll.status !== 'Approved') {
            return res.status(400).json({ success: false, error: "Only approved payroll records can generate payslips" });
        }

        const ps = await Payslip.create({
            employee_id: payroll.employee_id,
            payroll_id: payroll.payroll_id,
            basic_salary: payroll.basic_salary,
            allowances: payroll.allowances,
            deductions: payroll.deductions,
            net_salary: payroll.net_salary,
            payment_date: payroll.payment_date || new Date()
        });

        // NOTIFY
        if (payroll.Employee) {
            const message = `A new payslip has been generated for you for the date ${ps.payment_date}.`;
            await Notification.create({
                userId: payroll.Employee.email.toLowerCase(),
                role: 'employee',
                message,
                type: 'Payslip',
                senderRole: 'manager',
                senderEmail: req.user.email
            });

            if (global.globalNotificationService) {
                await global.globalNotificationService.sendGlobalNotification({
                    senderRole: 'manager',
                    senderEmail: req.user.email,
                    recipientEmails: [payroll.Employee.email],
                    message,
                    type: 'payslip'
                });
            }
        }

        res.status(201).json({ success: true, data: ps, message: "Payslip generated and saved" });
    } catch (err) { console.error('[API ERROR]', err); res.status(400).json({ success: false, error: err.message }); }
};

// APPRECIATIONS
exports.getAppreciations = async (req, res) => {
    try {
        const list = await Appreciation.findAll({ 
            include: [
                { model: Employee, as: 'Recipient', attributes: ['employee_id', 'employee_name', 'designation'] },
                { model: Employee, as: 'Sender', attributes: ['employee_id', 'employee_name', 'designation'] },
                { model: AppreciationComment, attributes: ['comment_id', 'commenter_name', 'content', 'created_at'] }
            ],
            order: [['date', 'DESC']]
        });
        res.status(200).json({ success: true, data: list });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

exports.createAppreciation = async (req, res) => {
        console.log('[API DEBUG] createAppreciation triggered');
    try {
        const { employee_id, title, description } = req.body;
        // If the sender is a Manager (SuperAdmin), they don't have an employee_id.
        // We set sender_id to null to avoid ID collisions with the Employee table.
        const sender_id = req.user.employee_id || null;

        const app = await Appreciation.create({
            employee_id,
            sender_id,
            title,
            description,
            date: new Date()
        });

        // NOTIFY RECIPIENT
        const emp = await Employee.findByPk(employee_id);
        if (emp && emp.email) {
            const message = `Manager ${req.user.employee_name} sent you a "${title}" badge!`;
            
            // Create in-app notification
            await Notification.create({
                userId: emp.email.toLowerCase(),
                role: 'employee',
                message,
                type: 'Appreciation',
                senderRole: 'manager',
                senderEmail: req.user.email
            });

            // Trigger Real-time notification
            if (global.globalNotificationService) {
                await global.globalNotificationService.sendGlobalNotification({
                    senderRole: 'manager',
                    senderEmail: req.user.email,
                    recipientEmails: [emp.email],
                    message,
                    type: 'appreciation'
                });
            }
        }

        const rapp = await Appreciation.findByPk(app.appreciation_id, { include: [Employee] });
        res.status(201).json({ success: true, data: rapp });
    } catch (err) { console.error('[API ERROR]', err); res.status(400).json({ success: false, error: err.message }); }
};

exports.updateAppreciation = async (req, res) => {
        console.log('[API DEBUG] updateAppreciation triggered');
    try {
        const app = await Appreciation.findByPk(req.params.id);
        if(!app) return res.status(404).json({ success: false, error: "Not found" });
        await app.update(req.body);
        const rapp = await Appreciation.findByPk(app.appreciation_id, { include: [Employee] });
        res.status(200).json({ success: true, data: rapp });
    } catch (err) { console.error('[API ERROR]', err); res.status(400).json({ success: false, error: err.message }); }
};

exports.deleteAppreciation = async (req, res) => {
    try {
        const app = await Appreciation.findByPk(req.params.id);
        if(!app) return res.status(404).json({ success: false, error: "Not found" });
        await app.destroy();
        res.status(200).json({ success: true, message: "Record deleted" });
    } catch (err) { console.error('[API ERROR]', err); res.status(400).json({ success: false, error: err.message }); }
};

// COMPANY POLICIES
exports.getPolicies = async (req, res) => {
    try {
        const policies = await CompanyPolicy.findAll();
        res.status(200).json({ success: true, data: policies });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

exports.createPolicy = async (req, res) => {
        console.log('[API DEBUG] createPolicy triggered');
    try {
        const data = { ...req.body };
        if (req.file) {
            data.file_url = `/uploads/policies/${req.file.filename}`;
        } else if (req.body.external_url) {
            data.file_url = req.body.external_url;
        }
        const p = await CompanyPolicy.create(data);

        // BROADCAST NOTIFY ALL EMPLOYEES
        try {
            const employees = await Employee.findAll({ where: { status: 'Active' }, attributes: ['email'] });
            const emails = employees.map(e => e.email.toLowerCase());
            const message = `A new company policy has been uploaded: ${p.title}`;

            // Persistent notifications
            const notifData = employees.map(e => ({
                userId: e.email.toLowerCase(),
                role: 'employee',
                message,
                type: 'Policy',
                senderRole: 'manager',
                senderEmail: req.user.email
            }));
            await Notification.bulkCreate(notifData);

            // Real-time broadcast
            if (global.globalNotificationService) {
                await global.globalNotificationService.sendGlobalNotification({
                    senderRole: 'manager',
                    senderEmail: req.user.email,
                    recipientEmails: emails,
                    message,
                    type: 'policy_upload'
                });
            }
        } catch (err) { console.error("Broadcast failed:", err); }

        res.status(201).json({ success: true, data: p });
    } catch (err) { console.error('[API ERROR]', err); res.status(400).json({ success: false, error: err.message }); }
};

exports.updatePolicy = async (req, res) => {
        console.log('[API DEBUG] updatePolicy triggered');
    try {
        const p = await CompanyPolicy.findByPk(req.params.id);
        if(!p) return res.status(404).json({ success: false, error: "Not found" });
        const data = { ...req.body };
        if (req.file) {
            data.file_url = `/uploads/policies/${req.file.filename}`;
        }
        await p.update(data);
        res.status(200).json({ success: true, data: p });
    } catch (err) { console.error('[API ERROR]', err); res.status(400).json({ success: false, error: err.message }); }
};

exports.deletePolicy = async (req, res) => {
    try {
        const p = await CompanyPolicy.findByPk(req.params.id);
        if(!p) return res.status(404).json({ success: false, error: "Not found" });
        await p.destroy();
        res.status(200).json({ success: true, message: "Record deleted" });
    } catch (err) { console.error('[API ERROR]', err); res.status(400).json({ success: false, error: err.message }); }
};

// OFFBOARDINGS
exports.getOffboardings = async (req, res) => {
    try {
        const obs = await Offboarding.findAll({ include: [Employee], order: [['created_at', 'DESC']] });
        res.status(200).json({ success: true, data: obs });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

exports.createOffboarding = async (req, res) => {
        console.log('[API DEBUG] createOffboarding triggered');
    try {
        const emp = await Employee.findByPk(req.body.employee_id);
        if (!emp) return res.status(400).json({ success: false, error: "Employee not found" });

        const category = normalizeOffboardingCategory(req.body.category, 'Resignation');
        if (category === 'Complaint') {
            return res.status(400).json({ success: false, error: "Complaints can only be raised by employees." });
        }

        const reason = String(req.body.reason || '').trim();
        if (!reason) {
            return res.status(400).json({ success: false, error: "Reason is required." });
        }

        const payload = {
            employee_id: emp.employee_id,
            category,
            raised_by: 'Manager',
            reason
        };

        if (category === 'Resignation') {
            if (!req.body.last_working_date) {
                return res.status(400).json({ success: false, error: "Last working date is required for resignation." });
            }
            payload.last_working_date = req.body.last_working_date;
            payload.status = normalizeOffboardingStatus(req.body.status, 'Pending');
        } else {
            payload.last_working_date = null;
            payload.status = normalizeOffboardingStatus(req.body.status, 'Completed');
        }

        const o = await Offboarding.create(payload);
        const ro = await Offboarding.findByPk(o.offboarding_id, { include: [Employee] });
        res.status(201).json({ success: true, data: ro });
    } catch (err) { console.error('[API ERROR]', err); res.status(400).json({ success: false, error: err.message }); }
};

exports.deleteOffboarding = async (req, res) => {
    try {
        const o = await Offboarding.findByPk(req.params.id);
        if(!o) return res.status(404).json({ success: false, error: "Not found" });
        await o.destroy();
        res.status(200).json({ success: true, message: "Record deleted" });
    } catch (err) { console.error('[API ERROR]', err); res.status(400).json({ success: false, error: err.message }); }
};

exports.updateOffboarding = async (req, res) => {
        console.log('[API DEBUG] updateOffboarding triggered');
    try {
        const o = await Offboarding.findByPk(req.params.id);
        if(!o) return res.status(404).json({ success: false, error: "Not found" });

        const oldStatus = o.status;

        const data = {};
        if (req.body.reason !== undefined) {
            const reason = String(req.body.reason || '').trim();
            if (!reason) return res.status(400).json({ success: false, error: "Reason cannot be empty." });
            data.reason = reason;
        }

        if (req.body.status !== undefined) {
            const normalizedStatus = normalizeOffboardingStatus(req.body.status, null);
            if (!normalizedStatus) {
                return res.status(400).json({ success: false, error: "Invalid status value." });
            }
            data.status = normalizedStatus;
        }

        if ((o.category || 'Resignation') === 'Resignation') {
            if (req.body.last_working_date !== undefined) {
                if (!req.body.last_working_date) {
                    return res.status(400).json({ success: false, error: "Last working date is required for resignation." });
                }
                data.last_working_date = req.body.last_working_date;
            }
        } else if (req.body.last_working_date !== undefined) {
            data.last_working_date = null;
        }

        await o.update(data);
        const ro = await Offboarding.findByPk(o.offboarding_id, { include: [Employee] });

        // NOTIFY STATUS CHANGE
        if (ro.status && ro.status !== oldStatus) {
            const emp = ro.Employee;
            if (emp) {
                const message = `Your offboarding/resignation status has been updated to: ${ro.status}`;
                await Notification.create({
                    userId: emp.email.toLowerCase(),
                    role: 'employee',
                    message,
                    type: 'Offboarding',
                    senderRole: 'manager',
                    senderEmail: req.user.email
                });

                if (global.globalNotificationService) {
                    await global.globalNotificationService.sendGlobalNotification({
                        senderRole: 'manager',
                        senderEmail: req.user.email,
                        recipientEmails: [emp.email],
                        message,
                        type: 'offboarding_status'
                    });
                }
            }
        }

        res.status(200).json({ success: true, data: ro });
    } catch (err) { console.error('[API ERROR]', err); res.status(400).json({ success: false, error: err.message }); }
};

// FINANCE / EXPENSES
exports.getExpenses = async (req, res) => {
    try {
        const exps = await Expense.findAll({ include: [Employee] });
        res.status(200).json({ success: true, data: exps });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

exports.createExpense = async (req, res) => {
        console.log('[API DEBUG] createExpense triggered');
    try {
        const emp = await Employee.findByPk(req.body.employee_id);
        if (!emp) return res.status(400).json({ success: false, error: "Employee not found" });

        const ex = await Expense.create(req.body);
        const rex = await Expense.findByPk(ex.expense_id, { include: [Employee] });
        res.status(201).json({ success: true, data: rex });
    } catch (err) { console.error('[API ERROR]', err); res.status(400).json({ success: false, error: err.message }); }
};

exports.updateExpense = async (req, res) => {
        console.log('[API DEBUG] updateExpense triggered');
    try {
        const ex = await Expense.findByPk(req.params.id);
        if(!ex) return res.status(404).json({ success: false, error: "Not found" });
        await ex.update(req.body);
        const rex = await Expense.findByPk(ex.expense_id, { include: [Employee] });
        
        // Notify Employee via Global Service (Real-time)
        if (req.body.status && (req.body.status === 'Approved' || req.body.status === 'Rejected')) {
            if (rex.Employee && rex.Employee.email && global.globalNotificationService) {
                await global.globalNotificationService.sendGlobalNotification({
                    senderRole: 'manager',
                    senderEmail: req.user.email,
                    recipientEmails: [rex.Employee.email.toLowerCase()],
                    message: `Your expense claim for "${rex.title}" has been ${req.body.status}.`,
                    type: 'expense_status_update'
                });
            }
        }
        
        res.status(200).json({ success: true, data: rex });
    } catch (err) { console.error('[API ERROR]', err); res.status(400).json({ success: false, error: err.message }); }
};

exports.deleteExpense = async (req, res) => {
    try {
        const ex = await Expense.findByPk(req.params.id);
        if(!ex) return res.status(404).json({ success: false, error: "Not found" });
        await ex.destroy();
        res.status(200).json({ success: true, message: "Record deleted" });
    } catch (err) { console.error('[API ERROR]', err); res.status(400).json({ success: false, error: err.message }); }
};

// PRE PAYMENTS
exports.getPrePayments = async (req, res) => {
    try {
        const records = await PrePayment.findAll({ include: [Employee], order: [['created_at', 'DESC']] });
        res.status(200).json({ success: true, data: records });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

exports.createPrePayment = async (req, res) => {
        console.log('[API DEBUG] createPrePayment triggered');
    try {
        const emp = await Employee.findByPk(req.body.employee_id);
        if (!emp) return res.status(400).json({ success: false, error: "Employee not found" });

        const payload = {
            ...req.body,
            status: 'Pending'
        };
        const record = await PrePayment.create(payload);
        const result = await PrePayment.findByPk(record.id, { include: [Employee] });
        res.status(201).json({ success: true, data: result });
    } catch (err) {
        console.error('[API ERROR] createPrePayment failed:', err);
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.updatePrePayment = async (req, res) => {
        console.log('[API DEBUG] updatePrePayment triggered');
    try {
        const result = await sequelize.transaction(async (transaction) => {
            const record = await PrePayment.findByPk(req.params.id, { transaction });
            if (!record) return null;

            const previousRecord = record.get({ plain: true });
            const nextStatus = req.body.status || record.status;

            if (previousRecord.status === 'Approved') {
                await applyPrePaymentToPayroll(previousRecord, -1, transaction);
            }

            await record.update(req.body, { transaction });

            if (nextStatus === 'Approved') {
                await applyPrePaymentToPayroll(record, 1, transaction);
            }

            return PrePayment.findByPk(record.id, { include: [Employee], transaction });
        });

        if (!result) return res.status(404).json({ success: false, error: "Not found" });
        res.status(200).json({ success: true, data: result });
    } catch (err) { console.error('[API ERROR]', err); res.status(400).json({ success: false, error: err.message }); }
};

exports.updatePrePaymentStatus = async (req, res) => {
        console.log('[API DEBUG] updatePrePaymentStatus triggered');
    try {
        const { status } = req.body;
        if (!['Pending', 'Approved', 'Rejected'].includes(status)) {
            return res.status(400).json({ success: false, error: "Invalid status" });
        }

        const updateOutcome = await sequelize.transaction(async (transaction) => {
            const record = await PrePayment.findByPk(req.params.id, { transaction });
            if (!record) return null;

            const previousStatus = record.status;
            const payload = { status };
            if (status === 'Approved' || status === 'Rejected') {
                payload.approved_by = req.user.name || req.user.email || 'Manager';
                payload.approval_date = new Date();
            } else {
                payload.approved_by = null;
                payload.approval_date = null;
            }

            if (previousStatus !== 'Approved' && status === 'Approved') {
                await applyPrePaymentToPayroll(record, 1, transaction);
            } else if (previousStatus === 'Approved' && status !== 'Approved') {
                await applyPrePaymentToPayroll(record, -1, transaction);
            }

            await record.update(payload, { transaction });
            const updatedRecord = await PrePayment.findByPk(record.id, { include: [Employee], transaction });
            return {
                previousStatus,
                record: updatedRecord
            };
        });

        if (!updateOutcome) return res.status(404).json({ success: false, error: "Not found" });

        const { previousStatus, record: result } = updateOutcome;

        if (
            previousStatus !== status &&
            (status === 'Approved' || status === 'Rejected') &&
            result?.Employee?.email
        ) {
            const amountText = toAmount(result.amount).toFixed(2);
            const message = `Your pre payment request of Rs. ${amountText} has been ${status.toLowerCase()}.`;

            await Notification.create({
                userId: result.Employee.email.toLowerCase(),
                role: 'employee',
                message,
                type: 'PrePaymentStatus',
                senderRole: 'manager',
                senderEmail: req.user.email,
                isRead: false
            });

            if (global.globalNotificationService) {
                await global.globalNotificationService.sendGlobalNotification({
                    senderRole: 'manager',
                    senderEmail: req.user.email,
                    recipientEmails: [result.Employee.email],
                    recipientRole: 'employee',
                    message,
                    type: 'prepayment_status_update'
                });
            }
        }

        res.status(200).json({ success: true, data: result });
    } catch (err) { console.error('[API ERROR]', err); res.status(400).json({ success: false, error: err.message }); }
};

exports.deletePrePayment = async (req, res) => {
    try {
        const record = await PrePayment.findByPk(req.params.id);
        if (!record) return res.status(404).json({ success: false, error: "Not found" });
        await record.destroy();
        res.status(200).json({ success: true, message: "Record deleted" });
    } catch (err) { console.error('[API ERROR]', err); res.status(400).json({ success: false, error: err.message }); }
};

// INCREMENT / PROMOTION
exports.getIncrementPromotions = async (req, res) => {
    try {
        const records = await IncrementPromotion.findAll({ include: [Employee], order: [['created_at', 'DESC']] });
        res.status(200).json({ success: true, data: records });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

exports.createIncrementPromotion = async (req, res) => {
        console.log('[API DEBUG] createIncrementPromotion triggered');
    try {
        const emp = await Employee.findByPk(req.body.employee_id);
        if (!emp) return res.status(400).json({ success: false, error: "Employee not found" });

        const currentSalary = parseFloat(req.body.current_salary || 0);
        const newSalary = parseFloat(req.body.new_salary || 0);
        if (!Number.isNaN(currentSalary) && !Number.isNaN(newSalary) && newSalary <= currentSalary) {
            return res.status(400).json({ success: false, error: "New salary must be greater than current salary" });
        }

        if (req.body.change_type === 'Promotion' && !String(req.body.new_designation || '').trim()) {
            return res.status(400).json({ success: false, error: "New designation is required for promotion" });
        }

        const payload = {
            ...req.body,
            department: req.body.department || emp.department,
            designation: req.body.designation || emp.designation,
            current_role: req.body.current_role || emp.designation,
            joining_date: req.body.joining_date || emp.joining_date,
            status: req.body.status || 'Pending'
        };

        const record = await IncrementPromotion.create(payload);
        const result = await IncrementPromotion.findByPk(record.increment_promotion_id, { include: [Employee] });
        res.status(201).json({ success: true, data: result });
    } catch (err) { console.error('[API ERROR]', err); res.status(400).json({ success: false, error: err.message }); }
};

exports.updateIncrementPromotion = async (req, res) => {
        console.log('[API DEBUG] updateIncrementPromotion triggered');
    try {
        const result = await sequelize.transaction(async (transaction) => {
            const record = await IncrementPromotion.findByPk(req.params.id, { transaction });
            if (!record) return null;

            const previousRecord = record.get({ plain: true });
            const payload = { ...req.body };
            const effectiveType = payload.change_type || record.change_type;
            const effectiveCurrentSalary = parseFloat(payload.current_salary ?? record.current_salary ?? 0);
            const effectiveNewSalary = parseFloat(payload.new_salary ?? record.new_salary ?? 0);

            if (!Number.isNaN(effectiveCurrentSalary) && !Number.isNaN(effectiveNewSalary) && effectiveNewSalary <= effectiveCurrentSalary) {
                throw new Error("New salary must be greater than current salary");
            }

            const effectiveDesignation = String(payload.new_designation ?? record.new_designation ?? '').trim();
            if (effectiveType === 'Promotion' && !effectiveDesignation) {
                throw new Error("New designation is required for promotion");
            }

            if (payload.status && (payload.status === 'Approved' || payload.status === 'Rejected')) {
                payload.approved_by = req.user.name || req.user.email || 'Manager';
                payload.approval_date = new Date();
            }
            if (payload.status === 'Pending') {
                payload.approved_by = null;
                payload.approval_date = null;
            }

            if (previousRecord.status === 'Approved') {
                await applyIncrementPromotionToPayroll(previousRecord, -1, transaction);
            }

            await record.update(payload, { transaction });

            if (record.status === 'Approved') {
                await applyIncrementPromotionToPayroll(record, 1, transaction);
            }

            return IncrementPromotion.findByPk(record.increment_promotion_id, { include: [Employee], transaction });
        });

        if (!result) return res.status(404).json({ success: false, error: "Not found" });
        res.status(200).json({ success: true, data: result });
    } catch (err) { console.error('[API ERROR]', err); res.status(400).json({ success: false, error: err.message }); }
};

exports.updateIncrementPromotionStatus = async (req, res) => {
        console.log('[API DEBUG] updateIncrementPromotionStatus triggered');
    try {
        const { status } = req.body;
        if (!['Pending', 'Approved', 'Rejected'].includes(status)) {
            return res.status(400).json({ success: false, error: "Invalid status" });
        }

        const result = await sequelize.transaction(async (transaction) => {
            const record = await IncrementPromotion.findByPk(req.params.id, { transaction });
            if (!record) return null;

            const previousStatus = record.status;
            const payload = { status };
            if (status === 'Approved' || status === 'Rejected') {
                payload.approved_by = req.user.name || req.user.email || 'Manager';
                payload.approval_date = new Date();
            } else {
                payload.approved_by = null;
                payload.approval_date = null;
            }

            if (previousStatus !== 'Approved' && status === 'Approved') {
                await applyIncrementPromotionToPayroll(record, 1, transaction);
            } else if (previousStatus === 'Approved' && status !== 'Approved') {
                await applyIncrementPromotionToPayroll(record, -1, transaction);
            }

            await record.update(payload, { transaction });
            return IncrementPromotion.findByPk(record.increment_promotion_id, { include: [Employee], transaction });
        });

        if (!result) return res.status(404).json({ success: false, error: "Not found" });
        res.status(200).json({ success: true, data: result });
    } catch (err) { console.error('[API ERROR]', err); res.status(400).json({ success: false, error: err.message }); }
};

exports.deleteIncrementPromotion = async (req, res) => {
    try {
        const record = await IncrementPromotion.findByPk(req.params.id);
        if (!record) return res.status(404).json({ success: false, error: "Not found" });
        await record.destroy();
        res.status(200).json({ success: true, message: "Record deleted" });
    } catch (err) { console.error('[API ERROR]', err); res.status(400).json({ success: false, error: err.message }); }
};

// HOLIDAYS
exports.getHolidays = async (req, res) => {
    try {
        const holis = await Holiday.findAll({ order: [['date', 'ASC']] });
        res.status(200).json({ success: true, data: holis });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

exports.createHoliday = async (req, res) => {
        console.log('[API DEBUG] createHoliday triggered');
    try {
        const h = await Holiday.create(req.body);

        // BROADCAST NOTIFY ALL EMPLOYEES
        try {
            const employees = await Employee.findAll({ where: { status: 'Active' }, attributes: ['email'] });
            const emails = employees.map(e => e.email.toLowerCase());
            const message = `New Holiday Added: ${h.holiday_name} on ${h.date}`;

            // Persistent notifications
            const notifData = employees.map(e => ({
                userId: e.email.toLowerCase(),
                role: 'employee',
                message,
                type: 'Holiday',
                senderRole: 'manager',
                senderEmail: req.user.email
            }));
            await Notification.bulkCreate(notifData);

            // Real-time broadcast
            if (global.globalNotificationService) {
                await global.globalNotificationService.sendGlobalNotification({
                    senderRole: 'manager',
                    senderEmail: req.user.email,
                    recipientEmails: emails,
                    message,
                    type: 'new_holiday'
                });
            }
        } catch (err) { console.error("Holiday broadcast failed:", err); }

        res.status(201).json({ success: true, data: h });
    } catch (err) { console.error('[API ERROR]', err); res.status(400).json({ success: false, error: err.message }); }
};

exports.updateHoliday = async (req, res) => {
        console.log('[API DEBUG] updateHoliday triggered');
    try {
        const h = await Holiday.findByPk(req.params.id);
        if(!h) return res.status(404).json({ success: false, error: "Not found" });
        await h.update(req.body);
        res.status(200).json({ success: true, data: h });
    } catch (err) { console.error('[API ERROR]', err); res.status(400).json({ success: false, error: err.message }); }
};

exports.deleteHoliday = async (req, res) => {
    try {
        const h = await Holiday.findByPk(req.params.id);
        if(!h) return res.status(404).json({ success: false, error: "Not found" });
        await h.destroy();
        res.status(200).json({ success: true, message: "Record deleted" });
    } catch (err) { console.error('[API ERROR]', err); res.status(400).json({ success: false, error: err.message }); }
};

// LETTERS
exports.getManagerLetters = async (req, res) => {
    try {
        // For letters, manager_id always refers to the SuperAdmin record (Managers/Admins)
        let managerId = req.user.id;
        if (!managerId) return res.status(400).json({ success: false, error: "Manager profile not found" });

        const letters = await Letter.findAll({
            where: { manager_id: managerId },
            include: [{ model: Employee, as: 'Recipient' }],
            order: [['created_at', 'DESC']]
        });
        res.status(200).json({ success: true, data: letters });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

exports.sendLetter = async (req, res) => {
    try {
        console.log('--- SEND LETTER REQUEST ---', req.body);
        const { employee_id, title, content } = req.body;
        if (!employee_id || !title || !content) {
            console.warn('Missing fields:', { employee_id, title, content });
            return res.status(400).json({ success: false, error: "Please provide employee, title, and content" });
        }

        // Managers are identified by their email in the Employee table
        // Database enforces manager_id pointing to SuperAdmin table
        const managerId = req.user.id;
        console.log('Using SuperAdmin ID for letter sender:', managerId);


        let targetEmployeeIds = [];
        if (employee_id === 'all') {
            const allEmps = await Employee.findAll({ where: { status: 'Active' } });
            targetEmployeeIds = allEmps.filter(e => {
                const role = (e.role || '').toLowerCase();
                const desig = (e.designation || '').toLowerCase();
                const name = (e.employee_name || '').toLowerCase();
                return !role.includes('manager') && 
                       !role.includes('admin') && 
                       !desig.includes('manager') && 
                       !desig.includes('admin') && 
                       name !== 'hrm manager' &&
                       e.email !== req.user.email; // Don't send to self
            }).map(e => e.employee_id);
        } else {
            targetEmployeeIds = [employee_id];
        }

        if (targetEmployeeIds.length === 0) {
            return res.status(400).json({ success: false, error: "No target employees found." });
        }

        const sentLetters = [];
        for (const targetId of targetEmployeeIds) {
            if (!targetId) continue;
            
            const letter = await Letter.create({
                title,
                content,
                manager_id: managerId,
                employee_id: targetId,
                status: 'Sent'
            });

            const rLetter = await Letter.findByPk(letter.letter_id, {
                include: [{ model: Employee, as: 'Recipient' }]
            });
            
            if (rLetter && rLetter.Recipient && rLetter.Recipient.email) {
                try {
                    await Notification.create({
                        userId: rLetter.Recipient.email.toLowerCase(),
                        role: 'employee',
                        message: `You have received a new letter: ${title}`,
                        type: 'Letter'
                    });

                    // Emit real-time global notification
                    if (global.globalNotificationService) {
                        await global.globalNotificationService.sendGlobalNotification({
                            senderRole: 'manager',
                            senderEmail: req.user.email,
                            message: `Letter Sent: ${title}`,
                            type: 'Letter',
                            recipientEmails: [rLetter.Recipient.email]
                        });
                    }
                } catch (notifErr) {
                    console.error('Non-critical notification error:', notifErr);
                }
            }
            sentLetters.push(rLetter);
        }

        res.status(201).json({ success: true, data: sentLetters[0], all_sent: sentLetters.length });
    } catch (err) { 
        console.error('Critical Letter Save Error:', err);
        res.status(400).json({ success: false, error: err.message }); 
    }
};

exports.updateLetter = async (req, res) => {
        console.log('[API DEBUG] updateLetter triggered');
    try {
        const { title, content } = req.body;
        const letter = await Letter.findByPk(req.params.id, {
            include: [{ model: Employee, as: 'Recipient' }]
        });
        if (!letter) return res.status(404).json({ success: false, error: "Letter not found" });
        
        letter.title = title || letter.title;
        letter.content = content || letter.content;
        await letter.save();

        if (letter.Recipient && letter.Recipient.email) {
            const message = `Your letter "${letter.title}" has been updated by your manager.`;
            await Notification.create({
                userId: letter.Recipient.email.toLowerCase(),
                role: 'employee',
                message,
                type: 'Letter',
                senderRole: 'manager',
                senderEmail: req.user.email
            });

            if (global.globalNotificationService) {
                await global.globalNotificationService.sendGlobalNotification({
                    senderRole: 'manager',
                    senderEmail: req.user.email,
                    recipientEmails: [letter.Recipient.email],
                    message,
                    type: 'letter_update'
                });
            }
        }
        res.status(200).json({ success: true, data: letter });
    } catch (err) { console.error('[API ERROR]', err); res.status(400).json({ success: false, error: err.message }); }
};

exports.deleteLetter = async (req, res) => {
    try {
        const letter = await Letter.findByPk(req.params.id);
        if (!letter) return res.status(404).json({ success: false, error: "Letter not found" });
        await letter.destroy();
        res.status(200).json({ success: true, message: "Letter deleted" });
    } catch (err) { console.error('[API ERROR]', err); res.status(400).json({ success: false, error: err.message }); }
};
