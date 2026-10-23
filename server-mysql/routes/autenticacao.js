// Rotas responsáveis por iniciar, consultar e encerrar uma sessão autenticada.
const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const pool = require('../db');
const { exigirLogin } = require('../middleware/verificar-autenticação');
const { criarTokenCsrf, exigirCsrf } = require('../middleware/verificar-csrf');

const router = express.Router();
const production = process.env.NODE_ENV === 'production';

// Limita tentativas de login para dificultar ataques de tentativa e erro.
const limitarLogin = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { erro: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' }
});

// Entrega ao frontend o token CSRF que deverá acompanhar operações protegidas.
router.get('/csrf', (req, res, next) => {
    const token = criarTokenCsrf(req);
    req.session.save(erro => {
        if (erro) return next(erro);
        res.set('Cache-Control', 'no-store');
        res.json({ csrfToken: token });
    });
});

// Autentica o usuário e cria uma nova sessão para evitar fixação de sessão.
router.post('/login', limitarLogin, exigirCsrf, async (req, res, next) => {
    try {
        const { usuario, senha } = req.body || {};

        // Valida os tipos e limites de entrada antes de consultar o banco.
        if (
            typeof usuario !== 'string' ||
            typeof senha !== 'string' ||
            !usuario.trim() ||
            !senha ||
            usuario.length > 100 ||
            senha.length > 1024 ||
            Buffer.byteLength(senha, 'utf8') > 72
        ) {
            return res.status(400).json({ erro: 'Informe usuário e senha válidos.' });
        }

        const [usuarios] = await pool.execute(
            `SELECT id, usuario, senha_hash, perfil, ativo
             FROM usuarios
             WHERE usuario = ?
             LIMIT 1`,
            [usuario.trim()]
        );
        const conta = usuarios[0];

        // Usa a mesma mensagem para usuário inexistente ou senha incorreta.
        if (!conta) {
            return res.status(401).json({ erro: 'Usuário ou senha inválidos.' });
        }

        const senhaCorreta = await bcrypt.compare(senha, conta.senha_hash);
        if (!senhaCorreta) {
            return res.status(401).json({ erro: 'Usuário ou senha inválidos.' });
        }
        if (!conta.ativo) {
            return res.status(403).json({ erro: 'Conta desativada.' });
        }

        // Gera um ID de sessão novo após autenticação bem-sucedida.
        await new Promise((resolve, reject) => {
            req.session.regenerate(erro => erro ? reject(erro) : resolve());
        });

        // Guarda somente os dados necessários na sessão; a senha nunca é armazenada nela.
        req.session.usuario = {
            id: conta.id,
            nome: conta.usuario,
            perfil: conta.perfil
        };
        criarTokenCsrf(req);

        // Garante que a sessão foi salva antes de responder ao frontend.
        await new Promise((resolve, reject) => {
            req.session.save(erro => erro ? reject(erro) : resolve());
        });

        res.set('Cache-Control', 'no-store');
        res.json({
            mensagem: 'Login realizado com sucesso.',
            usuario: {
                id: conta.id,
                nome: conta.usuario,
                perfil: conta.perfil
            }
        });
    } catch (erro) {
        next(erro);
    }
});

// Retorna os dados básicos da sessão, sem expor hash ou senha.
router.get('/me', exigirLogin, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ usuario: req.session.usuario });
});

// Encerra a sessão no servidor e remove o cookie de autenticação do navegador.
router.post('/logout', exigirLogin, exigirCsrf, (req, res, next) => {
    req.session.destroy(erro => {
        if (erro) return next(erro);

        // As opções precisam corresponder às usadas na criação do cookie.
        res.clearCookie('sid', {
            httpOnly: true,
            secure: production,
            sameSite: 'lax',
            path: '/'
        });

        // 204 indica que o logout foi concluído sem conteúdo de resposta.
        res.sendStatus(204);
    });
});

module.exports = router;
