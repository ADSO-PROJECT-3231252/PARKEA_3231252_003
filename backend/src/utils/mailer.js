const nodemailer = require('nodemailer');
const { buildEmail } = require('./emailLayout');

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

// HU-07: password recovery email, with the shared PARKEA layout (#280).
async function enviarCorreoRecuperacion(destinatario, resetUrl, primerNombre) {
    const email = buildEmail({
        title: 'Recupera tu contraseña',
        preview: 'Usa el enlace para crear una nueva contraseña. Vence en 1 hora.',
        firstName: primerNombre,
        message: 'Recibimos una solicitud para restablecer la contraseña de tu cuenta de PARKEA. Haz clic en el botón para crear una nueva.',
        buttonLabel: 'Crear nueva contraseña',
        url: resetUrl,
        note: 'El enlace vence en **1 hora** y solo se puede usar **una vez**.',
        notYou: 'Ignora este correo: tu contraseña no cambiará.',
    });

    await transporter.sendMail({
        from: remitente,
        to: destinatario,
        subject: 'Recupera tu contraseña de PARKEA',
        ...email,
    });
}

// HU-30: email verification, with the same layout as the recovery email.
async function enviarCorreoVerificacion(destinatario, verifyUrl, primerNombre) {
    const email = buildEmail({
        title: 'Confirma tu correo',
        preview: 'Activa tu cuenta de PARKEA con este enlace. Vence en 24 horas.',
        firstName: primerNombre,
        message: 'Gracias por registrarte en PARKEA. Para activar tu cuenta, confirma que este correo es tuyo con el botón.',
        buttonLabel: 'Confirmar mi correo',
        url: verifyUrl,
        note: 'El enlace vence en **24 horas** y solo se puede usar **una vez**.',
        notYou: 'Ignora este correo: la cuenta no se activará.',
    });

    await transporter.sendMail({
        from: remitente,
        to: destinatario,
        subject: 'Confirma tu correo de PARKEA',
        ...email,
    });
}

module.exports = { enviarCorreoRecuperacion, enviarCorreoVerificacion };
