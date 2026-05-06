const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { ChatMessage, Employee, Leave, SuperAdmin, Company, HeaderSetting, AboutSetting, ContactSetting, Notification } = require('../models');
const { callGroqChat } = require('../services/groqClient');
const { sequelize } = require('../config/db');
const { sendQueryResponseEmail } = require('../services/emailService');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

const normalizeIdentity = (value) => (value || '').toString().trim().toLowerCase();

// Helper function to send global notifications
const sendGlobalNotification = async (notificationData) => {
    try {
        console.log('🔧 sendGlobalNotification called with:', notificationData);
        const globalNotificationService = global.globalNotificationService;
        console.log('🔧 Global notification service exists:', !!globalNotificationService);
        if (globalNotificationService) {
            const result = await globalNotificationService.sendGlobalNotification(notificationData);
            console.log('✅ Global notification sent successfully');
            return result;
        } else {
            console.error('❌ Global notification service not available');
            return { success: false, error: 'Service not available' };
        }
    } catch (error) {
        console.error('❌ Error sending global notification:', error);
    }
};

const SYSTEM_PROMPTS = {
    public: 'You are a friendly help desk assistant for a HRM platform. Explain the company, platform features, and how to login or navigate. Keep responses concise and helpful.',
    employee: 'You are an HR assistant for employees. Help with HR policies, leave info, salary basics (no sensitive data), and general platform guidance. Be friendly and clear.',
    manager: 'You are a professional assistant for managers. Help with team management, reports, approvals, and employee-related queries. Be concise and professional.',
    admin: 'You are a system assistant for administrators. Help with platform administration, configuration, and overall system guidance. Be precise and helpful.'
};

const FORMAT_INSTRUCTIONS = 'Give concise answers. Use one line for simple queries. Use bullets for lists. Avoid unnecessary explanations unless asked. Highlight important values with **bold**.';

const getCompanyContext = async () => {
    try {
        const [header, about, contact] = await Promise.all([
            HeaderSetting.findOne(),
            AboutSetting.findOne(),
            ContactSetting.findOne()
        ]);

        let context = 'Company Information:\n';
        context += `Name: ${header?.title || 'HRM Solutions LLC'}\n`;
        context += `Tagline: ${header?.subtitle || 'Empowering Next-Gen Workforce'}\n`;
        context += `Description: ${about?.description || 'A cutting-edge HRM platform for modern enterprises.'}\n`;
        context += `Mission: ${about?.mission || 'To empower organizations with an intuitive platform.'}\n`;
        context += `Contact Email: ${contact?.email || 'contact@hrm.com'}\n`;
        context += `Contact Phone: ${contact?.phone || '+1 (555) 123-4567'}\n`;
        context += `Address: ${contact?.address || '123 Business Avenue, Suite 100, New York, NY 10001'}\n`;
        
        return context;
    } catch (err) {
        console.error('[Chat] Failed to fetch company context:', err);
        return 'Company: HRM Solutions LLC\nEmail: contact@hrm.com\nPhone: +1 (555) 123-4567\n';
    }
};

const normalize = (text) => (text || '').toLowerCase().trim();

const isSimpleQuestion = (message) => {
    const msg = normalize(message);
    const keywords = ['how many', 'count', 'total', 'number of'];
    return keywords.some(k => msg.includes(k));
};

const wantsExplanation = (message) => {
    const msg = normalize(message);
    return msg.includes('explain') || msg.includes('summary') || msg.includes('details') || msg.includes('why') || msg.includes('elaborate');
};

const isDatabaseQuestion = (message) => {
    const msg = normalize(message);
    const keywords = [
        'employee', 'employees', 'team', 'team members', 'under me', 'active employees',
        'company', 'companies', 'active companies',
        'leave', 'leaves', 'on leave', 'leave balance', 'leave today',
        'attendance', 'report', 'reports'
    ];
    return keywords.some(k => msg.includes(k));
};

