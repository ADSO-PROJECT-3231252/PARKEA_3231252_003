const path = require('path');

// Colors of the app theme (frontend/src/index.css). Email apps do not read
// CSS variables, so the values are written here.
const COLORS = {
    green: '#1F6B4D', // parkea-600
    greenDark: '#17503A', // parkea-700
    green50: '#ECF7F1', // parkea-50
    green100: '#D0EADD', // parkea-100
    background: '#F6F8F7', // neutral-50
    line: '#DCE0DE', // neutral-200
    text: '#161A18', // neutral-900
    muted: '#545B58', // neutral-600
};

// Email apps do not load web fonts, so the emails use Arial.
const FONT = "Arial, 'Helvetica Neue', Helvetica, sans-serif";

// The logo travels inside the email as an inline attachment, so it shows
// even if the published site is down. The HTML points to it with cid:.
const LOGO_CID = 'parkea-logo';
const LOGO_ATTACHMENT = {
    filename: 'parkea-logo.png',
    path: path.join(__dirname, '..', 'assets', 'logo-email.png'),
    cid: LOGO_CID,
};

const FOOTER_LINES = [
    `PARKEA © ${new Date().getFullYear()} · Sistema de Reservas de Parqueo Urbano · Colombia`,
    'Este correo se envió automáticamente; por favor no lo respondas.',
];

// Names come from the users, so they are escaped before going into the HTML.
function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// The note allows **bold** words: they become <strong> in the HTML and plain
// words in the text copy.
function noteToHtml(note) {
    return escapeHtml(note).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function noteToText(note) {
    return note.replace(/\*\*(.+?)\*\*/g, '$1');
}

/**
 * Builds a PARKEA email with the shared layout: logo, title, greeting, text,
 * button, highlighted note, the full link, "¿No fuiste tú?" and the footer.
 * Returns the HTML, the plain-text copy and the logo attachment, ready for
 * nodemailer.
 */
function buildEmail({ title, preview, firstName, message, buttonLabel, url, note, notYou }) {
    const greeting = firstName ? `Hola, ${firstName}:` : 'Hola:';

    const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.background};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.background};">
  <tr><td align="center" style="padding:32px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#FFFFFF;border:1px solid ${COLORS.line};border-radius:12px;overflow:hidden;">
      <tr><td align="center" style="background:${COLORS.green50};padding:28px 24px;border-bottom:1px solid ${COLORS.green100};">
        <img src="cid:${LOGO_CID}" width="160" height="55" alt="PARKEA" style="display:block;border:0;width:160px;height:auto;">
      </td></tr>
      <tr><td style="padding:24px 32px 8px;font-family:${FONT};color:${COLORS.text};">
        <h1 style="margin:0 0 16px;font-size:24px;line-height:30px;font-weight:bold;color:${COLORS.text};">${escapeHtml(title)}</h1>
        <p style="margin:0 0 12px;font-size:16px;line-height:24px;word-break:break-word;">${escapeHtml(greeting)}</p>
        <p style="margin:0 0 24px;font-size:16px;line-height:24px;">${escapeHtml(message)}</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
          <tr><td align="center" bgcolor="${COLORS.green}" style="border-radius:8px;">
            <a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:8px;">${escapeHtml(buttonLabel)}</a>
          </td></tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
          <tr><td style="background:${COLORS.green50};border-left:4px solid ${COLORS.green};border-radius:6px;padding:12px 16px;font-family:${FONT};font-size:14px;line-height:21px;color:${COLORS.greenDark};">
            ${noteToHtml(note)}
          </td></tr>
        </table>
        <p style="margin:0 0 8px;font-size:14px;line-height:21px;color:${COLORS.muted};">Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
        <p style="margin:0 0 24px;font-size:13px;line-height:20px;word-break:break-all;"><a href="${escapeHtml(url)}" style="color:${COLORS.green};">${escapeHtml(url)}</a></p>
      </td></tr>
      <tr><td style="padding:0 32px;"><div style="border-top:1px solid ${COLORS.line};font-size:0;line-height:0;">&nbsp;</div></td></tr>
      <tr><td style="padding:16px 32px 28px;font-family:${FONT};font-size:14px;line-height:21px;color:${COLORS.muted};">
        <strong style="color:${COLORS.text};">¿No fuiste tú?</strong> ${escapeHtml(notYou)}
      </td></tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
      <tr><td align="center" style="padding:20px 24px 0;font-family:${FONT};font-size:12px;line-height:18px;color:${COLORS.muted};">
        ${FOOTER_LINES.map(escapeHtml).join('<br>')}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

    // Plain-text copy for email apps that do not show HTML. Spam filters
    // also distrust emails that only come in HTML.
    const text = [
        title,
        '',
        greeting,
        '',
        message,
        '',
        `${buttonLabel}:`,
        url,
        '',
        noteToText(note),
        '',
        `¿No fuiste tú? ${notYou}`,
        '',
        ...FOOTER_LINES,
    ].join('\n');

    return { html, text, attachments: [LOGO_ATTACHMENT] };
}

module.exports = { buildEmail, escapeHtml, LOGO_CID };
