const bcrypt = require('bcrypt');
const { Usuario } = require('../models');

const register = async (req, res) => {
    try {
        const { fullName, email, password, phone } = req.body;

        const usuarioExistente = await Usuario.findOne({
            where: { email }
        });

        if (usuarioExistente) {
            return res.status(400).json({
                message: 'El correo electrónico ya está registrado'
            });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const usuario = await Usuario.create({
            fullName,
            email,
            password: passwordHash,
            phone,
            roleId: 'a1b2c3d4-0000-0000-0000-000000000002'
        });

        return res.status(201).json({
            message: 'Usuario registrado correctamente',
            usuario: {
                id: usuario.id,
                fullName: usuario.fullName,
                email: usuario.email,
                phone: usuario.phone,
                roleId: usuario.roleId
            }
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            message: 'Error al registrar usuario'
        });
    }
};

const jwt = require('jsonwebtoken');

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const usuario = await Usuario.findOne({
            where: { email }
        });

        if (!usuario) {
            return res.status(401).json({
                message: 'Credenciales inválidas'
            });
        }

        const passwordCorrecta = await bcrypt.compare(
            password,
            usuario.password
        );

        if (!passwordCorrecta) {
            return res.status(401).json({
                message: 'Credenciales inválidas'
            });
        }

        const token = jwt.sign(
            {
                id: usuario.id,
                email: usuario.email,
                roleId: usuario.roleId
            },
            process.env.JWT_SECRET,
            {
                expiresIn: process.env.JWT_EXPIRES_IN
            }
        );

        return res.status(200).json({
            message: 'Login exitoso',
            token
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            message: 'Error al iniciar sesión'
        });
    }
};

module.exports = {
    register,
    login
};