const getToday = () => {
    try {
        // Use local date to avoid UTC offset issues
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    } catch (e) {
        return new Date().toISOString().split('T')[0];
    }
};

const daysBetween = (start, end) => {
    const s = new Date(start);
    const e = new Date(end);
    const diff = Math.floor((e - s) / (1000 * 60 * 60 * 24));
    return diff + 1;
};

const resolveEmployeeByEmail = async (email) => {
    if (!email) return null;
    return Employee.findOne({ where: { email } });
};

const ensureManagerEmployeeRecord = async (email) => {
    if (!email) return null;
    let emp = await Employee.findOne({ where: { email } });
    if (emp) return emp;
    const admin = await SuperAdmin.findOne({ where: { email, role: 'Manager' } });
    if (!admin) return null;
    emp = await Employee.create({
        employee_name: admin.name || 'Manager',
        email: admin.email,
        role: 'Employee',
        designation: 'Manager',
        department: 'Management',
        joining_date: new Date()
    });
    return emp;
};

const buildList = (title, items) => {
    if (!items.length) return title + '\n- **None found**';
    return [title, ...items.map(i => `- ${i}`)].join('\n');
};

const findEmployeeByNameInMessage = async (message, role, managerEmp) => {
    const msg = normalize(message);
    let scope = [];
    if (role === 'admin') {
        scope = await Employee.findAll({ attributes: ['employee_id', 'employee_name', 'email', 'manager_id'] });
    } else if (role === 'manager') {
        if (!managerEmp) return null;
        scope = await Employee.findAll({ where: { manager_id: managerEmp.employee_id }, attributes: ['employee_id', 'employee_name', 'email', 'manager_id'] });
        if (!scope.length) {
            // Fallback to all employees when manager/team mapping is not set
            scope = await Employee.findAll({ attributes: ['employee_id', 'employee_name', 'email', 'manager_id'] });
        }
    } else if (role === 'employee') {
        if (!managerEmp) return null;
        scope = [managerEmp];
    }

    const found = scope.find(e => e.employee_name && msg.includes(e.employee_name.toLowerCase()));
    return found || null;
};

