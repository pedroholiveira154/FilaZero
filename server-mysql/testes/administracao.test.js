// Testes de integração da área administrativa: sobem o servidor real e usam o MySQL do .env.
// Executar na raiz do projeto:  npm test
//
// Os testes criam usuários e produtos próprios (com sufixo aleatório) e os removem no final.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const crypto = require('node:crypto');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const bcrypt = require('bcrypt');
const pool = require('../db');

const PORTA = process.env.TESTE_PORTA || '3999';
const BASE = `http://localhost:${PORTA}`;
const sufixo = crypto.randomBytes(4).toString('hex');

const admin = { usuario: `teste_admin_${sufixo}`, senha: 'SenhaAdminTeste#2026' };
const funcionario = { usuario: `teste_func_${sufixo}`, senha: 'SenhaFuncTeste#2026' };

let servidor;
let clienteAdmin;   // sessão compartilhada (o login tem limite de 10 tentativas por 15 min)
let clienteFunc;
const usuariosCriados = [];   // nomes de usuário a remover no final
const produtosCriados = [];   // ids de produtos a remover no final

// Cliente HTTP mínimo com cookie de sessão e token CSRF.
function criarCliente() {
    let cookie = '';
    let csrf = '';

    async function req(metodo, caminho, corpo, { semCsrf = false } = {}) {
        const headers = { 'Content-Type': 'application/json' };
        if (cookie) headers.Cookie = cookie;
        if (!semCsrf && csrf && metodo !== 'GET') headers['X-CSRF-Token'] = csrf;

        const resposta = await fetch(BASE + caminho, {
            method: metodo,
            headers,
            body: corpo === undefined ? undefined : JSON.stringify(corpo),
            redirect: 'manual'
        });

        const cookies = resposta.headers.getSetCookie?.() || [];
        if (cookies.length) cookie = cookies.map(c => c.split(';')[0]).join('; ');

        let dados = null;
        try { dados = await resposta.json(); } catch { /* resposta sem JSON */ }
        return { status: resposta.status, dados };
    }

    async function login(credenciais) {
        csrf = (await req('GET', '/api/csrf')).dados.csrfToken;
        const resposta = await req('POST', '/api/login', credenciais);
        csrf = (await req('GET', '/api/csrf')).dados.csrfToken;
        return resposta;
    }

    return { req, login, cookie: () => cookie };
}

async function criarContaNoBanco({ usuario, senha }, perfil) {
    const hash = await bcrypt.hash(senha, 12);
    await pool.execute(
        'INSERT INTO usuarios (usuario, senha_hash, perfil, ativo) VALUES (?, ?, ?, TRUE)',
        [usuario, hash, perfil]
    );
    usuariosCriados.push(usuario);
}

async function aguardarServidor() {
    for (let i = 0; i < 40; i++) {
        try {
            const r = await fetch(`${BASE}/api/csrf`);
            if (r.ok) return;
        } catch { /* ainda subindo */ }
        await new Promise(r => setTimeout(r, 250));
    }
    throw new Error('O servidor de teste não iniciou.');
}

test.before(async () => {
    await criarContaNoBanco(admin, 'admin');
    await criarContaNoBanco(funcionario, 'funcionario');

    servidor = spawn(process.execPath, [path.join(__dirname, '../server.js')], {
        env: { ...process.env, PORT: PORTA },
        stdio: 'ignore'
    });
    await aguardarServidor();

    clienteAdmin = criarCliente();
    assert.equal((await clienteAdmin.login(admin)).status, 200);
    clienteFunc = criarCliente();
    assert.equal((await clienteFunc.login(funcionario)).status, 200);
});

test.after(async () => {
    servidor?.kill();

    for (const id of produtosCriados) {
        await pool.execute('DELETE FROM movimentacoes_estoque WHERE produto_id = ?', [id]);
        await pool.execute('DELETE FROM produto_categorias WHERE produto_id = ?', [id]);
        await pool.execute('DELETE FROM produtos WHERE id = ?', [id]);
    }
    for (const usuario of usuariosCriados) {
        await pool.execute('DELETE FROM usuarios WHERE usuario = ?', [usuario]);
    }
    await pool.end();
});

// --------------------------------------------------
// Login e perfis
// --------------------------------------------------

test('login de administrador devolve perfil admin e nome', async () => {
    const c = clienteAdmin;
    const me = await c.req('GET', '/api/me');
    assert.equal(me.dados.usuario.perfil, 'admin');
    assert.equal(me.dados.usuario.nome, admin.usuario);
});

