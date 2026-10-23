// =============================================
// REFERÊNCIAS - INDEX
// =============================================
const pg_index = document.getElementById('pagina-inicial')
const input_nome = document.getElementById('campo-nome-cliente')

// =============================================
// REFERÊNCIAS - CARDAPIO
// =============================================
const pg_cardapio = document.getElementById('pagina-cardapio')

// =============================================
// REFERÊNCIAS - PEDIDO
// =============================================
const pg_pedido = document.getElementById('pagina-pedido')

// =============================================
// REFERÊNCIAS - PAGAMENTO
// =============================================
const pg_pagamento = document.getElementById('pagina-pagamento')

// =============================================
// REFERÊNCIAS - PAGAR
// =============================================
const pg_finalizar = document.getElementById('pagina-finalizar')

// =============================================
// FUNCOES - INDEX
// =============================================
if (pg_index) {
    function iniciarPedido() {

        let nome = input_nome.value.toUpperCase();

        if (nome.trim() !== "") {

            localStorage.setItem('nomeCliente', nome);

            window.location.href = "cardapio.html";

        } else {

            Swal.fire({
                text: "Por favor, preencha o campo 'Seu Nome'",
                icon: "error"
            });

        }
    }

    // Se apertar enter no input, o botão é acionado
    input_nome.addEventListener("keydown", (event) => {

        if (event.key === "Enter") {
            event.preventDefault()
            iniciarPedido();
        }
    });
}

// =============================================
// FUNÇÕES GERAIS - RETORNAR
// =============================================
function retornar() {
    if (pg_cardapio) {
        window.location.href = 'index.html'
    }
    if (pg_pedido) {
        window.location.href = 'cardapio.html'
    }
    if (pg_pagamento) {
        window.location.href = 'pedido.html'
    }
    if(pg_finalizar){
        window.location.href = 'pagamento.html'
    }
}

// =============================================
// FUNÇÕES GERAIS - CARRINHO
// =============================================

function obterCarrinho() {
    return JSON.parse(localStorage.getItem("carrinho")) || [];
}

function calcularTotal(carrinho) {
    return carrinho.reduce((total, produto) => {
        return total + Number(produto.preco);
    }, 0);
}

function formatarPreco(preco) {
    return Number(preco).toFixed(2).replace('.', ',');
}

function mostrarTotal(total) {
    document.getElementById("preco-total").innerHTML = `
            <img
                class="icone-carrinho"
                src="img/imgCompra/carrinho-de-compras.png"
                alt=""
            >
            <h1>R$ ${formatarPreco(total)}</h1>
    `;
}


// =============================================
// FUNCOES - CARDAPIO
// =============================================

async function categoria(){
    const li = document.querySelector('li.ativo');
    const categoria = li.dataset.categoria;

    try{
        console.log(categoria)
    }
    catch(error){
        console.log(error)
        alert("Não foi possível alternar a categoria")
    }
}


if (pg_cardapio) {

    let nomeCliente = document.getElementById('nome-cliente');
    let itens = document.querySelectorAll('.menu-categorias li');
    let item = document.querySelector('.menu-categorias li.ativo');
    const cardapio = document.getElementById("grade-produtos");

    nomeCliente.textContent = localStorage.getItem('nomeCliente');

    // Guarda os produtos vindos do banco
    let produtos = [];

    // Busca os produtos uma vez
    async function carregarProdutos() {
        const resposta = await fetch("http://localhost:3001/api/produtos");
        produtos = await resposta.json();

        mostrarProdutos(produtos);
    }

    // Mostra os produtos na tela
    function mostrarProdutos(produtosFiltrados) {

        // Limpa os produtos que já estão na tela
        cardapio.innerHTML = "";

        produtosFiltrados.forEach(produto => {

            // Card clicável: article com role="button" para funcionar também por teclado
            const item = document.createElement("article");
            item.className = "card-produto";
            item.setAttribute("role", "button");
            item.tabIndex = 0;

            item.innerHTML = `
                <div class="produto-identificacao">
                    <img src="${produto.imagem}" alt="${produto.nome}">
                    <p class="nome-produto">${produto.nome}</p>
                </div>

                <div class="produto-valor">
                    <p>
                        a partir de <br>
                        <span class="preco-produto">
                            R$ ${formatarPreco(produto.preco)}
                        </span>
                    </p>
                </div>
            `;

            function aoSelecionarProduto() {

                // Aviso fecha sozinho: o cliente não precisa tocar em "OK" a cada produto
                Swal.fire({
                    icon: "success",
                    title: "Produto adicionado",
                    timer: 1000,
                    showConfirmButton: true
                });

                adicionarAoCarrinho(produto);
            }

            item.addEventListener("click", aoSelecionarProduto);

            item.addEventListener("keydown", (event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    aoSelecionarProduto();
                }
            });

            cardapio.appendChild(item);
        });
    }

    // Categorias
    itens.forEach(li => {

        li.addEventListener('click', () => {

            if (li.classList.contains('ativo')) {
                li.classList.remove('ativo');
                carregarProdutos()
            } else {
                itens.forEach(i => i.classList.remove('ativo'));
                li.classList.add('ativo');
            }

            // Pega a categoria selecionada
            const categoria = li.dataset.categoria;

            // Filtra os produtos
            const produtosFiltrados = produtos.filter(
                produto => produto.categorias.includes(Number(categoria))
            );

            mostrarProdutos(produtosFiltrados);
        });

    });

    carregarProdutos();


    // FUNÇÃO DO CARRINHO
    function adicionarAoCarrinho(produto) {

        let carrinho = obterCarrinho();

        carrinho.push(produto);

        localStorage.setItem("carrinho", JSON.stringify(carrinho));
    }


    function direcionarPedido() {
        window.location.href = 'pedido.html';
    }
}