const handleDatabaseQuery = async ({ message, role, userId }) => {
    const msg = normalize(message);
    const today = getToday();
    let employee = null;

    if (role === 'employee') {
        employee = await resolveEmployeeByEmail(userId);
    }
    if (role === 'manager') {
        employee = await ensureManagerEmployeeRecord(userId);
    }

    // Team / employee count
    if ((msg.includes('how many') || msg.includes('count') || msg.includes('total') || msg.includes('number of')) && (msg.includes('employee') || msg.includes('team'))) {
        let where = {};
        if (role === 'manager') {
            if (!employee) return { text: 'I could not find your employee record to locate your team.', simple: true };
            where.manager_id = employee.employee_id;
        }
        
        if (msg.includes('active')) {
            where.status = 'Active';
        }

        const count = await Employee.count({ where });
        const scope = (role === 'manager') ? 'team members' : 'employees in total';
        const type = (msg.includes('active')) ? 'active ' : '';
        
        return { text: `You have **${count}** ${type}${scope}.`, simple: true };
    }

    // Team list
    if ((msg.includes('list') || msg.includes('show')) && (msg.includes('team') || msg.includes('my employees') || msg.includes('team members') || msg.includes('employees'))) {
        if (role === 'manager') {
            if (!employee) return { text: 'I could not find your employee record to locate your team.', simple: false };
            const team = await Employee.findAll({ where: { manager_id: employee.employee_id }, order: [['employee_name', 'ASC']] });
            const items = team.map(t => `**${t.employee_name}** (ID: ${t.employee_id})`);
            return { text: buildList('Your team members:', items), simple: false };
        }
        if (role === 'admin') {
            const all = await Employee.findAll({ order: [['employee_name', 'ASC']] });
            const items = all.map(t => `**${t.employee_name}** (ID: ${t.employee_id})`);
            return { text: buildList('All employees:', items), simple: false };
        }
        return { text: 'You do not have team access for this request.', simple: false };
    }

    // Company count (Admin only)
    if ((msg.includes('how many') || msg.includes('count') || msg.includes('total') || msg.includes('number of')) && (msg.includes('company') || msg.includes('companies'))) {
        console.log('[Chat] Company count query matched:', msg, 'Role:', role);
        if (role === 'admin') {
            let where = {};
            if (msg.includes('active')) {
                where.status = 'Active';
            }
            const count = await Company.count({ where });
            const type = (msg.includes('active')) ? 'active ' : '';
            return { text: `There are **${count}** ${type}companies on the platform.`, simple: true };
        }
        return { text: 'You do not have access to company data.', simple: true };
    }

    // Who is on leave today
    if (
        (msg.includes('on leave') && msg.includes('today')) ||
        (msg.includes('leave') && msg.includes('today') && (msg.includes('who') || msg.includes('take') || msg.includes('taking') || msg.includes('leave today')))
    ) {
        if (role === 'employee') {
            if (!employee) return { text: 'I could not find your employee record to check leave status.', simple: true };
            const onLeave = await Leave.findOne({
                where: {
                    employee_id: employee.employee_id,
                    status: 'Approved',
                    start_date: { [Op.lte]: today },
                    end_date: { [Op.gte]: today }
                }
            });
            return { text: onLeave ? 'You are **on leave today**.' : 'You are **not on leave today**.', simple: true };
        }
        const where = {
            status: 'Approved',
            start_date: { [Op.lte]: today },
            end_date: { [Op.gte]: today }
        };
        if (role === 'manager') {
            if (!employee) return { text: 'I could not find your employee record to locate your team.', simple: false };
            const teamIds = await Employee.findAll({ where: { manager_id: employee.employee_id }, attributes: ['employee_id'] });
            const ids = teamIds.map(t => t.employee_id);
            if (ids.length) {
                where.employee_id = ids;
            }
        }
        const leaves = await Leave.findAll({ where, include: [Employee], order: [['start_date', 'ASC']] });
        const items = leaves.map(l => `**${l.Employee ? l.Employee.employee_name : 'Employee'}** (${l.leave_type})`);
        return { text: buildList(`Employees on leave today (${today}):`, items), simple: false };
    }

    // Specific person leave status/history
    if (msg.includes('leave') && (msg.includes('took') || msg.includes('take') || msg.includes('on leave') || msg.includes('leave'))) {
        const target = await findEmployeeByNameInMessage(message, role, employee);
        if (target) {
            const latest = await Leave.findOne({
                where: { employee_id: target.employee_id },
                order: [['start_date', 'DESC']]
            });
            if (!latest) {
                return { text: `No leave records found for **${target.employee_name}**.`, simple: true };
            }
            return { text: `**${target.employee_name}** has a **${latest.status}** ${latest.leave_type} leave from **${latest.start_date}** to **${latest.end_date}**.`, simple: true };
        }
    }

    // Leave balance
    if (msg.includes('leave balance')) {
        if (!employee) {
            return { text: 'I could not find your employee record to check leave balance.', simple: true };
        }
        const leaves = await Leave.findAll({ where: { employee_id: employee.employee_id, status: 'Approved' } });
        const usedDays = leaves.reduce((sum, l) => sum + daysBetween(l.start_date, l.end_date), 0);
        return { text: `You have **${usedDays}** approved leave day(s) recorded.`, simple: true };
    }

    return { text: null, simple: false };
};

const isAdminContactRequest = (msg) => {
    const keywords = ['contact admin', 'talk to admin', 'redirect to admin', 'human help', 'talk to human', 'human assistant', 'contact hr', 'talk to hr', 'admin help', 'help desk'];
    return keywords.some(k => msg.toLowerCase().includes(k));
};

