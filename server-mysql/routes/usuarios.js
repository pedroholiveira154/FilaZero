// Rota administrativa para criação de contas (funcionários e administradores).
// Segue as mesmas regras do script criar-admin.js: senha com no mínimo 12
// caracteres, no máximo 72 bytes UTF-8, e hash com bcrypt (custo 12).
const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db');
const { exigirPerfil } = require('../middleware/permissao-admin');
const { exigirCsrf } = require('../middleware/verificar-csrf');

const router = express.Router();

const PERFIS_PERMITIDOS = ['admin', 'funcionario'];
const CUSTO_BCRYPT = 12;

// Cria um novo usuário. Somente administradores autenticados chegam até aqui:
// a autorização é validada no servidor por exigirPerfil('admin'), e não apenas
// pela visibilidade do botão no frontend.
router.post(
    '/usuarios',
    exigirPerfil('admin'),
    exigirCsrf,
    async (req, res, next) => {
        try {
            const { usuario, senha, perfil } = req.body || {};

            // O login compara o nome já sem espaços nas pontas, então é assim que ele é gravado.
            const nome = typeof usuario === 'string' ? usuario.trim() : '';

            if (!nome || nome.length > 100 || /[\u0000-\u001f\u007f]/.test(nome)) {
                return res.status(400).json({
                    erro: 'Informe um nome de usuário válido, com até 100 caracteres.'
                });
            }

            if (!PERFIS_PERMITIDOS.includes(perfil)) {
                return res.status(400).json({
                    erro: 'Selecione um perfil válido: administrador ou funcionário.'
                });
            }

            if (
                typeof senha !== 'string' ||
                senha.length < 12 ||
                Buffer.byteLength(senha, 'utf8') > 72
            ) {
                return res.status(400).json({
                    erro: 'A senha precisa ter pelo menos 12 caracteres e no máximo 72 bytes.'
                });
            }

            const hash = await bcrypt.hash(senha, CUSTO_BCRYPT);

            // Consulta parametrizada: nenhum dado do usuário é concatenado ao SQL.
            const [resultado] = await pool.execute(
                `INSERT INTO usuarios (usuario, senha_hash, perfil, ativo)
                 VALUES (?, ?, ?, TRUE)`,
                [nome, hash, perfil]
            );

            res.set('Cache-Control', 'no-store');

            // Nunca devolve a senha nem o hash.
            res.status(201).json({
                id: resultado.insertId,
                usuario: nome,
                perfil,
                ativo: true,
                mensagem: 'Usuário criado com sucesso.'
            });
        } catch (erro) {
            // O campo "usuario" é UNIQUE no banco: impede duplicidade mesmo com requisições simultâneas.
            if (erro.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({
                    erro: 'Já existe um usuário com esse nome.'
                });
            }

            next(erro);
        }
    }
);

module.exports = router;
