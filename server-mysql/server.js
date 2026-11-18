const path = require('path');

// Carrega as variáveis antes de importar o banco de dados.
require('dotenv').config({
    path: path.resolve(__dirname, '../.env')
});

const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const pool = require('./db');
const { exigirLogin } = require('./middleware/verificar-autenticacao');
const { exigirPerfil } = require('./middleware/permissao-admin');
const { criarTokenCsrf, exigirCsrf } = require('./middleware/verificar-csrf');
const rotasProdutos = require('./routes/produtos');
const rotasUsuarios = require('./routes/usuarios');
const app = express();

const PORT = process.env.PORT || 3001;
const production = process.env.NODE_ENV === 'production';

// Verifica a configuração da sessão.
if (
    !process.env.SESSION_SECRET ||
    process.env.SESSION_SECRET.length < 32
) {
    throw new Error(
        'Configure um SESSION_SECRET forte no .env.'
    );
}
// A sessão utiliza o mesmo servidor MySQL.
// O store cria uma tabela própria para as sessões.
const sessionStore = new MySQLStore({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    clearExpired: true,
    checkExpirationInterval: 15 * 60 * 1000,
    expiration: 30 * 60 * 1000,
    createDatabaseTable: true
});

if (production) {
    // Use apenas se estiver atrás de um proxy confiável
    // corretamente configurado.
    app.set('trust proxy', 1);
}

app.disable('x-powered-by');
// Cabeçalhos de segurança. CSP deve ser configurada depois de revisar os scripts do frontend.
app.use(helmet({ contentSecurityPolicy: false }));

// Páginas administrativas não devem ser indexadas por mecanismos de busca.
app.use(['/login.html', '/estoque.html'], (req, res, next) => {
    res.set('X-Robots-Tag', 'noindex, nofollow');
    next();
});
app.use(express.json({ limit: '20kb' }));

app.use(session({
    name: 'sid',
    secret: process.env.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: production,
        sameSite: 'lax',
        maxAge: 30 * 60 * 1000,
        path: '/'
    }
}));

// --------------------------------------------------
// AUTENTICACAO E PERMISSOES
// --------------------------------------------------

// As verificações de sessão, perfil e CSRF ficam em middleware/ e são
// compartilhadas por server.js e pelos módulos de routes/.


// --------------------------------------------------
// CSRF: PROTEGE OPERACOES COM COOKIE DE SESSAO
// --------------------------------------------------

app.get('/api/csrf', (req, res, next) => {
    const token = criarTokenCsrf(req);

    req.session.save(erro => {
        if (erro) return next(erro);

        res.set('Cache-Control', 'no-store');
        res.json({ csrfToken: token });
    });
});


const limitarLogin = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { erro: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' }
});

const limitarPedidos = rateLimit({
    windowMs: 60 * 1000,
    limit: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: { erro: 'Muitos pedidos em pouco tempo. Aguarde e tente novamente.' }
});

// --------------------------------------------------
// LOGIN
// --------------------------------------------------

app.post(
    '/api/login',
    limitarLogin,
    exigirCsrf,
    async (req, res, next) => {
        try {
            const { usuario, senha } = req.body || {};

            if (
                typeof usuario !== 'string' ||
                typeof senha !== 'string' ||
                !usuario.trim() ||
                !senha ||
                usuario.length > 100 ||
                senha.length > 1024 ||
                Buffer.byteLength(senha, 'utf8') > 72
            ) {
                return res.status(400).json({
                    erro: 'Informe usuário e senha válidos.'
                });
            }

            const [usuarios] = await pool.execute(
                `SELECT id, usuario, senha_hash, perfil, ativo
                 FROM usuarios
                 WHERE usuario = ?
                 LIMIT 1`,
                [usuario.trim()]
            );

            const conta = usuarios[0];

            if (!conta) {
                return res.status(401).json({
                    erro: 'Usuário ou senha inválidos.'
                });
            }

            const senhaCorreta = await bcrypt.compare(
                senha,
                conta.senha_hash
            );

            if (!senhaCorreta) {
                return res.status(401).json({
                    erro: 'Usuário ou senha inválidos.'
                });
            }

            if (!conta.ativo) {
                return res.status(403).json({
                    erro: 'Conta desativada.'
                });
            }

            await new Promise((resolve, reject) => {
                req.session.regenerate(erro => {
                    if (erro) reject(erro);
                    else resolve();
                });
            });

            req.session.usuario = {
                id: conta.id,
                nome: conta.usuario,
                perfil: conta.perfil
            };

            criarTokenCsrf(req);

            await new Promise((resolve, reject) => {
                req.session.save(erro => {
                    if (erro) reject(erro);
                    else resolve();
                });
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
    }
);

// --------------------------------------------------
// IDENTIDADE E LOGOUT
// --------------------------------------------------

app.get('/api/me', exigirLogin, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ usuario: req.session.usuario });
});

