const { Employee, Attendance, Leave, Asset, Payroll, Expense, Appreciation, CompanyPolicy, Offboarding, Payslip, Holiday, Letter, SuperAdmin, Notification, PrePayment, IncrementPromotion, AppreciationComment } = require('../models');
const { Op } = require('sequelize');

// Dashboard Statistics
exports.getDashboardStats = async (req, res) => {
    try {
        const empId = req.user.employee_id;
        const today = new Date().toISOString().split('T')[0];

        // Today's attendance
        const todayAttendance = await Attendance.findOne({ where: { employee_id: empId, date: today } });

        // Late count (unique days where the first clock-in was late)
        const allAttendance = await Attendance.findAll({ where: { employee_id: empId } });
        const uniqueDates = Array.from(new Set(allAttendance.map(a => a.date)));
        
        let lateAttendanceCount = 0;
        uniqueDates.forEach(date => {
            const dayRecords = allAttendance.filter(a => a.date === date && a.clock_in);
            if (dayRecords.length > 0) {
                const firstClockIn = dayRecords.sort((a, b) => new Date(a.clock_in) - new Date(b.clock_in))[0];
                const clockInTime = new Date(firstClockIn.clock_in);
                if (clockInTime.getHours() >= 10 && clockInTime.getMinutes() > 0) {
                    lateAttendanceCount++;
                }
            }
        });

        // Total working hours (sum of all work_duration)
        const totalDuration = await Attendance.sum('work_duration', { where: { employee_id: empId } });

        // Recent Appreciations
        const recentAppreciations = await Appreciation.findAll({
            where: { employee_id: empId },
            include: [{ model: Employee, as: 'Sender', attributes: ['employee_name'] }],
            limit: 5,
            order: [['date', 'DESC']]
        });

        // Assigned Assets (Only count those currently 'Assigned')
        const assignedAssets = await Asset.count({ where: { assigned_employee: empId, status: 'Assigned' } });

        // Recent Leave Activity
        const recentLeaves = await Leave.findAll({ where: { employee_id: empId }, limit: 5, order: [['leave_id', 'DESC']] });

        res.status(200).json({
            success: true,
            data: {
                employee: {
                    name: req.user.employee_name,
                    joining_date: req.user.joining_date,
                    department: req.user.department,
                    designation: req.user.designation
                },
                todayStatus: todayAttendance ? (todayAttendance.clock_out ? 'Completed' : 'Checked In') : 'Not Checked In',
                totalWorkingHours: totalDuration || 0,
                lateAttendanceCount: lateAttendanceCount,
                appreciationCount: recentAppreciations.length,
                assetCount: assignedAssets,
                recentActivities: {
                    appreciations: recentAppreciations,
                    leaves: recentLeaves
                }
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// --- ATTENDANCE ---
exports.clockIn = async (req, res) => {
    try {
        const empId = req.user.employee_id;
        const today = new Date().toISOString().split('T')[0];

        // Check if there's an active (unclosed) clock-in
        const active = await Attendance.findOne({ where: { employee_id: empId, clock_out: null } });
        if (active) return res.status(400).json({ success: false, error: 'You are already clocked in. Please clock out first before clocking in again.' });

        const record = await Attendance.create({
            employee_id: empId,
            date: today,
            clock_in: new Date(),
            status: 'Present'
        });

        res.status(201).json({ success: true, data: record });
    } catch (err) { res.status(400).json({ success: false, error: err.message }); }
};

exports.clockOut = async (req, res) => {
    try {
        const empId = req.user.employee_id;

        // Find the most recent active clock-in session (even if from a previous day)
        const record = await Attendance.findOne({
            where: { employee_id: empId, clock_out: null },
            order: [['clock_in', 'DESC']]
        });

        if (!record) return res.status(400).json({ success: false, error: 'No active clock-in found. Please clock in first.' });

        const clockOutTime = new Date();
        const duration = (clockOutTime - new Date(record.clock_in)) / (1000 * 60 * 60); // In hours

        await record.update({
            clock_out: clockOutTime,
            work_duration: parseFloat(duration.toFixed(2))
        });

        res.status(200).json({ success: true, data: record });
    } catch (err) { res.status(400).json({ success: false, error: err.message }); }
};

exports.getAttendanceHistory = async (req, res) => {
    try {
        const history = await Attendance.findAll({ where: { employee_id: req.user.employee_id }, order: [['date', 'DESC']] });
        res.status(200).json({ success: true, data: history });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

// --- LEAVES ---
exports.applyLeave = async (req, res) => {
    try {
        const data = { ...req.body, employee_id: req.user.employee_id, status: 'Pending' };
        const leave = await Leave.create(data);

        // Notify Manager
        // 1. Try specific manager_id
        // 2. Fallback to any Manager designation
        let managerObj = null;
        if (req.user.manager_id) {
            managerObj = await Employee.findByPk(req.user.manager_id);
        }
        if (!managerObj) {
            managerObj = await Employee.findOne({ where: { designation: 'Manager' } });
        }

        if (managerObj && managerObj.email) {
            if (global.globalNotificationService) {
                await global.globalNotificationService.sendGlobalNotification({
                    senderRole: 'employee',
                    senderEmail: req.user.email,
                    recipientEmails: [managerObj.email],
                    message: `${req.user.employee_name} has applied for ${data.leave_type} (${data.start_date} to ${data.end_date})`,
                    type: 'leave_application'
                });
            }
            // Also create a persistent notification in DB
            await Notification.create({
                userId: managerObj.email.toLowerCase(),
                role: 'manager',
                message: `${req.user.employee_name} has applied for leave.`,
                type: 'Leave',
                senderRole: 'employee',
                senderEmail: req.user.email
            });
        }

        // Notify Employee (Self confirmation)
        await Notification.create({
            userId: req.user.email.toLowerCase(),
            role: 'employee',
            message: `You have successfully applied for ${data.leave_type} from ${data.start_date} to ${data.end_date}.`,
            type: 'Leave',
            senderRole: 'system'
        });

        // Trigger Email Notification (manager172243@gmail.com)
        const { sendLeaveNotification } = require('../services/mailService');
        await sendLeaveNotification({
            employeeName: req.user.employee_name,
            leaveType: data.leave_type,
            startDate: data.start_date,
            endDate: data.end_date,
            managerEmail: 'lmoksha.132@gmail.com'
        });

        res.status(201).json({ success: true, data: leave });
    } catch (err) { res.status(400).json({ success: false, error: err.message }); }
};

exports.getMyLeaves = async (req, res) => {
    try {
        const leaves = await Leave.findAll({
            where: { employee_id: req.user.employee_id },
            include: [{ model: Employee, attributes: ['employee_name'] }],
            order: [['leave_id', 'DESC']]
        });
        res.status(200).json({ success: true, data: leaves });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

// --- ASSETS ---
exports.getMyAssets = async (req, res) => {
    try {
        const assets = await Asset.findAll({ where: { assigned_employee: req.user.employee_id } });
        res.status(200).json({ success: true, data: assets });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

// --- APPRECIATIONS ---
exports.getMyAppreciations = async (req, res) => {
    try {
        const list = await Appreciation.findAll({
            where: { employee_id: req.user.employee_id },
            include: [{ model: Employee, as: 'Sender', attributes: ['employee_name'] }],
            order: [['date', 'DESC']]
        });

        res.status(200).json({ success: true, data: list });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

// --- HOLIDAYS ---
exports.getUpcomingHolidays = async (req, res) => {
    try {
        const holis = await Holiday.findAll({ order: [['date', 'ASC']] });
        res.status(200).json({ success: true, data: holis });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

// --- POLICIES ---
exports.getPolicies = async (req, res) => {
    try {
        const pols = await CompanyPolicy.findAll({ order: [['uploaded_date', 'DESC']] });
        res.status(200).json({ success: true, data: pols });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

// --- OFFBOARDING ---
exports.submitResignation = async (req, res) => {
    try {
        const categoryRaw = String(req.body.category || 'Resignation').toLowerCase();
        const category = categoryRaw === 'complaint' ? 'Complaint' : (categoryRaw === 'resignation' ? 'Resignation' : null);
        if (!category) {
            return res.status(400).json({ success: false, error: "Invalid category. Allowed: Resignation, Complaint." });
        }

        const reason = String(req.body.reason || '').trim();
        if (!reason) {
            return res.status(400).json({ success: false, error: "Reason is required." });
        }

        const data = {
            employee_id: req.user.employee_id,
            category,
            raised_by: 'Employee',
            reason,
            status: 'Pending',
            last_working_date: category === 'Resignation' ? (req.body.last_working_date || null) : null
        };

        if (category === 'Resignation' && !data.last_working_date) {
            return res.status(400).json({ success: false, error: "Last working date is required for resignation." });
        }

        const off = await Offboarding.create(data);
        res.status(201).json({ success: true, data: off });
    } catch (err) { res.status(400).json({ success: false, error: err.message }); }
};

exports.getMyOffboardings = async (req, res) => {
    try {
        const list = await Offboarding.findAll({ where: { employee_id: req.user.employee_id }, order: [['created_at', 'DESC']] });
        res.status(200).json({ success: true, data: list });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

// --- ASSETS ---
exports.getMyAssets = async (req, res) => {
    try {
        const assets = await Asset.findAll({
            where: { assigned_employee: req.user.employee_id },
            order: [['asset_id', 'DESC']]
        });
        res.status(200).json({ success: true, data: assets });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

// --- EXPENSES ---
exports.submitExpense = async (req, res) => {
    try {
        const data = { ...req.body, employee_id: req.user.employee_id, status: 'Pending' };
        const exp = await Expense.create(data);

        const manager = await Employee.findOne({ where: { designation: 'Manager' } });
        if (manager && manager.email) { // Notify Manager via Global Service (Real-time)
            if (global.globalNotificationService) {
                await global.globalNotificationService.sendGlobalNotification({
                    senderRole: 'employee',
                    senderEmail: req.user.email,
                    recipientEmails: [manager.email],
                    message: `${req.user.employee_name} submitted a new expense claim: ${data.title} ($${data.amount})`,
                    type: 'expense_submission'
                });
            }
        }

        res.status(201).json({ success: true, data: exp });
    } catch (err) { res.status(400).json({ success: false, error: err.message }); }
};

exports.getMyExpenses = async (req, res) => {
    try {
        const list = await Expense.findAll({ where: { employee_id: req.user.employee_id }, order: [['expense_id', 'DESC']] });
        res.status(200).json({ success: true, data: list });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

exports.updateExpense = async (req, res) => {
    try {
        const exp = await Expense.findOne({ where: { expense_id: req.params.id, employee_id: req.user.employee_id } });
        if (!exp) return res.status(404).json({ success: false, error: "Expense not found" });
        if (exp.status !== 'Pending') return res.status(400).json({ success: false, error: "Only pending claims can be edited" });

        await exp.update(req.body);

        const manager = await Employee.findOne({ where: { designation: 'Manager' } });
        if (manager && manager.email) { // Notify Manager via Global Service (Real-time)
            if (global.globalNotificationService) {
                await global.globalNotificationService.sendGlobalNotification({
                    senderRole: 'employee',
                    senderEmail: req.user.email,
                    recipientEmails: [manager.email],
                    message: `${req.user.employee_name} updated their expense claim: ${exp.title}`,
                    type: 'expense_update'
                });
            }
        }

        res.status(200).json({ success: true, data: exp });
    } catch (err) { res.status(400).json({ success: false, error: err.message }); }
};

exports.deleteExpense = async (req, res) => {
    try {
        const exp = await Expense.findOne({ where: { expense_id: req.params.id, employee_id: req.user.employee_id } });
        if (!exp) return res.status(404).json({ success: false, error: "Expense not found" });
        if (exp.status !== 'Pending') return res.status(400).json({ success: false, error: "Only pending claims can be deleted" });

        const title = exp.title;
        await exp.destroy();

        const manager = await Employee.findOne({ where: { designation: 'Manager' } });
        if (manager && manager.email) { // Notify Manager via Global Service (Real-time)
            if (global.globalNotificationService) {
                await global.globalNotificationService.sendGlobalNotification({
                    senderRole: 'employee',
                    senderEmail: req.user.email,
                    recipientEmails: [manager.email],
                    message: `${req.user.employee_name} deleted their expense claim: ${title}`,
                    type: 'expense_delete'
                });
            }
        }

        res.status(200).json({ success: true, message: "Expense deleted" });
    } catch (err) { res.status(400).json({ success: false, error: err.message }); }
};

// --- PAYROLL / PAYSLIPS ---
exports.getMyPayroll = async (req, res) => {
    try {
        const payrolls = await Payroll.findAll({
            where: { employee_id: req.user.employee_id },
            order: [['payment_date', 'DESC'], ['payroll_id', 'DESC']]
        });
        res.status(200).json({ success: true, data: payrolls });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

exports.getMyPayslips = async (req, res) => {
    try {
        const slips = await Payslip.findAll({ where: { employee_id: req.user.employee_id }, order: [['payment_date', 'DESC']] });
        res.status(200).json({ success: true, data: slips });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

// --- PRE PAYMENTS ---
exports.submitPrePayment = async (req, res) => {
    try {
        const { amount, date, payment_type, remarks } = req.body || {};
        if (!amount || !date) {
            return res.status(400).json({ success: false, error: "Amount and date are required" });
        }

        const data = {
            employee_id: req.user.employee_id,
            amount,
            date,
            payment_type: payment_type || 'Advance',
            remarks: remarks || null,
            status: 'Pending'
        };
        const record = await PrePayment.create(data);
        res.status(201).json({ success: true, data: record });
    } catch (err) { res.status(400).json({ success: false, error: err.message }); }
};

exports.getMyPrePayments = async (req, res) => {
    try {
        const list = await PrePayment.findAll({
            where: { employee_id: req.user.employee_id },
            order: [['created_at', 'DESC']]
        });
        res.status(200).json({ success: true, data: list });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

// --- INCREMENT / PROMOTION ---
exports.getMyIncrementPromotions = async (req, res) => {
    try {
        const list = await IncrementPromotion.findAll({
            where: { employee_id: req.user.employee_id },
            order: [['created_at', 'DESC']]
        });
        res.status(200).json({ success: true, data: list });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

exports.downloadPayslip = async (req, res) => {
    try {
        const slip = await Payslip.findByPk(req.params.id, { include: [Employee] });
        if (!slip || slip.employee_id !== req.user.employee_id) {
            return res.status(404).json({ success: false, error: "Payslip not found" });
        }

        const content = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
                .payslip-box { border: 2px solid #333; padding: 30px; max-width: 600px; margin: auto; }
                .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 20px; }
                .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
                .footer { margin-top: 40px; font-size: 12px; text-align: center; color: #777; }
                .total { font-weight: bold; border-top: 1px solid #ddd; padding-top: 10px; margin-top: 20px; }
            </style>
        </head>
        <body>
            <div class="payslip-box">
                <div class="header">
                    <h2>OFFICIAL PAYSLIP</h2>
                    <p>HRM PORTAL</p>
                </div>
                <div class="grid">
                    <div>
                        <strong>Employee Details:</strong><br>
                        Name: ${req.user.employee_name}<br>
                        ID: ${req.user.employee_id}
                    </div>
                    <div>
                        <strong>Payment Info:</strong><br>
                        Date: ${slip.payment_date}
                    </div>
                </div>
                <div style="margin-top: 30px;">
                    <strong>Earnings:</strong><br>
                    Basic Salary: $${slip.basic_salary}<br>
                    Allowances: $${slip.allowances}
                </div>
                <div style="margin-top: 20px;">
                    <strong>Deductions:</strong><br>
                    Total Deductions: $${slip.deductions}
                </div>
                <div class="total">
                    NET PAYABLE: $${slip.net_salary}
                </div>
                <div class="footer">
                    This is an electronically generated document. No signature required.
                </div>
            </div>
        </body>
        </html>
        `;

        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Content-Disposition', `attachment; filename=payslip_${slip.payment_date}.html`);
        res.send(content);

    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

// --- PROFILE ---
const resolveEmployeeFromRequest = async (req) => {
    const employeeId = req.user?.employee_id;
    const email = req.user?.email;

    if (employeeId) {
        const byId = await Employee.findByPk(employeeId);
        if (byId) return byId;
    }

    if (email) {
        return Employee.findOne({ where: { email } });
    }

    return null;
};

const toProfileResponse = (employee) => {
    const fallbackName = employee.employee_name || (employee.email ? employee.email.split('@')[0] : 'Employee');
    return {
        employee_id: employee.employee_id,
        role: employee.role,
        status: employee.status,
        name: fallbackName,
        employee_name: fallbackName,
        email: employee.email,
        phone: employee.phone || '',
        department: employee.department || '',
        designation: employee.designation || '',
        joining_date: employee.joining_date || null,
        work_mode: employee.work_mode || '',
        location: employee.location || '',
        profile_photo: employee.profile_photo || ''
    };
};

exports.getProfile = async (req, res) => {
    try {
        const employee = await resolveEmployeeFromRequest(req);
        if (!employee) {
            return res.status(404).json({ success: false, error: 'Employee profile not found' });
        }

        // Repair broken legacy rows.
        if (!employee.employee_name || !String(employee.employee_name).trim()) {
            const fallbackName = employee.email ? employee.email.split('@')[0] : `Employee-${employee.employee_id}`;
            await employee.update({ employee_name: fallbackName });
        }

        const data = toProfileResponse(employee);
        res.status(200).json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const parseTextField = (value) => {
            if (value === undefined || value === null) return undefined;
            const text = String(value).trim();
            return text === '' ? null : text;
        };

        const employee = await resolveEmployeeFromRequest(req);
        if (!employee) {
            return res.status(404).json({ success: false, error: 'Employee profile not found' });
        }

        const body = req.body || {};
        const fieldsToUpdate = {};
        const nextName = parseTextField(body.name ?? body.employee_name);
        const nextPhone = parseTextField(body.phone);
        const nextDepartment = parseTextField(body.department);
        const nextDesignation = parseTextField(body.designation);
        const nextJoiningDate = parseTextField(body.joining_date);
        const nextWorkMode = parseTextField(body.work_mode);
        const nextLocation = parseTextField(body.location);

        if (nextName !== undefined && nextName !== null) fieldsToUpdate.employee_name = nextName;
        if (nextPhone !== undefined) fieldsToUpdate.phone = nextPhone;
        if (nextDepartment !== undefined) fieldsToUpdate.department = nextDepartment;
        if (nextDesignation !== undefined) fieldsToUpdate.designation = nextDesignation;
        if (nextJoiningDate !== undefined) fieldsToUpdate.joining_date = nextJoiningDate;
        if (nextWorkMode !== undefined) fieldsToUpdate.work_mode = nextWorkMode;
        if (nextLocation !== undefined) fieldsToUpdate.location = nextLocation;
        if (req.file) fieldsToUpdate.profile_photo = `/uploads/${req.file.filename}`;

        await employee.update(fieldsToUpdate);

        if (!employee.employee_name || !String(employee.employee_name).trim()) {
            const fallbackName = employee.email ? employee.email.split('@')[0] : `Employee-${employee.employee_id}`;
            await employee.update({ employee_name: fallbackName });
        }

        const data = toProfileResponse(employee);

        res.status(200).json({ success: true, data });
    } catch (err) { res.status(400).json({ success: false, error: err.message }); }
};

exports.updatePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const employee = await resolveEmployeeFromRequest(req);
        if (!employee) {
            return res.status(404).json({ success: false, error: 'Employee profile not found' });
        }

        const isMatch = await employee.matchPassword(currentPassword);
        if (!isMatch) return res.status(400).json({ success: false, error: 'Current password incorrect' });

        employee.password = newPassword;
        await employee.save();
        res.status(200).json({ success: true, message: 'Password updated successfully' });
    } catch (err) { res.status(400).json({ success: false, error: err.message }); }
};

// --- LETTERS ---
exports.getEmployeeLetters = async (req, res) => {
    try {
        const letters = await Letter.findAll({
            where: { employee_id: req.user.employee_id },
            include: [{ model: SuperAdmin, as: 'Sender' }],
            order: [['created_at', 'DESC']]
        });
        res.status(200).json({ success: true, data: letters });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

exports.updateLetter = async (req, res) => {
    try {
        const letter = await Letter.findByPk(req.params.id);
        if (!letter) return res.status(404).json({ success: false, error: "Not found" });

        // Ensure the letter belongs to the employee
        if (letter.employee_id !== req.user.employee_id) {
            return res.status(403).json({ success: false, error: "Not authorized to edit this letter" });
        }

        // Update content and change status
        const { content } = req.body;
        if (!content) return res.status(400).json({ success: false, error: "Content is required" });

        await letter.update({
            content,
            status: 'Edited'
        });

        const updatedLetter = await Letter.findByPk(letter.letter_id, {
            include: [{ model: SuperAdmin, as: 'Sender' }]
        });

        // NOTIFY MANAGER (Sender)
        if (updatedLetter && updatedLetter.Sender && updatedLetter.Sender.email) {
            await Notification.create({
                userId: updatedLetter.Sender.email.toLowerCase(),
                role: 'manager',
                message: `Employee ${req.user.employee_name} has edited the letter: "${updatedLetter.title}"`,
                type: 'Letter'
            });
        }

        res.status(200).json({ success: true, data: updatedLetter });
    } catch (err) { res.status(400).json({ success: false, error: err.message }); }
};

// --- APPRECIATIONS (THANKS) ---
exports.sendAppreciation = async (req, res) => {
    try {
        const { recipient_id, title, description } = req.body;
        // If the sender is a Manager (SuperAdmin), they don't have an employee_id.
        // We set sender_id to null to avoid ID collisions with the Employee table.
        const sender_id = req.user.employee_id || null;

        const app = await Appreciation.create({
            employee_id: recipient_id,
            sender_id,
            title,
            description,
            date: new Date()
        });

        // Find recipient details for notification
        const recipient = await Employee.findByPk(recipient_id);
        if (recipient && recipient.email) {
            const message = `${req.user.employee_name} sent you a "${title}" badge!`;

            // Create in-app notification
            await Notification.create({
                userId: recipient.email.toLowerCase(),
                role: 'employee', // Recipient role
                message,
                type: 'Appreciation',
                senderRole: 'employee',
                senderEmail: req.user.email
            });

            // Trigger Real-time notification
            if (global.globalNotificationService) {
                await global.globalNotificationService.sendGlobalNotification({
                    senderRole: 'employee',
                    senderEmail: req.user.email,
                    recipientEmails: [recipient.email],
                    message,
                    type: 'appreciation'
                });
            }
        }
        res.status(201).json({ success: true, data: appreciation });
    } catch (err) { res.status(400).json({ success: false, error: err.message }); }
};

exports.getMyAppreciations = async (req, res) => {
    try {
        const { Op } = require('sequelize');
        const appreciations = await Appreciation.findAll({
            where: {
                [Op.or]: [
                    { employee_id: req.user.employee_id },
                    { sender_id: req.user.employee_id }
                ]
            },
            include: [
                { model: Employee, as: 'Sender', attributes: ['employee_name', 'email'] },
                { model: Employee, as: 'Recipient', attributes: ['employee_name', 'email'] },
                { model: AppreciationComment, attributes: ['comment_id', 'commenter_name', 'content', 'created_at'] }
            ],
            order: [['date', 'DESC']]
        });
        res.status(200).json({ success: true, data: appreciations });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

exports.getAllEmployees = async (req, res) => {
    try {
        const employees = await Employee.findAll({
            where: { status: 'Active' },
            attributes: ['employee_id', 'employee_name', 'email', 'role']
        });

        res.status(200).json({ success: true, data: employees });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

exports.deleteAppreciation = async (req, res) => {
    try {
        const appreciation = await Appreciation.findByPk(req.params.id);
        if (!appreciation) {
            return res.status(404).json({ success: false, error: "Appreciation not found" });
        }

        // Only sender or recipient or a Manager/Admin can delete? 
        // User just said "add an option to delete badge". 
        // I'll allow the sender or the recipient to delete it.
        const isSender = appreciation.sender_id === req.user.employee_id;
        const isRecipient = appreciation.employee_id === req.user.employee_id;
        const isManager = req.user.role === 'Manager' || req.user.role === 'Super Admin';

        if (!isSender && !isRecipient && !isManager) {
            return res.status(403).json({ success: false, error: "Not authorized to delete this badge" });
        }

        await appreciation.destroy();
        res.status(200).json({ success: true, message: "Badge deleted successfully" });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

exports.addAppreciationComment = async (req, res) => {
    try {
        const { id } = req.params;
        const { content } = req.body;
        
        const appreciation = await Appreciation.findByPk(id, {
            include: [
                { model: Employee, as: 'Sender' },
                { model: Employee, as: 'Recipient' }
            ]
        });

        if (!appreciation) return res.status(404).json({ success: false, error: "Appreciation not found" });

        const comment = await AppreciationComment.create({
            appreciation_id: id,
            commenter_name: req.user.employee_name || req.user.name || 'User',
            commenter_email: req.user.email,
            content
        });

        // NOTIFY SENDER
        // If the sender is an employee, notify them.
        // If sender is null (Manager), notify the manager panel.
        let recipientEmail = null;
        let recipientRole = 'employee';

        if (appreciation.Sender) {
            recipientEmail = appreciation.Sender.email;
        } else {
            // It was a Manager (SuperAdmin). Fallback to a target manager email.
            // For now, use the first manager found or a hardcoded one if needed.
            const manager = await SuperAdmin.findOne({ where: { role: 'Manager' } });
            if (manager) {
                recipientEmail = manager.email;
                recipientRole = 'manager';
            }
        }

        if (recipientEmail && recipientEmail.toLowerCase() !== req.user.email.toLowerCase()) {
            const message = `${req.user.employee_name || req.user.name} commented on a badge: "${content}"`;
            
            await Notification.create({
                userId: recipientEmail.toLowerCase(),
                role: recipientRole,
                message,
                type: 'AppreciationComment',
                senderRole: req.user.employee_id ? 'employee' : 'manager',
                senderEmail: req.user.email
            });

            if (global.globalNotificationService) {
                await global.globalNotificationService.sendGlobalNotification({
                    senderRole: req.user.employee_id ? 'employee' : 'manager',
                    senderEmail: req.user.email,
                    recipientEmails: [recipientEmail],
                    message,
                    type: 'appreciation_comment'
                });
            }
        }

        res.status(201).json({ success: true, data: comment });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};
