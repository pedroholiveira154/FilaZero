// Lógica da página privada de estoque do FilaZero.
// O servidor continua sendo a autoridade para autenticação, permissões e saldo.

const usuarioLogado = document.getElementById('usuario-logado');
const listaProdutos = document.getElementById('lista-produtos');
const mensagem = document.getElementById('mensagem');
const botaoSair = document.getElementById('btn-sair');

// O token CSRF fica apenas em memória durante esta visita à página.
let tokenCsrf = null;

// Exibe mensagens de sucesso ou de erro na região acessível da página.
function mostrarMensagem(texto, erro = false) {
    mensagem.textContent = texto;
    mensagem.dataset.tipo = erro ? 'erro' : 'sucesso';
}

// Faz uma requisição à API e converte respostas de erro em exceções legíveis.
async function requisicaoApi(url, opcoes = {}) {
    const resposta = await fetch(url, {
        credentials: 'same-origin',
        ...opcoes,
        headers: {
            ...(opcoes.headers || {})
        }
    });

    if (resposta.status === 401) {
        // A sessão pode ter expirado desde que a página foi aberta.
        window.location.replace('/login.html');
        throw new Error('Sua sessão expirou. Entre novamente.');
    }

    if (!resposta.ok) {
        let dados = {};
        try {
            dados = resposta.status === 204 ? {} : await resposta.json();
        } catch (_) {
            // Algumas respostas de erro não possuem JSON.
        }
        throw new Error(dados.erro || `Falha na requisição (${resposta.status}).`);
    }

    if (resposta.status === 204) return null;
    return resposta.json();
}

// Busca o token de segurança necessário para registrar movimentações e sair.
async function carregarTokenCsrf() {
    const dados = await requisicaoApi('/api/csrf');
    tokenCsrf = dados.csrfToken;
}

// Consulta a identidade da sessão e mostra o usuário atualmente autenticado.
async function verificarSessao() {
    const dados = await requisicaoApi('/api/me');
    const usuario = dados.usuario || {};
    const nome = usuario.nome || usuario.usuario || 'Usuário autenticado';
    const perfil = usuario.perfil ? ` (${usuario.perfil})` : '';
    usuarioLogado.textContent = `${nome}${perfil}`;
}

// Cria uma célula de tabela usando textContent, evitando interpretar dados do banco como HTML.
function criarCelula(valor) {
    const celula = document.createElement('td');
    celula.textContent = String(valor ?? '');
    return celula;
}

// Cria os controles de movimentação para cada produto listado no estoque.
function criarControlesMovimentacao(produto) {
    const celula = document.createElement('td');
    const formulario = document.createElement('form');
    formulario.className = 'form-movimentacao';

    const seletorTipo = document.createElement('select');
    seletorTipo.name = 'tipo';
    seletorTipo.setAttribute('aria-label', `Tipo de movimentação para ${produto.nome}`);
    for (const [valor, rotulo] of [['entrada', 'Entrada'], ['saida', 'Saída']]) {
        const opcao = document.createElement('option');
        opcao.value = valor;
        opcao.textContent = rotulo;
        seletorTipo.appendChild(opcao);
    }

    const campoQuantidade = document.createElement('input');
    campoQuantidade.type = 'number';
    campoQuantidade.name = 'quantidade';
    campoQuantidade.min = '1';
    campoQuantidade.step = '1';
    campoQuantidade.required = true;
    campoQuantidade.value = '1';
    campoQuantidade.setAttribute('aria-label', `Quantidade para ${produto.nome}`);

    const botaoRegistrar = document.createElement('button');
    botaoRegistrar.type = 'submit';
    botaoRegistrar.textContent = 'Registrar';

    formulario.append(seletorTipo, campoQuantidade, botaoRegistrar);
    formulario.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        const quantidade = Number(campoQuantidade.value);
        const tipo = seletorTipo.value;

        if (!Number.isSafeInteger(quantidade) || quantidade <= 0) {
            mostrarMensagem('Informe uma quantidade inteira maior que zero.', true);
            return;
        }

        botaoRegistrar.disabled = true;
        mostrarMensagem('Registrando movimentação...');
        try {
            // O servidor valida permissões, saldo e grava o histórico em uma transação.
            await requisicaoApi(`/api/estoque/${produto.id}/movimentacoes`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': tokenCsrf
                },
                body: JSON.stringify({ tipo, quantidade })
            });
            mostrarMensagem('Movimentação registrada com sucesso.');
            await carregarEstoque();
        } catch (erro) {
            mostrarMensagem(erro.message || 'Não foi possível registrar a movimentação.', true);
        } finally {
            botaoRegistrar.disabled = false;
        }
    });

    celula.appendChild(formulario);
    return celula;
}

// Busca a lista atualizada no backend e desenha a tabela de estoque.
async function carregarEstoque() {
    listaProdutos.replaceChildren();
    const carregando = document.createElement('tr');
    const celulaCarregando = document.createElement('td');
    celulaCarregando.colSpan = 4;
    celulaCarregando.textContent = 'Carregando produtos...';
    carregando.appendChild(celulaCarregando);
    listaProdutos.appendChild(carregando);

    try {
        const dados = await requisicaoApi('/api/estoque');
        listaProdutos.replaceChildren();

        if (!dados.produtos || dados.produtos.length === 0) {
            const linhaVazia = document.createElement('tr');
            const celulaVazia = document.createElement('td');
            celulaVazia.colSpan = 4;
            celulaVazia.textContent = 'Nenhum produto cadastrado.';
            linhaVazia.appendChild(celulaVazia);
            listaProdutos.appendChild(linhaVazia);
            return;
        }

        for (const produto of dados.produtos) {
            const linha = document.createElement('tr');
            linha.appendChild(criarCelula(produto.id));
            linha.appendChild(criarCelula(produto.nome));

            const celulaQuantidade = criarCelula(produto.quantidade);
            if (!produto.disponivel) {
                celulaQuantidade.textContent = `${produto.quantidade} (desativado)`;
            }
            linha.appendChild(celulaQuantidade);
            linha.appendChild(criarControlesMovimentacao(produto));
            listaProdutos.appendChild(linha);
        }
    } catch (erro) {
        listaProdutos.replaceChildren();
        mostrarMensagem(erro.message || 'Não foi possível carregar o estoque.', true);
    }
}

// Encerra a sessão no servidor antes de redirecionar para o login.
async function sairDoSistema() {
    botaoSair.disabled = true;
    mostrarMensagem('Encerrando sessão...');

    try {
        // Obtém um token novo para garantir que o logout passe pela proteção CSRF.
        await carregarTokenCsrf();
        await requisicaoApi('/api/logout', {
            method: 'POST',
            headers: { 'X-CSRF-Token': tokenCsrf }
        });
        tokenCsrf = null;
        window.location.replace('/login.html');
    } catch (erro) {
        mostrarMensagem(erro.message || 'Não foi possível encerrar a sessão.', true);
        botaoSair.disabled = false;
    }
}

// Associa o botão de sair à rota de logout do backend.
if (botaoSair) {
    botaoSair.addEventListener('click', sairDoSistema);
}

// Inicializa a tela apenas após confirmar que a sessão é válida.
async function iniciarPaginaEstoque() {
    try {
        await verificarSessao();
        await carregarTokenCsrf();
        await carregarEstoque();
    } catch (erro) {
        mostrarMensagem(erro.message || 'Não foi possível inicializar o estoque.', true);
    }
}

iniciarPaginaEstoque();