app.post(
    '/api/logout',
    exigirLogin,
    exigirCsrf,
    (req, res, next) => {
        req.session.destroy(erro => {
            if (erro) return next(erro);

            res.clearCookie('sid', {
                httpOnly: true,
                secure: production,
                sameSite: 'lax',
                path: '/'
            });

            res.sendStatus(204);
        });
    }
);

// --------------------------------------------------
// PRODUTOS, CATEGORIAS E USUARIOS (MODULOS EM routes/)
// --------------------------------------------------

// Produtos: consulta pública, listagem administrativa e cadastro/edição/desativação.
app.use('/api', rotasProdutos);

// Usuários: criação de funcionários e administradores (somente admin).
app.use('/api', rotasUsuarios);

// --------------------------------------------------
// PEDIDOS: CONSULTA PRIVADA
// --------------------------------------------------

app.get(
    '/api/pedidos',
    exigirPerfil('admin'),
    async (req, res, next) => {
        try {
            const [pedidos] = await pool.query(
                'SELECT * FROM pedidos ORDER BY id'
            );

            const [itens] = await pool.query(
                'SELECT * FROM pedido_itens ORDER BY id'
            );

            const resultado = pedidos.map(pedido => ({
                ...pedido,
                itens: itens
                    .filter(item => item.pedido_id === pedido.id)
                    .map(item => ({
                        ...item,
                        produtoId: item.produto_id,
                        precoUnitario: item.preco_unitario
                    }))
            }));

            res.json(resultado);
        } catch (erro) {
            next(erro);
        }
    }
);

// --------------------------------------------------
// CRIAR PEDIDO: PUBLICO, COM VALIDACAO DO SERVIDOR
// --------------------------------------------------

