const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { Usuario, Rol, EmailVerificationToken, AdminActionLog, sequelize } = require('../models');
const ErrorCodes = require('../constants/errorCodes');
const { crearEnlaceVerificacion, enviarEnlaceVerificacion } = require('./emailVerification.controller');

const SALT_ROUNDS = 10;

const CONFLICTS = {
    email: { code: ErrorCodes.EMAIL_ALREADY_REGISTERED, message: 'This email is already registered' },
    document: { code: ErrorCodes.DOCUMENT_ALREADY_REGISTERED, message: 'This document number is already registered' },
};

// HU-30: a new sign-up can take the place of an account only if it was never
// verified and none of its verification links is still valid
async function canBeReplaced(usuario, transaction) {
    if (usuario.emailVerifiedAt) return false;
    const validLinks = await EmailVerificationToken.count({
        where: { userId: usuario.id, usedAt: null, expiresAt: { [Op.gt]: new Date() } },
        transaction,
    });
    return validLinks === 0;
}

// HU-30: the document of an account that can be replaced goes to the new
// sign-up. That account never signed in, so it has no vehicles or
// reservations, and it is deleted (its links go with it, ON DELETE CASCADE).
// If an administrator already acted on it, the log needs it, so it only
// loses the document.
async function releaseDocument(usuario, transaction) {
    const logEntries = await AdminActionLog.count({
        where: { [Op.or]: [{ adminId: usuario.id }, { targetUserId: usuario.id }] },
        transaction,
    });
    if (logEntries > 0) {
        await usuario.update({ documentNumber: null }, { transaction });
    } else {
        await usuario.destroy({ transaction });
    }
}

// HU-01: User Registration
// HU-30: the account is created as not verified and gets an email with the
// verification link. An account that was never verified and whose links have
// all expired (24 hours) does not keep its email or document: a new sign-up
// takes its place, so nobody can block the email of another person for good.
// While its link is still valid, the email and the document stay taken.
async function register(req, res) {
    try {
        const { fullName, email, password, phone, documentType, documentNumber } = req.body;

        const existingEmail = await Usuario.findOne({ where: { email } });
        if (existingEmail && existingEmail.emailVerifiedAt) {
            return res.status(409).json(CONFLICTS.email);
        }

        const existingDocument = await Usuario.findOne({ where: { documentNumber } });
        const documentOfAnotherAccount =
            existingDocument && existingDocument.id !== existingEmail?.id ? existingDocument : null;
        if (documentOfAnotherAccount && documentOfAnotherAccount.emailVerifiedAt) {
            return res.status(409).json(CONFLICTS.document);
        }

        const defaultRole = await Rol.findOne({ where: { name: 'user' } });
        if (!defaultRole) {
            return res.status(500).json({ code: ErrorCodes.ROLE_NOT_CONFIGURED, message: 'Default role not configured. Run the roles seed.' });
        }

        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        const datos = {
            fullName,
            email,
            password: passwordHash,
            phone,
            documentType,
            documentNumber,
            roleId: defaultRole.id,
        };

        const result = await sequelize.transaction(async (transaction) => {
            // The accounts found above are read again, locked, because they
            // may have changed while the password was hashed (for example,
            // the owner opened the link of the email). They are locked in
            // the order of their ids, so two sign-ups never wait for each
            // other in a circle.
            const ids = [existingEmail?.id, documentOfAnotherAccount?.id].filter(Boolean).sort();
            const locked = {};
            for (const id of ids) {
                locked[id] = await Usuario.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
            }
            // An account only counts if it still has that email or document
            // (another sign-up may have replaced or deleted it meanwhile).
            // MySQL compares them without case, so this does too.
            const same = (a, b) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase();
            const emailAccount = existingEmail && same(locked[existingEmail.id]?.email, email)
                ? locked[existingEmail.id] : null;
            const documentAccount = documentOfAnotherAccount && same(locked[documentOfAnotherAccount.id]?.documentNumber, documentNumber)
                ? locked[documentOfAnotherAccount.id] : null;

            if (emailAccount && !(await canBeReplaced(emailAccount, transaction))) {
                return { conflict: CONFLICTS.email };
            }
            if (documentAccount && !(await canBeReplaced(documentAccount, transaction))) {
                return { conflict: CONFLICTS.document };
            }

            if (documentAccount) {
                await releaseDocument(documentAccount, transaction);
            }

            const usuario = emailAccount
                ? await emailAccount.update(datos, { transaction })
                : await Usuario.create(datos, { transaction });

            const token = await crearEnlaceVerificacion(usuario.id, transaction);
            return { usuario, token };
        });

        if (result.conflict) {
            return res.status(409).json(result.conflict);
        }

        enviarEnlaceVerificacion(result.usuario, result.token);

        return res.status(201).json({
            message: 'Registration complete. Check your email to verify your account.',
            user: { id: result.usuario.id, fullName: result.usuario.fullName, email: result.usuario.email },
        });
    } catch (error) {
        // Two sign-ups with the same new email or document at the same
        // moment: the database lets only one in, and the other one gets the
        // same 409 as if it had come a moment later
        if (error.name === 'SequelizeUniqueConstraintError') {
            const fields = Object.keys(error.fields || {}).join(' ');
            return res.status(409).json(fields.includes('document') ? CONFLICTS.document : CONFLICTS.email);
        }
        console.error(error);
        return res.status(500).json({ code: ErrorCodes.INTERNAL_ERROR, message: 'Error registering user' });
    }
}

