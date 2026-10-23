// Rotas públicas e administrativas relacionadas a produtos e categorias.
const express = require('express');
const pool = require('../db');
const { exigirPerfil } = require('../middleware/permissão-admin');
const { exigirCsrf } = require('../middleware/verificar-csrf');

const router = express.Router();

// --------------------------------------------------
// PRODUTOS: CONSULTA PUBLICA
// --------------------------------------------------

router.get('/produtos', async (req, res, next) => {
    try {
        const [linhas] = await pool.query(`
            SELECT
                p.id,
                p.nome,
                p.descricao,
                p.preco,
                p.quantidade,
                p.imagem,
                p.disponivel,
                pc.categoria_id
            FROM produtos p
            LEFT JOIN produto_categorias pc
                ON pc.produto_id = p.id
            WHERE p.disponivel = TRUE
            ORDER BY p.id
        `);

        const mapa = new Map();

        for (const linha of linhas) {
            if (!mapa.has(linha.id)) {
                mapa.set(linha.id, {
                    id: linha.id,
                    nome: linha.nome,
                    descricao: linha.descricao,
                    preco: linha.preco,
                    quantidade: linha.quantidade,
                    imagem: linha.imagem,
                    disponivel: linha.disponivel,
                    categorias: []
                });
            }

            if (linha.categoria_id !== null) {
                mapa.get(linha.id).categorias.push(
                    linha.categoria_id
                );
            }
        }

        res.json([...mapa.values()]);
    } catch (erro) {
        next(erro);
    }
});


// --------------------------------------------------
// LISTAGEM ADMINISTRATIVA: INCLUI PRODUTOS DESATIVADOS
// --------------------------------------------------

// Esta rota fica antes de /produtos/:id para que "admin" não seja interpretado como ID.
router.get('/produtos/admin', exigirPerfil('admin'), async (req, res, next) => {
    try {
        const [linhas] = await pool.query(`
            SELECT
                p.id, p.nome, p.descricao, p.preco, p.quantidade,
                p.imagem, p.disponivel, pc.categoria_id
            FROM produtos p
            LEFT JOIN produto_categorias pc ON pc.produto_id = p.id
            ORDER BY p.id
        `);

        // Agrupa as linhas por produto, pois um produto pode pertencer a várias categorias.
        const mapa = new Map();
        for (const linha of linhas) {
            if (!mapa.has(linha.id)) {
                mapa.set(linha.id, {
                    id: linha.id,
                    nome: linha.nome,
                    descricao: linha.descricao,
                    preco: linha.preco,
                    quantidade: linha.quantidade,
                    imagem: linha.imagem,
                    disponivel: linha.disponivel,
                    categorias: []
                });
            }
            if (linha.categoria_id !== null) {
                mapa.get(linha.id).categorias.push(linha.categoria_id);
            }
        }

        res.set('Cache-Control', 'no-store');
        res.json([...mapa.values()]);
    } catch (erro) {
        next(erro);
    }
});

router.get('/produtos/:id', async (req, res, next) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isSafeInteger(id) || id <= 0) {
            return res.status(400).json({
                erro: 'ID de produto inválido.'
            });
        }

        const [produtos] = await pool.execute(
            `SELECT id, nome, descricao, preco, quantidade,
                    imagem, disponivel
             FROM produtos
             WHERE id = ?`,
            [id]
        );

        if (!produtos.length) {
            return res.status(404).json({
                erro: 'Produto não encontrado.'
            });
        }

        const [categorias] = await pool.execute(
            `SELECT categoria_id
             FROM produto_categorias
             WHERE produto_id = ?`,
            [id]
        );

        res.json({
            ...produtos[0],
            categorias: categorias.map(c => c.categoria_id)
        });
    } catch (erro) {
        next(erro);
    }
});

// --------------------------------------------------
// CADASTRAR PRODUTO: SOMENTE ADMIN
// --------------------------------------------------

