// Middleware responsável por validar a sessão e autorizar perfis específicos.
const pool = require('../db');
const production = process.env.NODE_ENV === 'production';

// Confere no banco se o usuário da sessão ainda existe e continua ativo.
// Isso invalida o acesso caso a conta seja desativada ou seu perfil seja alterado.
function verificarUsuarioSessao(req, res, next) {
    if (!req.session?.usuario) {
        return res.status(401).json({
            erro: 'Faça login para continuar.'
        });
    }

    pool.execute(
        'SELECT id, perfil, ativo FROM usuarios WHERE id = ? LIMIT 1',
        [req.session.usuario.id]
    ).then(([usuarios]) => {
        const conta = usuarios[0];

        if (!conta || !conta.ativo) {
            return req.session.destroy(() => {
                // Remove o cookie do navegador ao invalidar uma sessão.
                res.clearCookie('sid', {
                    httpOnly: true,
                    secure: production,
                    sameSite: 'lax',
                    path: '/'
                });
                res.status(401).json({
                    erro: 'Sua sessão expirou ou a conta foi desativada. Faça login novamente.'
                });
            });
        }

        // Atualiza as informações da sessão com os valores atuais do banco.
        req.session.usuario.id = conta.id;
        req.session.usuario.perfil = conta.perfil;
        next();
    }).catch(next);
}

// Exige apenas que o usuário esteja autenticado.
function exigirLogin(req, res, next) {
    verificarUsuarioSessao(req, res, next);
}

module.exports = { verificarUsuarioSessao, exigirLogin };
