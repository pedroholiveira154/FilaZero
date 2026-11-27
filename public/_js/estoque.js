// Lógica da página privada de estoque do FilaZero.
// O servidor continua sendo a autoridade para autenticação, permissões, regras de
// negócio e saldo. Aqui o frontend apenas coleta os dados, envia e mostra o resultado.

const usuarioLogado = document.getElementById('usuario-logado');
const perfilLogado = document.getElementById('perfil-logado');
const listaProdutos = document.getElementById('lista-produtos');
const mensagem = document.getElementById('mensagem');
const botaoSair = document.getElementById('btn-sair');

const acoesAdmin = document.getElementById('acoes-admin');
const botaoCadastrarProduto = document.getElementById('btn-cadastrar-produto');
const botaoNovoUsuario = document.getElementById('btn-novo-usuario');

const dialogoProduto = document.getElementById('dialogo-produto');
const formProduto = document.getElementById('form-produto');
const dialogoRemocao = document.getElementById('dialogo-remocao');
const formRemocao = document.getElementById('form-remocao');
const dialogoUsuario = document.getElementById('dialogo-usuario');
const formUsuario = document.getElementById('form-usuario');

// O token CSRF fica apenas em memória durante esta visita à página.
let tokenCsrf = null;

// Estado da tela. A visibilidade dos botões é só conveniência: o servidor valida o perfil em toda rota.
let ehAdmin = false;
let categorias = [];
let produtoEmEdicao = null;
let produtoEmRemocao = null;
let temporizadorMensagem = null;

const ROTULOS_PERFIL = { admin: 'Administrador', funcionario: 'Funcionário' };