app.post(
    '/api/pedidos',
    limitarPedidos,
    exigirCsrf,
    async (req, res, next) => {
        const { numeroPedido, formaPagamento, itens } = req.body || {};
        const formaNormalizada = typeof formaPagamento === 'string'
            ? formaPagamento.trim().toLocaleLowerCase('pt-BR')
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            : '';

        const mapaPagamentos = {
            'pix': 'PIX',
            'dinheiro': 'Dinheiro',
            'cartao': 'Cartão',
            'cartao de credito': 'Cartão de crédito',
            'credito': 'Cartão de crédito',
            'cartao de debito': 'Cartão de débito',
            'debito': 'Cartão de débito'
        };
        const formaPagamentoValida = mapaPagamentos[formaNormalizada];

        if (
            typeof numeroPedido !== 'string' ||
            !/^[A-Za-z0-9-]{1,20}$/.test(numeroPedido) ||
            !formaPagamentoValida ||
            !Array.isArray(itens) ||
            itens.length === 0 ||
            itens.length > 50
        ) {
            return res.status(400).json({
                erro: 'Dados do pedido inválidos.'
            });
        }

        // Agrupa linhas repetidas do mesmo produto antes de validar o saldo.
        const quantidadesPorProduto = new Map();

        for (const item of itens) {
            const produtoId = Number(item?.produtoId);
            const quantidade = Number(item?.quantidade);

            if (
                !Number.isSafeInteger(produtoId) || produtoId <= 0 ||
                !Number.isSafeInteger(quantidade) ||
                quantidade <= 0 || quantidade > 1000
            ) {
                return res.status(400).json({
                    erro: 'Item de pedido inválido.'
                });
            }

            const totalProduto =
                (quantidadesPorProduto.get(produtoId) || 0) + quantidade;

            if (totalProduto > 1000) {
                return res.status(400).json({
                    erro: 'Quantidade total por produto excedida.'
                });
            }

            quantidadesPorProduto.set(produtoId, totalProduto);
        }

        // Bloqueia produtos em ordem estável para reduzir deadlocks.
        const idsOrdenados = [...quantidadesPorProduto.keys()].sort((a, b) => a - b);
        const conexao = await pool.getConnection();

        try {
            await conexao.beginTransaction();

            let totalCentavos = 0;
            const itensValidados = [];

            for (const produtoId of idsOrdenados) {
                const quantidade = quantidadesPorProduto.get(produtoId);

                const [produtos] = await conexao.execute(
                    `SELECT id, preco, disponivel, quantidade
                     FROM produtos
                     WHERE id = ?
                     FOR UPDATE`,
                    [produtoId]
                );

                if (!produtos.length || !produtos[0].disponivel) {
                    throw Object.assign(
                        new Error('Produto indisponível.'),
                        { status: 400 }
                    );
                }

                if (Number(produtos[0].quantidade) < quantidade) {
                    throw Object.assign(
                        new Error('Estoque insuficiente.'),
                        { status: 409 }
                    );
                }

                const preco = Number(produtos[0].preco);
                if (!Number.isFinite(preco) || preco < 0) {
                    throw Object.assign(
                        new Error('Preço do produto inválido.'),
                        { status: 500 }
                    );
                }

                const precoCentavos = Math.round(preco * 100);
                totalCentavos += precoCentavos * quantidade;

                if (!Number.isSafeInteger(totalCentavos) || totalCentavos > 9999999999) {
                    throw Object.assign(
                        new Error('Valor total do pedido excedido.'),
                        { status: 400 }
                    );
                }

                itensValidados.push({ produtoId, quantidade, precoCentavos });
            }

            const total = (totalCentavos / 100).toFixed(2);

            const [pedido] = await conexao.execute(
                `INSERT INTO pedidos
                    (numero_pedido, forma_pagamento, status, total)
                 VALUES (?, ?, 'Pendente', ?)`,
                [numeroPedido, formaPagamentoValida, total]
            );

            for (const item of itensValidados) {
                await conexao.execute(
                    `INSERT INTO pedido_itens
                        (pedido_id, produto_id, quantidade, preco_unitario)
                     VALUES (?, ?, ?, ?)`,
                    [
                        pedido.insertId,
                        item.produtoId,
                        item.quantidade,
                        (item.precoCentavos / 100).toFixed(2)
                    ]
                );

                const [baixa] = await conexao.execute(
                    `UPDATE produtos
                     SET quantidade = quantidade - ?
                     WHERE id = ? AND quantidade >= ?`,
                    [item.quantidade, item.produtoId, item.quantidade]
                );

                if (baixa.affectedRows !== 1) {
                    throw Object.assign(
                        new Error('Estoque insuficiente.'),
                        { status: 409 }
                    );
                }

                // A venda é uma saída de estoque. usuario_id fica NULL porque
                // o pedido é público; pedido_id identifica a origem da saída.
                await conexao.execute(
                    `INSERT INTO movimentacoes_estoque
                        (usuario_id, produto_id, pedido_id, tipo, quantidade)
                     VALUES (NULL, ?, ?, 'saida', ?)`,
                    [item.produtoId, pedido.insertId, item.quantidade]
                );
            }

            await conexao.commit();

            res.status(201).json({
                id: pedido.insertId,
                numeroPedido,
                total,
                status: 'Pendente'
            });
        } catch (erro) {
            await conexao.rollback().catch(() => {});

            if (erro.status) {
                return res.status(erro.status).json({ erro: erro.message });
            }

            if (erro.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({
                    erro: 'Esse número de pedido já existe.'
                });
            }

            next(erro);
        } finally {
            conexao.release();
        }
    }
);

// --------------------------------------------------
// ESTOQUE E AUDITORIA
// --------------------------------------------------

app.get('/api/estoque', exigirLogin, async (req, res, next) => {
    try {
        const [produtos] = await pool.query(`
            SELECT id, nome, quantidade, disponivel
            FROM produtos
            ORDER BY nome
        `);

        res.set('Cache-Control', 'no-store');
        res.json({ produtos });
    } catch (erro) {
        next(erro);
    }
});

