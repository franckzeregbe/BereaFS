const LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };

function createLogger(level = 'info') {
    const threshold = LEVELS[level] ?? LEVELS.info;
    const write = (name, stream) => (message, meta) => {
        if (LEVELS[name] > threshold) return;
        const line = `${new Date().toISOString()} ${name.toUpperCase().padEnd(5)} ${message}`;
        if (meta instanceof Error) stream(line, meta.stack || meta.message);
        else if (meta !== undefined) stream(line, meta);
        else stream(line);
    };
    return {
        error: write('error', console.error),
        warn: write('warn', console.warn),
        info: write('info', console.log),
        debug: write('debug', console.log)
    };
}

module.exports = { createLogger };
