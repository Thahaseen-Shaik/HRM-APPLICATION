const SuperAdmin = require('../models/SuperAdmin');
const Employee = require('../models/EmployeeModel');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Op } = require('sequelize');
const { sendEmail } = require('../services/emailService');
const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret_change_me';

const normalizeAdminRole = (inputRole) => {
    const role = (inputRole || '').toString().trim().toLowerCase();
    const map = {
        'super admin': 'Super Admin',
        'superadmin': 'Super Admin',
        'admin': 'Admin',
        'company admin': 'Company Admin',
        'companyadmin': 'Company Admin',
        'manager': 'Manager'
    };
    return map[role] || null;
};

const parseTextField = (value) => {
    if (value === undefined || value === null) return undefined;
    const text = String(value).trim();
    return text === '' ? null : text;
};

const deriveDisplayName = (user, employeeProfile) => {
    const employeeName = parseTextField(employeeProfile?.employee_name);
    const userName = parseTextField(user?.name);
    const emailPrefix = parseTextField(user?.email)?.split('@')[0] || null;
    return employeeName || userName || emailPrefix || 'User';
};

const ensureShadowEmployeeProfile = async (user) => {
    let employeeProfile = await Employee.findOne({ where: { email: user.email } });
    if (!employeeProfile) {
        const fallbackName = deriveDisplayName(user, null);
        employeeProfile = await Employee.create({
            employee_name: fallbackName,
            email: user.email,
            role: user.role,
            phone: user.phone || null,
            status: 'Active',
            designation: user.role,
            department: 'Management',
            joining_date: user.createdAt ? new Date(user.createdAt) : new Date(),
            profile_photo: user.profile_photo || null
        });
        return employeeProfile;
    }

    const syncPatch = {};
    const fallbackName = deriveDisplayName(user, employeeProfile);
    if (!parseTextField(employeeProfile.employee_name)) syncPatch.employee_name = fallbackName;
    if (!parseTextField(employeeProfile.role) && parseTextField(user.role)) syncPatch.role = user.role;

    if (Object.keys(syncPatch).length > 0) {
        await employeeProfile.update(syncPatch);
    }

    return employeeProfile;
};

const buildUnifiedProfile = (user, employeeProfile) => {
    const displayName = deriveDisplayName(user, employeeProfile);
    return {
    id: user.id,
    employee_id: employeeProfile?.employee_id || null,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    isTrial: user.isTrial,
    trialStartDate: user.trialStartDate,
    trialEndDate: user.trialEndDate,
    name: displayName,
    employee_name: displayName,
    email: user.email,
    phone: employeeProfile?.phone || user.phone || '',
    department: employeeProfile?.department || 'Management',
    designation: employeeProfile?.designation || user.role || '',
    joining_date: employeeProfile?.joining_date || user.createdAt || null,
    work_mode: employeeProfile?.work_mode || '',
    location: employeeProfile?.location || '',
    profile_photo: employeeProfile?.profile_photo || user.profile_photo || ''
};
};

const sendTokenResponse = (user, statusCode, res) => {
    // Include role in payload to help middleware distinguish between tables if necessary
    // For Employee: use employee_id, for SuperAdmin: use id
    const userId = user.employee_id !== undefined ? user.employee_id : user.id;
    const token = jwt.sign({ id: userId, role: user.role, email: user.email }, JWT_SECRET, {
        expiresIn: '30d'
    });

    res.status(statusCode).json({
        success: true,
        token,
        user: { 
            id: userId, 
            name: user.name || user.employee_name || (user.email ? user.email.split('@')[0] : 'User'), 
            email: user.email, 
            role: user.role,
            status: user.status,
            isTrial: user.isTrial,
            trialStartDate: user.trialStartDate,
            trialEndDate: user.trialEndDate,
            profile_photo: user.profile_photo || ''
        }
    });
};