test('login de funcionário devolve perfil funcionario', async () => {
    assert.equal((await clienteFunc.req('GET', '/api/me')).dados.usuario.perfil, 'funcionario');
});

test('login com senha errada é recusado', async () => {
    const c = criarCliente();
    const r = await c.login({ usuario: admin.usuario, senha: 'senha-errada-123456' });
    assert.equal(r.status, 401);
});

test('ambos os perfis acessam o estoque', async () => {
    for (const c of [clienteAdmin, clienteFunc]) {
        const r = await c.req('GET', '/api/estoque');
        assert.equal(r.status, 200);
        assert.ok(Array.isArray(r.dados.produtos));
    }
});

// --------------------------------------------------
// Requisições sem autenticação ou autorização
// --------------------------------------------------

test('sem login: rotas administrativas retornam 401', async () => {
    const c = criarCliente();
    assert.equal((await c.req('POST', '/api/usuarios', { usuario: 'x', senha: 'y', perfil: 'admin' })).status, 401);
    assert.equal((await c.req('GET', '/api/produtos/admin')).status, 401);
    assert.equal((await c.req('POST', '/api/produtos', {})).status, 401);
    assert.equal((await c.req('DELETE', '/api/produtos/1')).status, 401);
    assert.equal((await c.req('GET', '/api/estoque')).status, 401);
});

test('funcionário não pode criar usuário nem administrar produtos (403 no servidor)', async () => {
    const c = clienteFunc;

    const novo = await c.req('POST', '/api/usuarios', {
        usuario: `invasor_${sufixo}`, senha: 'SenhaInvasor#2026', perfil: 'admin'
    });
    assert.equal(novo.status, 403);

    const [rows] = await pool.execute('SELECT id FROM usuarios WHERE usuario = ?', [`invasor_${sufixo}`]);
    assert.equal(rows.length, 0, 'o usuário não pode ter sido criado');

    assert.equal((await c.req('GET', '/api/produtos/admin')).status, 403);
    assert.equal((await c.req('POST', '/api/produtos', { nome: 'x', preco: 1, quantidade: 1 })).status, 403);
    assert.equal((await c.req('PUT', '/api/produtos/1', {})).status, 403);
    assert.equal((await c.req('DELETE', '/api/produtos/1')).status, 403);
});

test('criar usuário sem token CSRF é recusado', async () => {
    const c = clienteAdmin;
    const r = await c.req('POST', '/api/usuarios',
        { usuario: `semcsrf_${sufixo}`, senha: 'SenhaSemCsrf#2026', perfil: 'funcionario' },
        { semCsrf: true });
    assert.equal(r.status, 403);
});

// --------------------------------------------------
// Criação de usuários por administrador
// --------------------------------------------------

test('admin cria funcionário; senha vira hash bcrypt e nada sensível é devolvido', async () => {
    const c = clienteAdmin;

    const novo = { usuario: `novo_func_${sufixo}`, senha: 'SenhaNovoFunc#2026', perfil: 'funcionario' };
    usuariosCriados.push(novo.usuario);

    const r = await c.req('POST', '/api/usuarios', novo);
    assert.equal(r.status, 201);
    assert.equal(r.dados.perfil, 'funcionario');
    assert.equal(r.dados.usuario, novo.usuario);
    assert.deepEqual(Object.keys(r.dados).sort(), ['ativo', 'id', 'mensagem', 'perfil', 'usuario']);
    assert.ok(!JSON.stringify(r.dados).includes(novo.senha));
    assert.ok(!JSON.stringify(r.dados).includes('$2'));

    // Hash no banco: bcrypt, nunca a senha em texto puro.
    const [[linha]] = await pool.execute(
        'SELECT senha_hash, perfil, ativo FROM usuarios WHERE usuario = ?', [novo.usuario]);
    assert.notEqual(linha.senha_hash, novo.senha);
    assert.match(linha.senha_hash, /^\$2[aby]\$12\$/);
    assert.equal(await bcrypt.compare(novo.senha, linha.senha_hash), true);
    assert.equal(linha.perfil, 'funcionario');
    assert.equal(linha.ativo, 1);

    // O novo funcionário consegue entrar, com o perfil correto.
    const c2 = criarCliente();
    assert.equal((await c2.login({ usuario: novo.usuario, senha: novo.senha })).status, 200);
    assert.equal((await c2.req('GET', '/api/me')).dados.usuario.perfil, 'funcionario');
});