// Exibe mensagens de sucesso ou de erro na região acessível da página.
function mostrarMensagem(texto, erro = false) {
    mensagem.textContent = texto;
    mensagem.dataset.tipo = erro ? 'erro' : 'sucesso';

    clearTimeout(temporizadorMensagem);
    // Mensagens de sucesso somem sozinhas; erros permanecem até a próxima ação.
    if (texto && !erro) {
        temporizadorMensagem = setTimeout(() => {
            mensagem.textContent = '';
            delete mensagem.dataset.tipo;
        }, 6000);
    }
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

// Envia JSON com o token CSRF exigido pelas operações que alteram dados.
function enviarJson(url, metodo, corpo) {
    const opcoes = {
        method: metodo,
        headers: { 'X-CSRF-Token': tokenCsrf }
    };

    if (corpo !== undefined) {
        opcoes.headers['Content-Type'] = 'application/json';
        opcoes.body = JSON.stringify(corpo);
    }

    return requisicaoApi(url, opcoes);
}

// Busca o token de segurança necessário para registrar movimentações e sair.
async function carregarTokenCsrf() {
    const dados = await requisicaoApi('/api/csrf');
    tokenCsrf = dados.csrfToken;
}

// Consulta a identidade da sessão e libera na tela apenas o que o perfil permite.
async function verificarSessao() {
    const dados = await requisicaoApi('/api/me');
    const usuario = dados.usuario || {};
    usuarioLogado.textContent = usuario.nome || usuario.usuario || 'Usuário autenticado';

    if (usuario.perfil) {
        perfilLogado.textContent = ROTULOS_PERFIL[usuario.perfil] || usuario.perfil;
        perfilLogado.hidden = false;
    }

    ehAdmin = usuario.perfil === 'admin';
    acoesAdmin.hidden = !ehAdmin;
    for (const elemento of document.querySelectorAll('.somente-admin')) {
        elemento.hidden = !ehAdmin;
    }
}

// Carrega as categorias usadas no formulário de produto e na coluna de categorias.
async function carregarCategorias() {
    categorias = await requisicaoApi('/api/tipos');
}

// Formata valores monetários no padrão brasileiro.
function formatarPreco(valor) {
    return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Cria uma célula de tabela usando textContent, evitando interpretar dados do banco como HTML.
function criarCelula(valor, rotulo, classe) {
    const celula = document.createElement('td');
    celula.textContent = String(valor ?? '');
    if (rotulo) celula.dataset.rotulo = rotulo;
    if (classe) celula.className = classe;
    return celula;
}

// Cria os controles de movimentação para cada produto listado no estoque.
function criarControlesMovimentacao(produto) {
    const celula = document.createElement('td');
    celula.dataset.rotulo = 'Movimentação';
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
    botaoRegistrar.className = 'botao botao-pequeno botao-primario';
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
            await enviarJson(`/api/estoque/${produto.id}/movimentacoes`, 'POST', { tipo, quantidade });
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

// Cria as ações administrativas (alterar e remover) de uma linha da tabela.
function criarCelulaAcoes(produto) {
    const celula = document.createElement('td');
    celula.dataset.rotulo = 'Ações';
    celula.className = 'somente-admin celula-acoes';

    const botaoAlterar = document.createElement('button');
    botaoAlterar.type = 'button';
    botaoAlterar.className = 'botao botao-pequeno botao-contorno';
    botaoAlterar.textContent = 'Alterar';
    botaoAlterar.setAttribute('aria-label', `Alterar ${produto.nome}`);
    botaoAlterar.addEventListener('click', () => abrirDialogoProduto(produto));

    const botaoRemover = document.createElement('button');
    botaoRemover.type = 'button';
    botaoRemover.className = 'botao botao-pequeno botao-perigo-contorno';
    botaoRemover.textContent = 'Remover';
    botaoRemover.setAttribute('aria-label', `Remover ${produto.nome}`);
    if (!produto.disponivel) {
        // Produto já desativado: nada a remover. A reativação é feita em "Alterar".
        botaoRemover.disabled = true;
        botaoRemover.title = 'Produto já está desativado.';
    }
    botaoRemover.addEventListener('click', () => abrirDialogoRemocao(produto));

    celula.append(botaoAlterar, botaoRemover);
    return celula;
}

// Desenha uma linha informativa que ocupa toda a tabela (carregando, vazio ou erro).
function mostrarLinhaUnica(texto) {
    listaProdutos.replaceChildren();
    const linha = document.createElement('tr');
    const celula = document.createElement('td');
    celula.colSpan = 7;
    celula.className = 'linha-informativa';
    celula.textContent = texto;
    linha.appendChild(celula);
    listaProdutos.appendChild(linha);
}

// Busca a lista atualizada no backend e desenha a tabela de estoque.
async function carregarEstoque() {
    mostrarLinhaUnica('Carregando produtos...');

    try {
        // O admin precisa dos dados completos para editar; o funcionário só consulta o estoque.
        const produtos = ehAdmin
            ? await requisicaoApi('/api/produtos/admin')
            : (await requisicaoApi('/api/estoque')).produtos;

        if (!produtos || produtos.length === 0) {
            mostrarLinhaUnica('Nenhum produto cadastrado.');
            return;
        }

        const nomesCategorias = new Map(categorias.map(c => [c.id, c.nome]));
        listaProdutos.replaceChildren();

        for (const produto of produtos) {
            const linha = document.createElement('tr');
            if (!produto.disponivel) linha.className = 'linha-desativada';

            linha.appendChild(criarCelula(produto.nome, 'Produto', 'celula-produto'));

            if (ehAdmin) {
                linha.appendChild(criarCelula(formatarPreco(produto.preco), 'Preço', 'somente-admin'));
                const textoCategorias = (produto.categorias || [])
                    .map(id => nomesCategorias.get(id))
                    .filter(Boolean)
                    .join(', ') || '-';
                linha.appendChild(criarCelula(textoCategorias, 'Categorias', 'somente-admin'));
            }

            linha.appendChild(criarCelula(produto.quantidade, 'Quantidade', 'celula-numero'));

            const celulaStatus = document.createElement('td');
            celulaStatus.dataset.rotulo = 'Status';
            const selo = document.createElement('span');
            selo.className = produto.disponivel ? 'selo selo-ativo' : 'selo selo-desativado';
            selo.textContent = produto.disponivel ? 'Ativo' : 'Desativado';
            celulaStatus.appendChild(selo);
            linha.appendChild(celulaStatus);

            linha.appendChild(criarControlesMovimentacao(produto));
            if (ehAdmin) linha.appendChild(criarCelulaAcoes(produto));
            listaProdutos.appendChild(linha);
        }
    } catch (erro) {
        mostrarLinhaUnica('Não foi possível carregar os produtos.');
        mostrarMensagem(erro.message || 'Não foi possível carregar o estoque.', true);
    }
}

// --------------------------------------------------
// DIÁLOGOS: utilitários
// --------------------------------------------------

// Alterna o estado de "enviando" de um botão de envio para evitar cliques duplicados.
function definirEnviando(botao, enviando, textoEnviando) {
    if (enviando) {
        botao.dataset.textoOriginal = botao.textContent;
        botao.textContent = textoEnviando;
    } else if (botao.dataset.textoOriginal) {
        botao.textContent = botao.dataset.textoOriginal;
    }
    botao.disabled = enviando;
}

function mostrarErroDialogo(elemento, texto) {
    elemento.textContent = texto || '';
}

// Todo botão com data-fechar fecha o diálogo em que está.
for (const botao of document.querySelectorAll('[data-fechar]')) {
    botao.addEventListener('click', () => botao.closest('dialog').close());
}

// --------------------------------------------------
// PRODUTO: cadastrar e alterar
// --------------------------------------------------

// Desenha as caixas de seleção de categorias; "marcadas" recebe os ids já associados.
function desenharCategorias(marcadas = []) {
    const lista = document.getElementById('lista-categorias');
    lista.replaceChildren();

    for (const categoria of categorias) {
        const rotulo = document.createElement('label');
        rotulo.className = 'opcao-marcavel';

        const caixa = document.createElement('input');
        caixa.type = 'checkbox';
        caixa.name = 'categorias';
        caixa.value = String(categoria.id);
        caixa.checked = marcadas.includes(categoria.id);

        const texto = document.createElement('span');
        texto.textContent = categoria.nome;

        rotulo.append(caixa, texto);
        lista.appendChild(rotulo);
    }
}

// Abre o formulário vazio (cadastro) ou preenchido (alteração) para um produto.
function abrirDialogoProduto(produto = null) {
    produtoEmEdicao = produto;
    formProduto.reset();
    mostrarErroDialogo(document.getElementById('erro-produto'), '');

    redefinirCampoImagem(produto ? produto.imagem : '');

    const titulo = document.getElementById('titulo-dialogo-produto');
    const campoQuantidade = document.getElementById('campo-quantidade');
    const dicaQuantidade = document.getElementById('dica-quantidade');

    if (produto) {
        titulo.textContent = 'Alterar produto';
        document.getElementById('produto-nome').value = produto.nome;
        document.getElementById('produto-descricao').value = produto.descricao || '';
        document.getElementById('produto-preco').value = Number(produto.preco).toFixed(2);
        document.getElementById('produto-imagem').value = produto.imagem || '';
        document.getElementById('produto-disponivel').checked = Boolean(produto.disponivel);

        // O saldo só muda por movimentações, que ficam registradas no histórico.
        campoQuantidade.hidden = true;
        dicaQuantidade.hidden = false;
        dicaQuantidade.textContent =
            `Estoque atual: ${produto.quantidade}. Para ajustar o saldo, use a coluna Movimentação.`;
        desenharCategorias(produto.categorias || []);
    } else {
        titulo.textContent = 'Cadastrar produto';
        campoQuantidade.hidden = false;
        dicaQuantidade.hidden = true;
        desenharCategorias([]);
    }

    dialogoProduto.showModal();
    document.getElementById('produto-nome').focus();
}

// --------------------------------------------------
// PRODUTO: imagem (envio de arquivo)
// --------------------------------------------------

const arquivoImagem = document.getElementById('produto-arquivo');
const campoImagem = document.getElementById('produto-imagem');
const previaImagem = document.getElementById('previa-imagem');
const estadoImagem = document.getElementById('estado-imagem');
const botaoSalvarProduto = document.getElementById('btn-salvar-produto');

const TEXTO_PADRAO_IMAGEM = 'PNG, JPEG ou WebP, até 2 MB.';
const TIPOS_IMAGEM = ['image/png', 'image/jpeg', 'image/webp'];
const LIMITE_IMAGEM = 2 * 1024 * 1024;
let enviandoImagem = false;

function mostrarPreviaImagem(endereco) {
    if (endereco) {
        previaImagem.src = endereco;
        previaImagem.hidden = false;
    } else {
        previaImagem.removeAttribute('src');
        previaImagem.hidden = true;
    }
}

// Se a imagem atual não puder ser carregada (arquivo ausente), esconde a pré-visualização.
previaImagem.addEventListener('error', () => {
    previaImagem.hidden = true;
});

function mostrarEstadoImagem(texto, erro = false) {
    estadoImagem.textContent = texto;
    estadoImagem.classList.toggle('dica-form--erro', erro);
}

// Deixa o campo de imagem no estado inicial, mostrando a imagem atual quando houver.
function redefinirCampoImagem(caminhoAtual) {
    arquivoImagem.value = '';
    campoImagem.value = caminhoAtual || '';
    mostrarPreviaImagem(caminhoAtual || '');
    mostrarEstadoImagem(TEXTO_PADRAO_IMAGEM);
    enviandoImagem = false;
    botaoSalvarProduto.disabled = false;
}

// Ao escolher um arquivo, ele é enviado ao servidor, que confere o formato e devolve o caminho.
arquivoImagem.addEventListener('change', async () => {
    const arquivo = arquivoImagem.files[0];
    if (!arquivo) return;

    // Verificações apenas para dar retorno rápido; o servidor repete todas elas.
    if (!TIPOS_IMAGEM.includes(arquivo.type)) {
        mostrarEstadoImagem('Escolha uma imagem PNG, JPEG ou WebP.', true);
        arquivoImagem.value = '';
        return;
    }
    if (arquivo.size > LIMITE_IMAGEM) {
        mostrarEstadoImagem('A imagem excede o limite de 2 MB.', true);
        arquivoImagem.value = '';
        return;
    }

    const caminhoAnterior = campoImagem.value;
    const enderecoLocal = URL.createObjectURL(arquivo);
    mostrarPreviaImagem(enderecoLocal);
    mostrarEstadoImagem('Enviando imagem...');
    enviandoImagem = true;
    botaoSalvarProduto.disabled = true;

    try {
        const resposta = await requisicaoApi('/api/produtos/imagem', {
            method: 'POST',
            headers: { 'X-CSRF-Token': tokenCsrf, 'Content-Type': arquivo.type },
            body: arquivo
        });
        campoImagem.value = resposta.imagem;
        mostrarEstadoImagem('Imagem enviada.');
    } catch (erro) {
        // Em caso de falha, volta para a imagem que o produto já tinha.
        mostrarPreviaImagem(caminhoAnterior);
        arquivoImagem.value = '';
        mostrarEstadoImagem(erro.message || 'Não foi possível enviar a imagem.', true);
    } finally {
        enviandoImagem = false;
        botaoSalvarProduto.disabled = false;
    }
});

formProduto.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (enviandoImagem) return;

    const erroProduto = document.getElementById('erro-produto');
    mostrarErroDialogo(erroProduto, '');

    // Validação nativa (obrigatórios, limites, passo). As regras de negócio ficam no servidor.
    if (!formProduto.reportValidity()) return;

    const corpo = {
        nome: document.getElementById('produto-nome').value.trim(),
        descricao: document.getElementById('produto-descricao').value.trim(),
        preco: Number(document.getElementById('produto-preco').value),
        imagem: document.getElementById('produto-imagem').value.trim(),
        disponivel: document.getElementById('produto-disponivel').checked,
        categorias: [...formProduto.querySelectorAll('input[name="categorias"]:checked')]
            .map(caixa => Number(caixa.value))
    };

    const botao = document.getElementById('btn-salvar-produto');
    definirEnviando(botao, true, 'Salvando...');

    try {
        if (produtoEmEdicao) {
            await enviarJson(`/api/produtos/${produtoEmEdicao.id}`, 'PUT', corpo);
            mostrarMensagem('Produto atualizado com sucesso.');
        } else {
            corpo.quantidade = Number(document.getElementById('produto-quantidade').value);
            await enviarJson('/api/produtos', 'POST', corpo);
            mostrarMensagem('Produto cadastrado com sucesso.');
        }

        dialogoProduto.close();
        await carregarEstoque();
    } catch (erro) {
        mostrarErroDialogo(erroProduto, erro.message || 'Não foi possível salvar o produto.');
    } finally {
        definirEnviando(botao, false);
    }
});

// --------------------------------------------------
// PRODUTO: remover (desativação lógica, com confirmação)
// --------------------------------------------------

function abrirDialogoRemocao(produto) {
    produtoEmRemocao = produto;
    document.getElementById('nome-produto-remocao').textContent = produto.nome;
    mostrarErroDialogo(document.getElementById('erro-remocao'), '');
    dialogoRemocao.showModal();
}

formRemocao.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!produtoEmRemocao) return;

    const erroRemocao = document.getElementById('erro-remocao');
    const botao = document.getElementById('btn-confirmar-remocao');
    mostrarErroDialogo(erroRemocao, '');
    definirEnviando(botao, true, 'Removendo...');

    try {
        // O servidor desativa o produto (disponivel = FALSE) e preserva o histórico.
        await enviarJson(`/api/produtos/${produtoEmRemocao.id}`, 'DELETE');
        dialogoRemocao.close();
        mostrarMensagem('Produto removido do cardápio. O histórico foi preservado.');
        await carregarEstoque();
    } catch (erro) {
        mostrarErroDialogo(erroRemocao, erro.message || 'Não foi possível remover o produto.');
    } finally {
        definirEnviando(botao, false);
    }
});

