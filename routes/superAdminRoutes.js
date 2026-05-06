const express = require('express');
const { login, register, registerPublic, registerEmployee, getUsers, deleteUser, getMe, updateDetails, updatePassword, forgotPassword, resetPassword, getTrialManagers, updateTrial } = require('../controllers/superAdminController');
const { protect, authorize } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

const router = express.Router();

router.post('/login', login);
router.post('/forgotpassword', forgotPassword);
router.put('/resetpassword/:resettoken', resetPassword);
// Public self-registration endpoint
router.post('/register/public', registerPublic);
router.post('/register/employee', registerEmployee);
// Protecting register so only Super Admins can add other admins
router.post('/register', protect, authorize('Super Admin'), register);
router.get('/users', protect, authorize('Super Admin', 'Admin'), getUsers);
router.delete('/users/:id', protect, authorize('Super Admin'), deleteUser);

// Trial Management
router.get('/trials', protect, authorize('Super Admin', 'Admin'), getTrialManagers);
router.put('/trials/:id', protect, authorize('Super Admin', 'Admin'), updateTrial);

router.get('/me', protect, getMe);
router.put('/updatedetails', protect, upload.single('profile_photo'), updateDetails);
router.put('/updatepassword', protect, updatePassword);

module.exports = router;