test('admin cria administrador', async () => {
    const c = clienteAdmin;

    const novo = { usuario: `novo_admin_${sufixo}`, senha: 'SenhaNovoAdmin#2026', perfil: 'admin' };
    usuariosCriados.push(novo.usuario);

    assert.equal((await c.req('POST', '/api/usuarios', novo)).status, 201);

    const c2 = criarCliente();
    await c2.login({ usuario: novo.usuario, senha: novo.senha });
    assert.equal((await c2.req('GET', '/api/me')).dados.usuario.perfil, 'admin');
    assert.equal((await c2.req('GET', '/api/produtos/admin')).status, 200);
});

test('usuário duplicado é recusado (inclusive variando maiúsculas)', async () => {
    const c = clienteAdmin;

    const base = { senha: 'SenhaDuplicada#2026', perfil: 'funcionario' };
    const r1 = await c.req('POST', '/api/usuarios', { ...base, usuario: `dup_${sufixo}` });
    usuariosCriados.push(`dup_${sufixo}`);
    assert.equal(r1.status, 201);

    assert.equal((await c.req('POST', '/api/usuarios', { ...base, usuario: `dup_${sufixo}` })).status, 409);
    assert.equal((await c.req('POST', '/api/usuarios', { ...base, usuario: `DUP_${sufixo}` })).status, 409);
});

test('dados inválidos ou incompletos na criação de usuário retornam 400', async () => {
    const c = clienteAdmin;
    const ok = { usuario: `invalido_${sufixo}`, senha: 'SenhaValida#2026', perfil: 'funcionario' };

    const casos = [
        { ...ok, usuario: '' },
        { ...ok, usuario: '   ' },
        { ...ok, usuario: 'a'.repeat(101) },
        { ...ok, senha: 'curta' },
        { ...ok, senha: 'a'.repeat(73) },
        { ...ok, perfil: 'root' },
        { ...ok, perfil: undefined },
        { usuario: ok.usuario },
        { ...ok, senha: 12345678901234 }
    ];

    for (const corpo of casos) {
        const r = await c.req('POST', '/api/usuarios', corpo);
        assert.equal(r.status, 400, `esperava 400 para ${JSON.stringify(corpo).slice(0, 80)}`);
    }

    const [rows] = await pool.execute('SELECT id FROM usuarios WHERE usuario LIKE ?', [`invalido_${sufixo}%`]);
    assert.equal(rows.length, 0);
});

// --------------------------------------------------
// Produtos: cadastrar, alterar e desativar (sem apagar o histórico)
// --------------------------------------------------