router.post(
    '/produtos',
    exigirPerfil('admin'),
    exigirCsrf,
    async (req, res, next) => {
        const {
            nome, descricao, preco, quantidade,
            categoriaId, categorias, imagem, disponivel
        } = req.body || {};

        const ids = categorias ?? (
            categoriaId === undefined ? [] : [categoriaId]
        );

        if (
            typeof nome !== 'string' ||
            !nome.trim() ||
            nome.length > 100 ||
            (descricao != null &&
                (typeof descricao !== 'string' || descricao.length > 255)) ||
            !Number.isFinite(Number(preco)) ||
            Number(preco) < 0 ||
            !Number.isSafeInteger(Number(quantidade)) ||
            Number(quantidade) < 0 ||
            !Array.isArray(ids) ||
            !ids.every(id => Number.isSafeInteger(Number(id)) && Number(id) > 0) ||
            (imagem != null &&
                (typeof imagem !== 'string' || imagem.length > 255)) ||
            (disponivel !== undefined && typeof disponivel !== 'boolean')
        ) {
            return res.status(400).json({
                erro: 'Dados do produto inválidos.'
            });
        }

        const conexao = await pool.getConnection();

        try {
            await conexao.beginTransaction();

            for (const categoriaId of new Set(ids.map(Number))) {
                const [cat] = await conexao.execute(
                    'SELECT id FROM categorias WHERE id = ?',
                    [categoriaId]
                );

                if (!cat.length) {
                    await conexao.rollback();
                    return res.status(400).json({
                        erro: 'Uma categoria informada não existe.'
                    });
                }
            }

            const [resultado] = await conexao.execute(
                `INSERT INTO produtos
                    (nome, descricao, preco, quantidade, imagem, disponivel)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    nome.trim(),
                    descricao || null,
                    Number(preco),
                    Number(quantidade),
                    imagem || null,
                    disponivel ?? true
                ]
            );

            for (const categoriaId of new Set(ids.map(Number))) {
                await conexao.execute(
                    `INSERT INTO produto_categorias
                        (produto_id, categoria_id)
                     VALUES (?, ?)`,
                    [resultado.insertId, categoriaId]
                );
            }

            // Registra o saldo inicial no histórico de estoque.
            const saldoInicial = Number(quantidade);
            if (saldoInicial > 0) {
                await conexao.execute(
                    `INSERT INTO movimentacoes_estoque
                        (usuario_id, produto_id, tipo, quantidade)
                     VALUES (?, ?, 'entrada', ?)`,
                    [req.session.usuario.id, resultado.insertId, saldoInicial]
                );
            }

            await conexao.commit();

            res.status(201).json({
                id: resultado.insertId,
                mensagem: 'Produto cadastrado.'
            });
        } catch (erro) {
            await conexao.rollback().catch(() => {});
            next(erro);
        } finally {
            conexao.release();
        }
    }
);

// --------------------------------------------------
// ATUALIZAR PRODUTO: SOMENTE ADMIN
// --------------------------------------------------

router.put(
    '/produtos/:id',
    exigirPerfil('admin'),
    exigirCsrf,
    async (req, res, next) => {
        const id = Number(req.params.id);
        const {
            nome, descricao, preco, quantidade,
            categoriaId, categorias, imagem, disponivel
        } = req.body || {};

        const ids = categorias ?? (
            categoriaId === undefined ? [] : [categoriaId]
        );

        if (
            !Number.isSafeInteger(id) || id <= 0 ||
            typeof nome !== 'string' || !nome.trim() ||
            nome.trim().length > 100 ||
            (descricao != null &&
                (typeof descricao !== 'string' || descricao.length > 255)) ||
            preco === null || preco === undefined ||
            !Number.isFinite(Number(preco)) || Number(preco) < 0 ||
            !Array.isArray(ids) ||
            !ids.every(c => Number.isSafeInteger(Number(c)) && Number(c) > 0) ||
            (imagem != null &&
                (typeof imagem !== 'string' || imagem.length > 255)) ||
            typeof disponivel !== 'boolean' ||
            (quantidade !== undefined &&
                (!Number.isSafeInteger(Number(quantidade)) || Number(quantidade) < 0))
        ) {
            return res.status(400).json({
                erro: 'Dados do produto inválidos.'
            });
        }

        const conexao = await pool.getConnection();

        try {
            await conexao.beginTransaction();

            const [existente] = await conexao.execute(
                'SELECT id, quantidade FROM produtos WHERE id = ? FOR UPDATE',
                [id]
            );

            if (!existente.length) {
                await conexao.rollback();
                return res.status(404).json({
                    erro: 'Produto não encontrado.'
                });
            }

            // O saldo só pode ser alterado pela rota de movimentações.
            // Quantidade igual ao saldo atual é aceita para compatibilidade.
            if (
                quantidade !== undefined &&
                Number(quantidade) !== Number(existente[0].quantidade)
            ) {
                await conexao.rollback();
                return res.status(400).json({
                    erro: 'Não altere o estoque nesta rota. Use a rota de movimentações.'
                });
            }

            for (const categoriaId of new Set(ids.map(Number))) {
                const [cat] = await conexao.execute(
                    'SELECT id FROM categorias WHERE id = ?',
                    [categoriaId]
                );

                if (!cat.length) {
                    await conexao.rollback();
                    return res.status(400).json({
                        erro: 'Uma categoria informada não existe.'
                    });
                }
            }

            await conexao.execute(
                `UPDATE produtos
                 SET nome = ?, descricao = ?, preco = ?,
                     imagem = ?, disponivel = ?
                 WHERE id = ?`,
                [
                    nome.trim(),
                    descricao || null,
                    Number(preco),
                    imagem || null,
                    disponivel,
                    id
                ]
            );

            await conexao.execute(
                'DELETE FROM produto_categorias WHERE produto_id = ?',
                [id]
            );

            for (const categoriaId of new Set(ids.map(Number))) {
                await conexao.execute(
                    `INSERT INTO produto_categorias
                        (produto_id, categoria_id)
                     VALUES (?, ?)`,
                    [id, categoriaId]
                );
            }

            await conexao.commit();

            res.json({
                id,
                mensagem: 'Produto atualizado.'
            });
        } catch (erro) {
            await conexao.rollback().catch(() => {});
            next(erro);
        } finally {
            conexao.release();
        }
    }
);

// --------------------------------------------------
// EXCLUIR PRODUTO: SOMENTE ADMIN
// --------------------------------------------------

router.delete(
    '/produtos/:id',
    exigirPerfil('admin'),
    exigirCsrf,
    async (req, res, next) => {
        const id = Number(req.params.id);

        if (!Number.isSafeInteger(id) || id <= 0) {
            return res.status(400).json({
                erro: 'ID inválido.'
            });
        }

        try {
            // Confere a existência antes de atualizar, inclusive quando o produto
            // já estava desativado e o MySQL não reportaria alteração de linha.
            const [produtos] = await pool.execute(
                'SELECT id FROM produtos WHERE id = ? LIMIT 1',
                [id]
            );

            if (!produtos.length) {
                return res.status(404).json({
                    erro: 'Produto não encontrado.'
                });
            }

            // Não removemos o registro: pedidos e movimentações históricas continuam vinculados.
            await pool.execute(
                'UPDATE produtos SET disponivel = FALSE WHERE id = ?',
                [id]
            );

            res.json({
                id,
                disponivel: false,
                mensagem: 'Produto desativado. O histórico foi preservado.'
            });
        } catch (erro) {
            next(erro);
        }
    }
);

// --------------------------------------------------
// CATEGORIAS: CONSULTA PUBLICA
// --------------------------------------------------

router.get('/tipos', async (req, res, next) => {
    try {
        const [categorias] = await pool.query(
            'SELECT id, nome FROM categorias ORDER BY id'
        );

        res.json(categorias);
    } catch (erro) {
        next(erro);
    }
});



module.exports = router;