// --------------------------------------------------
// USUÁRIO: criar funcionário ou administrador (somente admin)
// --------------------------------------------------

botaoNovoUsuario.addEventListener('click', () => {
    formUsuario.reset();
    mostrarErroDialogo(document.getElementById('erro-usuario'), '');
    dialogoUsuario.showModal();
    document.getElementById('usuario-nome').focus();
});

formUsuario.addEventListener('submit', async (evento) => {
    evento.preventDefault();

    const erroUsuario = document.getElementById('erro-usuario');
    mostrarErroDialogo(erroUsuario, '');

    if (!formUsuario.reportValidity()) return;

    const usuario = document.getElementById('usuario-nome').value.trim();
    const perfil = document.getElementById('usuario-perfil').value;
    const senha = document.getElementById('usuario-senha').value;
    const confirmacao = document.getElementById('usuario-confirmacao').value;

    // A confirmação existe apenas para evitar erro de digitação; o servidor valida a senha.
    if (senha !== confirmacao) {
        mostrarErroDialogo(erroUsuario, 'As senhas informadas não conferem.');
        return;
    }

    const botao = document.getElementById('btn-salvar-usuario');
    definirEnviando(botao, true, 'Criando...');

    try {
        const criado = await enviarJson('/api/usuarios', 'POST', { usuario, perfil, senha });
        dialogoUsuario.close();
        formUsuario.reset();
        mostrarMensagem(
            `Usuário "${criado.usuario}" criado como ${ROTULOS_PERFIL[criado.perfil] || criado.perfil}.`
        );
    } catch (erro) {
        mostrarErroDialogo(erroUsuario, erro.message || 'Não foi possível criar o usuário.');
    } finally {
        definirEnviando(botao, false);
    }
});

botaoCadastrarProduto.addEventListener('click', () => abrirDialogoProduto(null));

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
        await carregarCategorias();
        await carregarEstoque();
    } catch (erro) {
        mostrarMensagem(erro.message || 'Não foi possível inicializar o estoque.', true);
    }
}

iniciarPaginaEstoque();
