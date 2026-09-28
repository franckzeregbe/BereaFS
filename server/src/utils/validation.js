const { HttpError } = require('./http');

const COURSE_TAGS = ['fondements', 'theologie', 'pratique', 'avance'];
const COURSE_STATUSES = ['draft', 'active', 'archived'];
const PASSWORD_RULE_MESSAGE = 'Utilisez au moins 8 caractères, avec une majuscule, une minuscule et un chiffre.';

const isStrongPassword = (password) => typeof password === 'string'
    && password.length >= 8
    && password.length <= 128
    && /[A-Z]/.test(password)
    && /[a-z]/.test(password)
    && /[0-9]/.test(password);

const isValidEmail = (email) => typeof email === 'string'
    && email.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const isCountryCode = (value) => typeof value === 'string' && /^[A-Z]{2}$/.test(value);

/** Paramètre d'URL numérique → entier positif, sinon 400. */
function parseId(value) {
    if (!/^\d+$/.test(String(value))) throw new HttpError(400, 'ID invalide.');
    return Number(value);
}

/** Texte optionnel : undefined si absent, sinon chaîne nettoyée et bornée. */
function optionalText(value, { field, max = 5000, stripTags = false } = {}) {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'string') throw new HttpError(400, `Champ invalide : ${field}.`);
    const trimmed = stripTags ? value.trim().replace(/[<>]/g, '') : value.trim();
    if (trimmed.length > max) throw new HttpError(400, `Champ trop long : ${field}.`);
    return trimmed;
}

function requiredText(value, options) {
    const text = optionalText(value, options);
    if (!text) throw new HttpError(400, `Champ requis : ${options.field}.`);
    return text;
}

function optionalInt(value, { field, min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
    if (value === undefined || value === null || value === '') return undefined;
    const n = Number(value);
    if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `Valeur invalide : ${field}.`);
    return n;
}

// URL de média : chemin local (/uploads/..., /api/stream/...) ou http(s).
function optionalMediaUrl(value, field) {
    const url = optionalText(value, { field, max: 500 });
    if (!url) return url;
    if (url.startsWith('/') && !url.startsWith('//')) return url;
    if (/^https?:\/\//i.test(url)) return url;
    throw new HttpError(400, `URL invalide : ${field}.`);
}

const toInitials = (name) => name.split(/\s+/).filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase();

function formatBytes(bytes) {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

module.exports = {
    COURSE_TAGS,
    COURSE_STATUSES,
    PASSWORD_RULE_MESSAGE,
    isStrongPassword,
    isValidEmail,
    isCountryCode,
    parseId,
    optionalText,
    requiredText,
    optionalInt,
    optionalMediaUrl,
    toInitials,
    formatBytes
};