const extractTextFromFile = async (file) => {
    try {
        console.log(`[Chat] Extracting text from file: ${file.originalname} (${file.mimetype})`);
        const filePath = file.path;
        const mimetype = file.mimetype;
        const ext = path.extname(file.originalname).toLowerCase();
        let text = '';

        const isText = mimetype === 'text/plain' || mimetype === 'text/csv' || mimetype === 'application/json' || ext === '.md' || ext === '.txt' || ext === '.csv' || ext === '.json';
        const isPdf = mimetype === 'application/pdf' || ext === '.pdf';
        const isDocx = mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext === '.docx';

        if (isText) {
            text = fs.readFileSync(filePath, 'utf8');
        } else if (isPdf) {
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdfParse(dataBuffer);
            text = data.text;
        } else if (isDocx) {
            const data = await mammoth.extractRawText({ path: filePath });
            text = data.value;
        } else {
            console.warn(`[Chat] Unsupported file type for extraction: ${mimetype} (${ext})`);
        }

        if (!text || text.trim().length === 0) {
            console.warn(`[Chat] Extracted text is empty for file: ${file.originalname}`);
            return '';
        }

        console.log(`[Chat] Successfully extracted ${text.length} characters from ${file.originalname}`);
        // Limit to ~5000 chars to avoid token issues while still providing enough context
        return text.substring(0, 5000);
    } catch (err) {
        console.error('[Chat] File Extraction Error:', err);
        return '';
    }
};

