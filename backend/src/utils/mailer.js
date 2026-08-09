const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.MAILTRAP_HOST,
    port: Number(process.env.MAILTRAP_PORT),
    auth: {
        user: process.env.MAILTRAP_USER,
        pass: process.env.MAILTRAP_PASS,
    },
});

async function enviarCorreoRecuperacion(destinatario, resetUrl) {
    await transporter.sendMail({
        from: '"PARKEA" <no-reply@parkea.com>',
        to: destinatario,
        subject: 'Recupera tu contraseña de PARKEA',
        html: `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #1F6B4D;">Recupera tu contraseña</h2>
        <p>Recibimos una solicitud para restablecer tu contraseña de PARKEA.</p>
        <p>Haz clic en el siguiente enlace para crear una nueva contraseña. Este enlace es válido por 1 hora y solo se puede usar una vez.</p>
        <p style="margin: 24px 0;">
        <a href="${resetUrl}" style="background:#1F6B4D; color:#fff; padding:10px 20px; border-radius:8px; text-decoration:none;">
            Crear nueva contraseña
        </a>
        </p>
        <p style="color:#666; font-size: 13px;">Si no solicitaste esto, puedes ignorar este correo con tranquilidad.</p>
    </div>
    `,
    });
}

module.exports = { enviarCorreoRecuperacion };