app.post(
    '/api/estoque/:id/movimentacoes',
    exigirPerfil('admin', 'funcionario'),
    exigirCsrf,
    async (req, res, next) => {
        const produtoId = Number(req.params.id);
        const { tipo, quantidade } = req.body || {};

        if (
            !Number.isSafeInteger(produtoId) || produtoId <= 0 ||
            !['entrada', 'saida'].includes(tipo) ||
            !Number.isSafeInteger(quantidade) ||
            quantidade <= 0 || quantidade > 1000000
        ) {
            return res.status(400).json({
                erro: 'Dados de movimentação inválidos.'
            });
        }

        const conexao = await pool.getConnection();

        try {
            await conexao.beginTransaction();

            const [produtos] = await conexao.execute(
                `SELECT id, quantidade
                 FROM produtos
                 WHERE id = ?
                 FOR UPDATE`,
                [produtoId]
            );

            if (!produtos.length) {
                await conexao.rollback();

                return res.status(404).json({
                    erro: 'Produto não encontrado.'
                });
            }

            const saldo = produtos[0].quantidade;

            if (tipo === 'saida' && saldo < quantidade) {
                await conexao.rollback();

                return res.status(409).json({
                    erro: 'Estoque insuficiente.'
                });
            }

            const novoSaldo = tipo === 'entrada'
                ? Number(saldo) + quantidade
                : Number(saldo) - quantidade;

            // produtos.quantidade é INT assinado no MySQL.
            if (!Number.isSafeInteger(novoSaldo) || novoSaldo > 2147483647) {
                await conexao.rollback();
                return res.status(400).json({
                    erro: 'A quantidade resultante ultrapassa o limite permitido.'
                });
            }

            await conexao.execute(
                'UPDATE produtos SET quantidade = ? WHERE id = ?',
                [novoSaldo, produtoId]
            );

            await conexao.execute(
                `INSERT INTO movimentacoes_estoque
                    (usuario_id, produto_id, tipo, quantidade)
                 VALUES (?, ?, ?, ?)`,
                [
                    req.session.usuario.id,
                    produtoId,
                    tipo,
                    quantidade
                ]
            );

            await conexao.commit();

            res.status(201).json({
                mensagem: 'Movimentação registrada.',
                saldo: novoSaldo
            });
        } catch (erro) {
            await conexao.rollback().catch(() => {});
            next(erro);
        } finally {
            conexao.release();
        }
    }
);

app.get(
    '/api/estoque/movimentacoes',
    exigirPerfil('admin'),
    async (req, res, next) => {
        try {
            const [movimentacoes] = await pool.query(`
                SELECT
                    m.id,
                    m.usuario_id,
                    u.usuario,
                    m.produto_id,
                    p.nome AS produto,
                    m.pedido_id,
                    m.tipo,
                    m.quantidade,
                    m.data_hora
                FROM movimentacoes_estoque m
                LEFT JOIN usuarios u ON u.id = m.usuario_id
                JOIN produtos p ON p.id = m.produto_id
                ORDER BY m.data_hora DESC
                LIMIT 500
            `);

            res.set('Cache-Control', 'no-store');
            res.json(movimentacoes);
        } catch (erro) {
            next(erro);
        }
    }
);

// --------------------------------------------------
// PAGINA PRIVADA
// --------------------------------------------------

app.get('/estoque.html', exigirLogin, (req, res) => {
    res.set('Cache-Control', 'no-store');

    res.sendFile(
        path.join(__dirname, '../private/estoque.html')
    );
});

// --------------------------------------------------
// PÁGINA INICIAL
// --------------------------------------------------

app.get('/', (req, res) => {
    res.sendFile(
        path.join(__dirname, '../public/index.html')
    );
});

// Arquivos públicos: não coloque estoque.html aqui.
app.use(express.static(
    path.join(__dirname, '../public'),
    { index: false, dotfiles: 'deny' }
));

app.use((req, res) => {
    res.status(404).json({
        erro: 'Recurso não encontrado.'
    });
});

app.use((erro, req, res, next) => {
    console.error('Erro na API:', erro);

    if (res.headersSent) return next(erro);

    if (erro.code === 'ER_ROW_IS_REFERENCED_2' || erro.code === 'ER_ROW_IS_REFERENCED') {
        return res.status(409).json({
            erro: 'Este registro está vinculado a pedidos ou movimentações e não pode ser excluído.'
        });
    }

    if (erro.code === 'ER_NO_REFERENCED_ROW_2') {
        return res.status(400).json({
            erro: 'Um dos registros relacionados não existe.'
        });
    }

    res.status(500).json({
        erro: 'Erro interno do servidor.'
    });
});

async function iniciar() {
    await pool.query('SELECT 1');

    app.listen(PORT,'0.0.0.0', () => {
        console.log(`Servidor rodando na porta ${PORT}`);
    });
}

iniciar().catch(erro => {
    console.error('Falha ao iniciar a API:', erro);
    process.exit(1);
});