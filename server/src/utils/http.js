class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

// Transmet les rejets de promesses au middleware d'erreurs d'Express 4.
const asyncHandler = (handler) => (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
};

module.exports = { HttpError, asyncHandler };