// =============================================
// FUNCOES - PEDIDO
// =============================================

if (pg_pedido) {

    const lista = document.getElementById("lista-produtos");

    // pega carrinho
    const carrinho = obterCarrinho();

    carrinho.forEach((produto, index) => {

        const item = document.createElement("div");
        item.classList.add("item-pedido");

        item.innerHTML = `
            <div class="remover-item-pedido">
                <button type="button" class="botao-remover-item" onclick="remover(${index})"
                    aria-label="Remover ${produto.nome}">
                    <img src="img/imgCompra/lixeira-de-reciclagem.png" alt="">
                </button>
            </div>

            <div class="descricao-pedido">

                <h2>${produto.nome}</h2>

                <h2>
                    <span class="preco-pedido">
                        R$ ${formatarPreco(produto.preco)}
                    </span>
                </h2>

            </div>
        `;

        lista.appendChild(item);
    });


    // MOSTRAR TOTAL
    mostrarTotal(calcularTotal(carrinho));


    // remover item
    function remover(index) {

        carrinho.splice(index, 1);

        localStorage.setItem(
            "carrinho",
            JSON.stringify(carrinho)
        );

        location.reload();
    }


    // // botão pagar
    // function pagar() {

    //     alert("Compra realizada!");

    //     localStorage.removeItem("carrinho");

    //     window.location.href = "index.html";
    // }


    function redirecionarPagamento() {
        window.location.href = 'pagamento.html';
    }

}


// =============================================
// FUNCOES - PAGAMENTO
// =============================================

if (pg_pagamento) {

    // pega carrinho
    const carrinho = obterCarrinho();

    // calcula o total
    const total = calcularTotal(carrinho);

    // MOSTRAR TOTAL
    mostrarTotal(total);
    
}

// ADAPTADO: antes esse botão só limpava o carrinho e redirecionava,
    // sem gravar nada. Agora ele registra o pedido de verdade via API.
async function pagar() {

    const carrinho = obterCarrinho();

    const numeroPedido = "A" + String(Date.now()).slice(-6);

    const total = calcularTotal(carrinho);

    const pedido = {
        numeroPedido: numeroPedido,
        formaPagamento: "PIX",
        status: "Pago",
        total: total,
        itens: carrinho.map(produto => ({
            produtoId: produto.id,
            quantidade: 1,
            precoUnitario: produto.preco
        }))
    };

    // Obtém um token de segurança para a requisição.
    const respostaToken = await fetch('/api/csrf');

    if (!respostaToken.ok) {
        throw new Error('Não foi possível obter o token de segurança.');
    }

    const { csrfToken } = await respostaToken.json();

    try {
    // Envia o pedido incluindo o token CSRF.
    const resposta = await fetch('/api/pedidos', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify(pedido)
    });

        if (!resposta.ok) throw new Error("Falha ao registrar pedido");

        alert("Compra realizada!");
        localStorage.removeItem("carrinho");
        window.location.href = "finalizar.html";

    } catch (erro) {
        console.error(erro);
        alert("Não foi possível registrar o pedido. Veja o console.");
    }
}



// =============================================
// FUNCOES - PAGAR
// // =============================================

async function terminaPedido() {
    try {
        const mensagem = document.getElementById("mensagem");

        for (let segundos = 5; segundos > 0; segundos--) {
            mensagem.textContent =
                `Pedido realizado! Você será redirecionado em ${segundos} segundos...`;

            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        mensagem.textContent = "Redirecionando...";

        window.location.href = "index.html";
    }
    catch (erro) {
        console.error(erro);
        alert("Não foi possível finalizar o pedido. Veja o console.");
    }
}