// @desc    Login User (Super Admin, Manager, or Employee)
// @route   POST /api/v1/auth/login
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Please provide email and password' });
        }

        // 1. Check SuperAdmin table (Super Admin, Admin, Manager)
        let user = await SuperAdmin.findOne({ where: { email } });

        // If a SuperAdmin record exists but is marked Employee, prefer the Employee table
        if (user && user.role === 'Employee') {
            const emp = await Employee.findOne({ where: { email } });
            if (emp) {
                user = emp;
            }
        }

        if (!user) {
            // 2. Check Employee table
            user = await Employee.findOne({ where: { email } });
        }

        if (!user) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        const isMatch = await user.matchPassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        // Check if user is deactivated (Inactive)
        if (user.status === 'Inactive') {
            const roleStr = user.role === 'Manager' ? 'manager' : 'user';
            return res.status(403).json({ 
                success: false, 
                error: `Account Inactive: Your access has been restricted by an administrator. You are no longer authorized as a ${roleStr} on this platform.` 
            });
        }

        sendTokenResponse(user, 200, res);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Register initial Super Admin (setup only)
// @route   POST /api/v1/auth/register
exports.register = async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        const normalizedRole = normalizeAdminRole(role);

        if (!normalizedRole) {
            return res.status(400).json({
                success: false,
                error: 'Invalid role. Allowed roles are Super Admin, Admin, Company Admin, or Manager.'
            });
        }

        const user = await SuperAdmin.create({ name, email, password, role: normalizedRole });

        const message = `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
                <div style="background-color: #4f46e5; color: white; padding: 20px; text-align: center;">
                    <h1 style="margin: 0;">Welcome to HRM Portal</h1>
                </div>
                <div style="padding: 20px;">
                    <p>Hello <strong>${name}</strong>,</p>
                    <p>Your account has been created with role: ${normalizedRole}.</p>
                    <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin: 20px 0;">
                        <p style="margin: 5px 0;"><strong>Login Email:</strong> ${email}</p>
                        <p style="margin: 5px 0;"><strong>Temporary Password:</strong> ${password}</p>
                    </div>
                    <p>Please log in and change your password as soon as possible.</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="http://localhost:5173/login" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Login to HRM Portal</a>
                    </div>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                    <p style="font-size: 12px; color: #777;">This is an automated message, please do not reply to this email.</p>
                </div>
            </div>
        `;

        try {
            await sendEmail({
                email: user.email,
                subject: 'Your New HRM Portal Account',
                html: message,
                text: [
                    'Welcome to HRM Portal',
                    '',
                    `Hello ${name},`,
                    `Your account has been created with role: ${normalizedRole}.`,
                    `Login Email: ${email}`,
                    `Temporary Password: ${password}`,
                    '',
                    'Please change your password after first login.',
                    'Login URL: http://localhost:5173/login'
                ].join('\n')
            });
            console.log(`[Auth] Welcome credentials email sent to ${user.email}`);
        } catch (emailErr) {
            console.error(`[Auth] Failed to send welcome credentials email: ${emailErr.message}`);
        }

        sendTokenResponse(user, 201, res);
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Public registration (self signup)
// @route   POST /api/v1/auth/register/public
exports.registerPublic = async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        // Only allow Admin, Manager, or Employee for public registration
        const allowedRoles = ['Admin', 'Manager', 'Employee'];
        const normalizedRole = allowedRoles.includes(role) ? role : null;
        
        if (!normalizedRole) {
            return res.status(400).json({ success: false, error: 'Registration is currently limited to Admin, Manager, and Employee roles.' });
        }

        const userData = {
            name,
            email,
            password,
            role: normalizedRole,
            status: 'Active'
        };

        // Manager trial logic: 15-day trial period
        if (normalizedRole === 'Manager') {
            const now = new Date();
            const trialEnd = new Date();
            trialEnd.setDate(now.getDate() + 15);
            
            userData.isTrial = true;
            userData.trialStartDate = now;
            userData.trialEndDate = trialEnd;
        }

        const user = await SuperAdmin.create(userData);

        sendTokenResponse(user, 201, res);
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Public employee registration
// @route   POST /api/v1/auth/register/employee
exports.registerEmployee = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ success: false, error: 'Please provide name, email, and password' });
        }

        const normalizedEmail = String(email).trim().toLowerCase();

        const existingSuperAdmin = await SuperAdmin.findOne({ where: { email: normalizedEmail } });
        const existingEmployee = await Employee.findOne({ where: { email: normalizedEmail } });

        if (existingSuperAdmin || existingEmployee) {
            return res.status(400).json({ success: false, error: 'An account with this email already exists' });
        }

        const employee = await Employee.create({
            employee_name: String(name).trim(),
            email: normalizedEmail,
            password,
            role: 'Employee',
            status: 'Active'
        });

        return res.status(201).json({
            success: true,
            user: {
                id: employee.employee_id,
                name: employee.employee_name,
                email: employee.email,
                role: 'Employee'
            }
        });
    } catch (err) {
        return res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Get all managers with trial info (Admin only)
// @route   GET /api/v1/auth/trials
exports.getTrialManagers = async (req, res) => {
    try {
        const managers = await SuperAdmin.findAll({
            where: { role: 'Manager' },
            attributes: ['id', 'name', 'email', 'role', 'status', 'createdAt', 'trialStartDate', 'trialEndDate', 'isTrial'],
            order: [['createdAt', 'DESC']]
        });
        res.status(200).json({ success: true, count: managers.length, data: managers });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Update manager trial or status (Admin only)
// @route   PUT /api/v1/auth/trials/:id
exports.updateTrial = async (req, res) => {
    try {
        const user = await SuperAdmin.findByPk(req.params.id);
        if (!user) return res.status(404).json({ success: false, error: 'Manager not found' });
        
        const { status, trialStartDate, trialEndDate, isTrial } = req.body;
        
        if (status) user.status = status;
        if (trialStartDate) user.trialStartDate = trialStartDate;
        if (trialEndDate) user.trialEndDate = trialEndDate;
        if (isTrial !== undefined) user.isTrial = isTrial;
        
        await user.save();
        res.status(200).json({ success: true, data: user });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Get only Active Managers (for Admin view)
// @route   GET /api/v1/auth/users
exports.getUsers = async (req, res) => {
    try {
        const users = await SuperAdmin.findAll({
            where: {
                role: {
                    [Op.in]: ['Admin', 'Super Admin', 'System Admin', 'Manager']
                }
            }
        });
        res.status(200).json({ success: true, count: users.length, data: users });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Delete User
// @route   DELETE /api/v1/auth/users/:id
exports.deleteUser = async (req, res) => {
    try {
        await SuperAdmin.destroy({ where: { id: req.params.id } });
        res.status(200).json({ success: true, data: {} });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Get current logged in user
// @route   GET /api/v1/auth/me
exports.getMe = async (req, res) => {
    try {
        const user = await SuperAdmin.findByPk(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const employeeProfile = await ensureShadowEmployeeProfile(user);
        const unifiedProfile = buildUnifiedProfile(user, employeeProfile);

        res.status(200).json({ success: true, data: unifiedProfile });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// @desc    Update user details
// @route   PUT /api/v1/auth/updatedetails
exports.updateDetails = async (req, res) => {
    try {
        const user = await SuperAdmin.findByPk(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const body = req.body || {};
        const previousEmail = user.email;
        const nextEmail = parseTextField(body.email) || user.email;
        const nextName = parseTextField(body.name ?? body.employee_name) || parseTextField(user.name) || (nextEmail ? nextEmail.split('@')[0] : 'User');
        const nextPhone = parseTextField(body.phone);
        const uploadedPhoto = req.file ? `/uploads/${req.file.filename}` : undefined;

        const userUpdate = {
            name: nextName,
            email: nextEmail
        };

        if (nextPhone !== undefined) userUpdate.phone = nextPhone;
        if (uploadedPhoto !== undefined) userUpdate.profile_photo = uploadedPhoto;

        await user.update(userUpdate);

        let employeeProfile = await Employee.findOne({
            where: {
                email: {
                    [Op.in]: [previousEmail, user.email]
                }
            }
        });
        if (!employeeProfile) {
            employeeProfile = await ensureShadowEmployeeProfile(user);
        }

        const employeeUpdate = {
            employee_name: nextName,
            email: nextEmail
        };

        const employeePhone = parseTextField(body.phone);
        const department = parseTextField(body.department);
        const designation = parseTextField(body.designation);
        const joiningDate = parseTextField(body.joining_date);
        const workMode = parseTextField(body.work_mode);
        const location = parseTextField(body.location);

        if (employeePhone !== undefined) employeeUpdate.phone = employeePhone;
        if (department !== undefined) employeeUpdate.department = department;
        if (designation !== undefined) employeeUpdate.designation = designation;
        if (joiningDate !== undefined) employeeUpdate.joining_date = joiningDate;
        if (workMode !== undefined) employeeUpdate.work_mode = workMode;
        if (location !== undefined) employeeUpdate.location = location;
        if (uploadedPhoto !== undefined) employeeUpdate.profile_photo = uploadedPhoto;

        await employeeProfile.update(employeeUpdate);

        const unifiedProfile = buildUnifiedProfile(user, employeeProfile);
        res.status(200).json({ success: true, data: unifiedProfile });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Update password
// @route   PUT /api/v1/auth/updatepassword
exports.updatePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = await SuperAdmin.findByPk(req.user.id);

        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const isMatch = await user.matchPassword(currentPassword);
        if (!isMatch) {
            return res.status(400).json({ success: false, error: 'Current password incorrect' });
        }

        user.password = newPassword;
        await user.save();

        res.status(200).json({ success: true, message: 'Password updated successfully' });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Forgot Password
// @route   POST /api/v1/auth/forgotpassword
exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        let user = await SuperAdmin.findOne({ where: { email } });
        let isEmployee = false;

        if (!user) {
            user = await Employee.findOne({ where: { email } });
            isEmployee = true;
        }

        if (!user) {
            return res.status(404).json({ success: false, error: 'There is no user with that email' });
        }

        const resetToken = crypto.randomBytes(20).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        // Keep reset links valid for 30 minutes to reduce user-facing expiry failures.
        const expire = Date.now() + 30 * 60 * 1000;

        user.resetPasswordToken = hashedToken;
        user.resetPasswordExpire = expire;
        await user.save();

        const resetUrl = `${req.protocol}://${req.get('host')}/reset-password.html?token=${encodeURIComponent(resetToken)}${isEmployee ? '&role=employee' : ''}`;

        const message = `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
                <div style="background-color: #ef4444; color: white; padding: 20px; text-align: center;">
                    <h1 style="margin: 0;">Password Reset Request</h1>
                </div>
                <div style="padding: 20px;">
                    <p>Hello,</p>
                    <p>You are receiving this email because you (or someone else) has requested a password reset for your HRM Portal account.</p>
                    <p>Please click the button below to complete the process:</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${resetUrl}" style="background-color: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Reset Password</a>
                    </div>
                    <p style="word-break: break-all;">If the button does not open, copy and paste this link into your browser:<br><a href="${resetUrl}">${resetUrl}</a></p>
                    <p>This link is valid for <strong>30 minutes</strong>.</p>
                    <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                    <p style="font-size: 12px; color: #777;">This is an automated message, please do not reply to this email.</p>
                </div>
            </div>
        `;

        const textMessage = [
            'Password Reset Request',
            '',
            'You requested a password reset for your HRM Portal account.',
            'Open this link to reset your password:',
            resetUrl,
            '',
            'This link is valid for 30 minutes.',
            'If you did not request this, you can ignore this email.'
        ].join('\n');

        try {
            await sendEmail({
                email: user.email,
                subject: `Password Reset Token - ${new Date().toLocaleString()}`,
                html: message,
                text: textMessage
            });

            res.status(200).json({ success: true, data: 'Email sent' });
        } catch (err) {
            user.resetPasswordToken = null;
            user.resetPasswordExpire = null;
            await user.save();
            return res.status(500).json({ success: false, error: 'Email could not be sent' });
        }
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// @desc    Reset Password
// @route   PUT /api/v1/auth/resetpassword/:resettoken
exports.resetPassword = async (req, res) => {
    try {
        const { role } = req.query;
        const resetPasswordToken = crypto.createHash('sha256').update(req.params.resettoken).digest('hex');

        let Model = SuperAdmin;
        if (role === 'employee') {
            Model = Employee;
        }

        const user = await Model.findOne({
            where: {
                resetPasswordToken,
                resetPasswordExpire: {
                    [Op.gt]: Date.now()
                }
            }
        });

        if (!user) {
            return res.status(400).json({ success: false, error: 'Invalid or expired token' });
        }

        user.password = req.body.password;
        user.resetPasswordToken = null;
        user.resetPasswordExpire = null;
        await user.save();

        res.status(200).json({
            success: true,
            message: 'Password reset successful. You can now login with your new password.'
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};