test('admin cadastra, altera e desativa produto preservando o histórico', async () => {
    const c = clienteAdmin;

    // Cadastro
    const cad = await c.req('POST', '/api/produtos', {
        nome: `Produto Teste ${sufixo}`, descricao: 'Teste automatizado', preco: 4.5,
        quantidade: 7, imagem: 'img/teste.png', categorias: [1, 2], disponivel: true
    });
    assert.equal(cad.status, 201);
    const id = cad.dados.id;
    produtosCriados.push(id);

    let lista = (await c.req('GET', '/api/produtos/admin')).dados;
    let produto = lista.find(p => p.id === id);
    assert.equal(produto.nome, `Produto Teste ${sufixo}`);
    assert.equal(Number(produto.preco), 4.5);
    assert.equal(produto.quantidade, 7);
    assert.deepEqual(produto.categorias.sort(), [1, 2]);

    // Alteração
    const alt = await c.req('PUT', `/api/produtos/${id}`, {
        nome: `Produto Teste ${sufixo} (editado)`, descricao: 'Editado', preco: 5.25,
        imagem: 'img/teste2.png', categorias: [3], disponivel: true
    });
    assert.equal(alt.status, 200);

    lista = (await c.req('GET', '/api/produtos/admin')).dados;
    produto = lista.find(p => p.id === id);
    assert.equal(produto.nome, `Produto Teste ${sufixo} (editado)`);
    assert.equal(Number(produto.preco), 5.25);
    assert.deepEqual(produto.categorias, [3]);
    assert.equal(produto.quantidade, 7, 'o saldo não muda pela edição');

    // Movimentação (gera histórico adicional)
    const mov = await c.req('POST', `/api/estoque/${id}/movimentacoes`, { tipo: 'saida', quantidade: 2 });
    assert.equal(mov.status, 201);

    const [[antes]] = await pool.execute(
        'SELECT COUNT(*) AS n FROM movimentacoes_estoque WHERE produto_id = ?', [id]);
    assert.ok(antes.n >= 1);

    // Remoção = desativação lógica
    const del = await c.req('DELETE', `/api/produtos/${id}`);
    assert.equal(del.status, 200);

    const [[linha]] = await pool.execute('SELECT disponivel, quantidade FROM produtos WHERE id = ?', [id]);
    assert.ok(linha, 'o registro continua existindo');
    assert.equal(linha.disponivel, 0);
    assert.equal(linha.quantidade, 5);

    const [[depois]] = await pool.execute(
        'SELECT COUNT(*) AS n FROM movimentacoes_estoque WHERE produto_id = ?', [id]);
    assert.equal(depois.n, antes.n, 'o histórico de movimentações foi preservado');

    // Some do cardápio público, continua na lista administrativa.
    const publica = (await criarCliente().req('GET', '/api/produtos')).dados;
    assert.ok(!publica.some(p => p.id === id));
    const admLista = (await c.req('GET', '/api/produtos/admin')).dados;
    assert.equal(admLista.find(p => p.id === id).disponivel, 0);

    // Reativação pela edição.
    const reativa = await c.req('PUT', `/api/produtos/${id}`, {
        nome: produto.nome, descricao: 'Editado', preco: 5.25,
        imagem: 'img/teste2.png', categorias: [3], disponivel: true
    });
    assert.equal(reativa.status, 200);
    const publica2 = (await criarCliente().req('GET', '/api/produtos')).dados;
    assert.ok(publica2.some(p => p.id === id));
});

test('dados inválidos de produto retornam 400', async () => {
    const c = clienteAdmin;

    const valido = { nome: 'Inválido', descricao: '', preco: 1, quantidade: 1, imagem: '', categorias: [1] };
    const casos = [
        { ...valido, nome: '' },
        { ...valido, preco: -1 },
        { ...valido, preco: 'abc' },
        { ...valido, quantidade: -3 },
        { ...valido, quantidade: 1.5 },
        { ...valido, categorias: [9999] },
        { ...valido, nome: 'x'.repeat(101) }
    ];

    for (const corpo of casos) {
        const r = await c.req('POST', '/api/produtos', corpo);
        assert.ok([400].includes(r.status), `esperava 400, veio ${r.status} para ${JSON.stringify(corpo).slice(0, 60)}`);
    }
});

test('remover produto inexistente retorna 404', async () => {
    const c = clienteAdmin;
    assert.equal((await c.req('DELETE', '/api/produtos/99999999')).status, 404);
});

test('produto com SQL injection no nome é tratado como texto', async () => {
    const c = clienteAdmin;
    const nome = `x'); DROP TABLE produtos;-- ${sufixo}`;
    const r = await c.req('POST', '/api/produtos', {
        nome, descricao: '', preco: 1, quantidade: 0, imagem: '', categorias: []
    });
    assert.equal(r.status, 201);
    produtosCriados.push(r.dados.id);

    const [[linha]] = await pool.execute('SELECT nome FROM produtos WHERE id = ?', [r.dados.id]);
    assert.equal(linha.nome, nome);
});

// --------------------------------------------------
// Páginas administrativas
// --------------------------------------------------

test('páginas administrativas enviam noindex e o estoque exige login', async () => {
    const login = await fetch(`${BASE}/login.html`);
    assert.equal(login.status, 200);
    assert.match(login.headers.get('x-robots-tag') || '', /noindex/);
    assert.match(await login.text(), /<meta name="robots" content="noindex, nofollow">/);

    const semSessao = await fetch(`${BASE}/estoque.html`, { redirect: 'manual' });
    assert.equal(semSessao.status, 401);

    // Com sessão válida, a página do estoque é entregue.
    const c = clienteAdmin;
    const comSessao = await fetch(`${BASE}/estoque.html`, { headers: { Cookie: c.cookie() } });
    assert.equal(comSessao.status, 200);
    assert.match(comSessao.headers.get('x-robots-tag') || '', /noindex/);
    const html = await comSessao.text();
    assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
    assert.ok(!/SOLICITAR RE-ESTOQUE/i.test(html), 'o botão Solicitar Re-estoque foi removido');
});