exports.handleChat = async (req, res) => {
    try {
        const { message, role, userId } = req.body;
        const normalizedRole = normalize(role);
        const normalizedUserId = (userId || '').toString().trim().toLowerCase();

        if (!message || !normalizedRole || !normalizedUserId) {
            return res.status(400).json({ success: false, error: 'message, role, and userId are required' });
        }

        if (!SYSTEM_PROMPTS[normalizedRole]) {
            return res.status(400).json({ success: false, error: 'Invalid role' });
        }

        let responseText = '';
        let status = 'Open';
        
        const companyContext = await getCompanyContext();
        const baseSystemPrompt = `${companyContext}\n${SYSTEM_PROMPTS[normalizedRole]} ${FORMAT_INSTRUCTIONS}`;

        const adminRedirect = isAdminContactRequest(message);
        if (adminRedirect) {
            responseText = "I will redirect this message to admin";
            status = 'NeedsAdmin';
        }

        const dataQuery = !responseText && isDatabaseQuestion(message);
        const wantsExplain = wantsExplanation(message);

        if (dataQuery) {
            console.log('[Chat] Database question detected:', message, 'Role:', role);
            const dbResult = await handleDatabaseQuery({ message, role: normalizedRole, userId: normalizedUserId });
            if (dbResult.text) {
                if (wantsExplain) {
                    const systemPrompt = baseSystemPrompt;
                    const userMessage = `User asked: "${message}".\nHere are the exact data results:\n${dbResult.text}\nProvide a concise explanation only (no restating the list).`;
                    const explanation = await callGroqChat({ systemPrompt, userMessage });
                    responseText = `${dbResult.text}\n\n${explanation}`;
                } else {
                    responseText = dbResult.text;
                    if (!dbResult.simple && isSimpleQuestion(message)) {
                        responseText = dbResult.text.split('\n')[0];
                    }
                }
            } else {
                // STRICT DATA MODE: If it's a data query but we couldn't match the specific logic,
                // don't let it fall through to LLM which might hallucinate.
                responseText = "I found your question related to system data, but I couldn't calculate that specific metric. Please try asking 'total companies' or 'list employees'.";
            }
        }

        if (!responseText) {
            const systemPrompt = baseSystemPrompt;
            let finalUserMessage = message;

            if (req.file) {
                const extractedText = await extractTextFromFile(req.file);
                if (extractedText) {
                    finalUserMessage = `[System Note: The user has attached a file named "${req.file.originalname}". Below is the extracted text content from the file to help you answer the user's query.]\n\n--- Extracted Content Begin ---\n${extractedText}\n--- Extracted Content End ---\n\nUser's Question: ${message}`;
                }
            }

            responseText = await callGroqChat({ systemPrompt, userMessage: finalUserMessage });
            if (isSimpleQuestion(message) && !wantsExplain) {
                responseText = responseText.split('\n')[0];
            }
        }

        const record = await ChatMessage.create({
            userId: normalizedUserId,
            role: normalizedRole,
            message,
            response: responseText,
            status,
            timestamp: new Date(),
            fileUrl: req.file ? `/uploads/${req.file.filename}` : null,
            fileType: req.file ? req.file.mimetype : null,
            deleted: false
        });

        // Add Notification for Admin if user is not admin
        if (normalizedRole !== 'admin') {
            try {
                const admins = await SuperAdmin.findAll({ where: { role: { [Op.in]: ['Admin', 'Super Admin'] } } });
                for (const admin of admins) {
                    await Notification.create({
                        userId: admin.email,
                        role: 'admin',
                        message: `New message from ${normalizedUserId} (${normalizedRole})`,
                        type: 'chat_new',
                        timestamp: new Date()
                    });
                }

                // 🚀 SEND GLOBAL NOTIFICATION FOR EMPLOYEE/MANAGER MESSAGES
                await sendGlobalNotification({
                    senderRole: normalizedRole,
                    senderEmail: normalizedUserId,
                    message: message,
                    type: 'user_message',
                    recipientEmails: admins.map(admin => admin.email) // Send to all admins
                });
                console.log('🔔 Global notification sent for user message:', message.substring(0, 50) + '...');

                // Send email copy to admins when manager/employee reply in chat.
                if (normalizedRole === 'manager' || normalizedRole === 'employee') {
                    for (const admin of admins) {
                        if (!admin?.email || !admin.email.includes('@')) continue;
                        try {
                            await sendQueryResponseEmail({
                                to: admin.email.trim(),
                                userName: admin.name || 'Admin',
                                queryDetails: `${normalizedRole} (${normalizedUserId}) sent: ${message}`,
                                responseMessage: responseText || 'No assistant response generated.'
                            });
                        } catch (emailErr) {
                            console.error(`[Chat] Failed to send admin email notification to ${admin.email}:`, emailErr);
                        }
                    }
                }
            } catch (notifyErr) {
                console.error('[Chat] Failed to create admin notification:', notifyErr);
            }
        }

        res.status(200).json({
            success: true,
            response: responseText,
            id: record.id,
            timestamp: record.timestamp,
            fileUrl: record.fileUrl,
            deleted: record.deleted
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.getUserHistory = async (req, res) => {
    try {
        const { userId } = req.params;
        const role = (req.query.role || '').toLowerCase();
        const requestedUserId = (userId || '').toString().trim().toLowerCase();
        if (!requestedUserId || !role) return res.status(400).json({ success: false, error: 'userId and role are required' });

        if (role !== 'public') {
            const authHeader = req.headers.authorization || '';
            if (!authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ success: false, error: 'Not authorized' });
            }
            const token = authHeader.split(' ')[1];
            let decoded;
            try {
                decoded = jwt.verify(token, process.env.JWT_SECRET);
            } catch (e) {
                return res.status(401).json({ success: false, error: 'Not authorized' });
            }
            let userEmail = decoded.email ? String(decoded.email).toLowerCase() : null;
            if (!userEmail) {
                if (decoded.role === 'Employee') {
                    const emp = await Employee.findByPk(decoded.id);
                    if (emp && emp.email) userEmail = emp.email.toLowerCase();
                    if (!userEmail) {
                        const maybeAdmin = await SuperAdmin.findByPk(decoded.id);
                        if (maybeAdmin && maybeAdmin.email) userEmail = maybeAdmin.email.toLowerCase();
                    }
                } else {
                    const admin = await SuperAdmin.findByPk(decoded.id);
                    if (admin && admin.email) userEmail = admin.email.toLowerCase();
                    if (!userEmail) {
                        const maybeEmp = await Employee.findByPk(decoded.id);
                        if (maybeEmp && maybeEmp.email) userEmail = maybeEmp.email.toLowerCase();
                    }
                }
            }
            if (!userEmail || userEmail !== requestedUserId) {
                return res.status(403).json({ success: false, error: 'Forbidden' });
            }
        }

        const chats = await ChatMessage.findAll({
            where: {
                role,
                [Op.and]: [sequelize.where(sequelize.fn('lower', sequelize.col('userId')), requestedUserId)]
            },
            order: [['timestamp', 'ASC']]
        });
        res.status(200).json({ success: true, data: chats });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.getAllChats = async (req, res) => {
    try {
        const chats = await ChatMessage.findAll({ 
            order: [['timestamp', 'DESC']] 
        });

        // Manual join to avoid sync-breaking constraints
        const userIds = [...new Set(chats.map(c => c.userId).filter(id => id && id.includes('@')))];
        
        // Fetch from both Employee and SuperAdmin (Managers/Admins)
        const [employees, admins] = await Promise.all([
            Employee.findAll({
                where: { email: userIds },
                attributes: ['employee_name', 'email']
            }),
            SuperAdmin.findAll({
                where: { email: userIds },
                attributes: ['name', 'email', 'role']
            })
        ]);

        const userMap = new Map();
        employees.forEach(u => userMap.set(u.email.toLowerCase(), { name: u.employee_name, email: u.email }));
        admins.forEach(u => userMap.set(u.email.toLowerCase(), { name: u.name, email: u.email, role: u.role }));

        const data = chats.map(c => {
            const plain = c.get({ plain: true });
            if (plain.userId && userMap.has(plain.userId.toLowerCase())) {
                const userData = userMap.get(plain.userId.toLowerCase());
                plain.user = {
                    name: userData.name,
                    employee_name: userData.name, // compatibility
                    email: userData.email
                };
            }
            return plain;
        });

        res.status(200).json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.updateChatResponse = async (req, res) => {
    try {
        const chat = await ChatMessage.findByPk(req.params.id);
        if (!chat) return res.status(404).json({ success: false, error: 'Chat not found' });

        const { response } = req.body;
        if (!response) return res.status(400).json({ success: false, error: 'response is required' });

        // 🚀 SMART RESPONSE EDITING
        if (chat.sender_type === 'Admin') {
            await chat.update({ message: response });
        } else {
            await chat.update({ 
                response,
                status: 'HandledByAdmin'
            });
        }

        // Add Notification for User
        try {
            await Notification.create({
                userId: chat.userId,
                role: chat.role === 'public' ? 'employee' : chat.role, // Simple mapping for public if needed
                message: `An admin has updated the response to your message: "${chat.message.substring(0, 30)}..."`,
                type: 'chat_edit',
                timestamp: new Date()
            });
        } catch (notifyErr) {
            console.error('[Chat] Failed to create user notification:', notifyErr);
        }

        // Redundant direct socket emit removed. Now using Global Notification Service below.
        /*
        const io = req.app.get('io');
        if (io && chat.userId) {
            io.to(chat.userId).emit('new_notification', {
                title: 'Admin Response Updated',
                message: `An admin has updated the response to your message: "${chat.message.substring(0, 30)}..."`,
                type: 'chat_edit',
                timestamp: new Date()
            });
        }
        */

        // 🚀 SEND GLOBAL NOTIFICATION FOR CHAT EDIT
        try {
            await sendGlobalNotification({
                senderRole: 'admin',
                senderEmail: req.user?.email || 'admin@hrm.com',
                message: response,
                type: 'admin_message',
                recipientEmails: [chat.userId]
            });
            console.log('✅ Global notification sent for chat edit:', (response || '').substring(0, 50) + '...');
        } catch (globalNotifyErr) {
            console.error('❌ Failed to send global notification (Edit):', globalNotifyErr);
        }

        // Send Email Notification
        try {
            if (chat.userId && chat.userId.includes('@')) {
                let userName = chat.userId.split('@')[0];
                const emp = await Employee.findOne({ where: { email: chat.userId } });
                if (emp) {
                    userName = emp.employee_name;
                } else {
                    const admin = await SuperAdmin.findOne({ where: { email: chat.userId } });
                    if (admin) userName = admin.name;
                }

                await sendQueryResponseEmail({
                    to: chat.userId.trim(),
                    userName,
                    queryDetails: chat.message,
                    responseMessage: response
                });
                console.log(`[Chat] Email sent successfully to ${chat.userId}`);
                return res.status(200).json({ success: true, data: chat, emailSent: true });
            }
        } catch (emailErr) {
            console.error('[Chat] Failed to send email (Edit):', emailErr);
            return res.status(200).json({ success: true, data: chat, emailSent: false, error: emailErr.message || 'Email delivery failed' });
        }

        res.status(200).json({ success: true, data: chat });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.deleteMessageForEveryone = async (req, res) => {
    try {
        const chat = await ChatMessage.findByPk(req.params.id);
        if (!chat) return res.status(404).json({ success: false, error: 'Chat not found' });

        const requestedDeleted = req.body?.deleted;
        if (requestedDeleted !== true) {
            return res.status(400).json({ success: false, error: 'deleted must be true' });
        }

        const authHeader = req.headers.authorization || '';
        let requesterRole = '';
        let requesterId = normalizeIdentity(req.body?.userId || req.body?.requesterId);

        if (authHeader.startsWith('Bearer ')) {
            try {
                const token = authHeader.split(' ')[1];
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                requesterRole = normalizeIdentity(decoded.role);
                requesterId = requesterId || normalizeIdentity(decoded.email || decoded.userId || decoded.id);
            } catch {
                return res.status(401).json({ success: false, error: 'Not authorized' });
            }
        }

        const isPrivileged = ['admin', 'super admin'].includes(requesterRole);
        if (!isPrivileged && requesterId !== normalizeIdentity(chat.userId)) {
            return res.status(403).json({ success: false, error: 'Forbidden' });
        }

        await chat.update({ deleted: true });

        const io = req.app.get('io');
        if (io) {
            io.emit('chat-message-deleted', {
                id: chat.id,
                userId: chat.userId,
                role: chat.role,
                deleted: true,
                timestamp: new Date()
            });
        }

        return res.status(200).json({ success: true, data: chat });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
exports.getAdminSessions = async (req, res) => {
    try {
        const sessions = await ChatMessage.findAll({
            attributes: [
                'userId', 
                'role', 
                [sequelize.fn('MAX', sequelize.col('timestamp')), 'latestTimestamp'],
                [sequelize.fn('MAX', sequelize.col('status')), 'status']
            ],
            group: ['userId', 'role'],
            order: [[sequelize.fn('MAX', sequelize.col('timestamp')), 'DESC']]
        });
        
        // Transform to match user's expected format if needed
        const formatted = sessions.map(s => ({
            id: s.userId, // use userId as session ID for now
            user_name: s.userId.split('@')[0], 
            user_email: s.userId,
            role: s.role.charAt(0).toUpperCase() + s.role.slice(1),
            status: s.get('status'),
            latest: s.get('latestTimestamp')
        }));
        
        res.status(200).json({ success: true, data: formatted });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.getSessionMessages = async (req, res) => {
    try {
        const { session_id } = req.query; // the frontend passes session_id which we map to userId
        if (!session_id) return res.status(400).json({ success: false, error: 'session_id is required' });
        
        const messages = await ChatMessage.findAll({
            where: { userId: session_id },
            order: [['timestamp', 'ASC']]
        });
        
        // Wrap in Messages array to match user's .map logic
        res.status(200).json({ success: true, data: { Messages: messages } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.sendAdminReply = async (req, res) => {
    try {
        let { session_id, content, target_role } = req.body;
        session_id = (session_id || '').toString().trim();
        target_role = (target_role || '').toString().trim().toLowerCase();
        
        if (!session_id || !content) return res.status(400).json({ success: false, error: 'session_id and content are required' });

        // Create new message from Admin
        const msg = await ChatMessage.create({
            userId: session_id,
            role: target_role || 'public',
            message: content,
            response: null,
            sender_type: 'Admin',
            status: 'HandledByAdmin',
            timestamp: new Date(),
            fileUrl: req.file ? `/uploads/${req.file.filename}` : null,
            fileType: req.file ? req.file.mimetype : null
        });

        // Also update status of previous messages from this user
        await ChatMessage.update(
            { status: 'HandledByAdmin' },
            { where: { userId: session_id, status: 'NeedsAdmin' } }
        );

        // Add Notification for User
        try {
            await Notification.create({
                userId: session_id,
                role: target_role === 'public' ? 'employee' : target_role,
                message: `An admin has sent you a new message: "${content.substring(0, 30)}..."`,
                type: 'chat_new',
                timestamp: new Date()
            });
        } catch (notifyErr) {
            console.error('[Chat] Failed to create user notification:', notifyErr);
        }

        // Redundant direct socket emit removed. Now using Global Notification Service below.
        /*
        const io = req.app.get('io');
        if (io && session_id) {
            io.to(session_id).emit('new_notification', {
                title: 'New Admin Message',
                message: `An admin has sent you a new message: "${content.substring(0, 30)}..."`,
                type: 'chat_new',
                timestamp: new Date()
            });
        }
        */

        // Send Email Notification
        let emailSent = false;
        try {
            if (session_id && session_id.includes('@')) {
                let userName = session_id.split('@')[0];
                const emp = await Employee.findOne({ where: { email: session_id } });
                if (emp) {
                    userName = emp.employee_name;
                } else {
                    const admin = await SuperAdmin.findOne({ where: { email: session_id } });
                    if (admin) userName = admin.name;
                }

                // Get the original query (the last message from the user)
                const lastUserMsg = await ChatMessage.findOne({
                    where: { userId: session_id, sender_type: { [Op.ne]: 'Admin' } },
                    order: [['timestamp', 'DESC']]
                });
                const queryDetails = lastUserMsg ? lastUserMsg.message : 'No prior queries found.';

                await sendQueryResponseEmail({
                    to: session_id,
                    userName,
                    queryDetails,
                    responseMessage: content
                });
                console.log(`[Chat] Email sent successfully to ${session_id}`);
                emailSent = true;
            }
        } catch (emailErr) {
            console.error('[Chat] Failed to send email notification (Reply):', emailErr);
        }

        // 🚀 SEND GLOBAL NOTIFICATION TO ALL CONNECTED USERS
        console.log(`[Support] Sending reply notification to: ${session_id}`);
        try {
            const notifyResult = await sendGlobalNotification({
                senderRole: 'admin',
                senderEmail: req.user?.email || 'admin@hrm.com',
                message: content,
                type: 'admin_message',
                recipientEmails: [session_id] // Send to specific recipient
            });
            console.log('[Support] Global notification trigger result:', notifyResult);
        } catch (globalNotifyErr) {
            console.error('❌ Failed to send global notification:', globalNotifyErr);
        }

        res.status(200).json({ success: true, data: msg, emailSent });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.closeSession = async (req, res) => {
    try {
        const { id } = req.params;
        await ChatMessage.destroy({
            where: { userId: id }
        });
        res.status(200).json({ success: true, message: 'Session deleted and closed' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
