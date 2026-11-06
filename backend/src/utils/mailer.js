const nodemailer = require('nodemailer');

// On our machines these settings point to Mailtrap; on the published site
// they point to Resend (docs/deployment.md).
const transporter = nodemailer.createTransport({
    host: process.env.MAILTRAP_HOST,
    port: Number(process.env.MAILTRAP_PORT),
    auth: {
        user: process.env.MAILTRAP_USER,
        pass: process.env.MAILTRAP_PASS,
    },
});

// Resend only sends from the domain verified in its account, so the
// published site sets MAIL_FROM. Mailtrap accepts any address.
const remitente = {
    name: 'PARKEA',
    address: process.env.MAIL_FROM || 'no-reply@parkea.com',
};

async function enviarCorreoRecuperacion(destinatario, resetUrl) {
    await transporter.sendMail({
        from: remitente,
        to: destinatario,
        subject: 'Recupera tu contraseña de PARKEA',
        // Plain-text copy for email apps that do not show HTML. Spam filters
        // also distrust emails that only come in HTML.
        text: [
            'Recupera tu contraseña',
            '',
            'Recibimos una solicitud para restablecer tu contraseña de PARKEA.',
            'Abre el siguiente enlace para crear una nueva contraseña. Este enlace es válido por 1 hora y solo se puede usar una vez.',
            '',
            resetUrl,
            '',
            'Si no solicitaste esto, puedes ignorar este correo con tranquilidad.',
        ].join('\n'),
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
