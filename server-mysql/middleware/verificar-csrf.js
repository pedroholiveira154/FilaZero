// Middleware e função auxiliar para proteger operações que alteram dados.
const crypto = require('crypto');

// Cria um token aleatório e o mantém na sessão do usuário.
function criarTokenCsrf(req) {
    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }
    return req.session.csrfToken;
}

// Compara o token enviado pelo frontend com o token guardado na sessão.
function exigirCsrf(req, res, next) {
    const recebido = req.get('X-CSRF-Token');
    const esperado = req.session?.csrfToken;

    if (typeof recebido !== 'string' || typeof esperado !== 'string') {
        return res.status(403).json({
            erro: 'Token de segurança ausente ou inválido.'
        });
    }

    const a = Buffer.from(recebido);
    const b = Buffer.from(esperado);

    // Confere o tamanho antes da comparação de tempo constante.
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return res.status(403).json({
            erro: 'Token de segurança inválido.'
        });
    }

    next();
}

module.exports = { criarTokenCsrf, exigirCsrf };