// HU-05: User Login
async function login(req, res) {
    try {
        const { email, password } = req.body;

        const usuario = await Usuario.findOne({ where: { email }, include: { model: Rol, as: 'role' } });
        if (!usuario) {
            return res.status(401).json({ code: ErrorCodes.INVALID_CREDENTIALS, message: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, usuario.password);
        if (!validPassword) {
            return res.status(401).json({ code: ErrorCodes.INVALID_CREDENTIALS, message: 'Invalid credentials' });
        }

        if (!usuario.isActive) {
            return res.status(403).json({ code: ErrorCodes.ACCOUNT_DEACTIVATED, message: 'This account has been deactivated' });
        }

        // HU-30 (AC-04): checked only after the right password, so it never
        // reveals whether an email is registered
        if (!usuario.emailVerifiedAt) {
            return res.status(403).json({ code: ErrorCodes.EMAIL_NOT_VERIFIED, message: 'Please verify your email before signing in' });
        }

        const token = jwt.sign(
            { id: usuario.id, email: usuario.email, rol: usuario.role.name },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
        );

        return res.status(200).json({
            message: 'Login successful',
            token,
            user: { id: usuario.id, fullName: usuario.fullName, email: usuario.email, role: usuario.role.name },
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ code: ErrorCodes.INTERNAL_ERROR, message: 'Error logging in' });
    }
}

// HU-06: Administrator Login
async function loginAdmin(req, res) {
    try {
        const { email, password } = req.body;

        const usuario = await Usuario.findOne({ where: { email }, include: { model: Rol, as: 'role' } });
        if (!usuario) {
            return res.status(401).json({ code: ErrorCodes.INVALID_CREDENTIALS, message: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, usuario.password);
        if (!validPassword) {
            return res.status(401).json({ code: ErrorCodes.INVALID_CREDENTIALS, message: 'Invalid credentials' });
        }

        if (!usuario.isActive) {
            return res.status(403).json({ code: ErrorCodes.ACCOUNT_DEACTIVATED, message: 'This account has been deactivated' });
        }

        // HU-30 (AC-04): checked only after the right password, so it never
        // reveals whether an email is registered
        if (!usuario.emailVerifiedAt) {
            return res.status(403).json({ code: ErrorCodes.EMAIL_NOT_VERIFIED, message: 'Please verify your email before signing in' });
        }

        // Credentials are valid at this point — unlike wrong credentials, revealing
        // that the account lacks admin privileges is intentional and required (AC-06)
        if (usuario.role.name !== 'admin') {
            return res.status(403).json({ code: ErrorCodes.NOT_ADMIN_ACCOUNT, message: 'This account does not have administrator privileges' });
        }

        const token = jwt.sign(
            { id: usuario.id, email: usuario.email, rol: usuario.role.name },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
        );

        return res.status(200).json({
            message: 'Login successful',
            token,
            user: { id: usuario.id, fullName: usuario.fullName, email: usuario.email, role: usuario.role.name },
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ code: ErrorCodes.INTERNAL_ERROR, message: 'Error logging in' });
    }
}

module.exports = { register, login, loginAdmin };
