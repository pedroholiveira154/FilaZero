// Middleware de autorização: limita a rota aos perfis explicitamente permitidos.
const { verificarUsuarioSessao } = require('./verificar-autenticacao');

// Recebe um ou mais perfis aceitos, por exemplo: exigirPerfil('admin').
function exigirPerfil(...perfis) {
    return (req, res, next) => {
        verificarUsuarioSessao(req, res, () => {
            if (!perfis.includes(req.session.usuario.perfil)) {
                return res.status(403).json({
                    erro: 'Você não tem permissão para esta operação.'
                });
            }
            next();
        });
    };
}

module.exports = { exigirPerfil };
