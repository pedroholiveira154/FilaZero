// Regra de disponibilidade automática dos produtos conforme o estoque.
//
// - Saldo chegou a zero: o produto fica indisponível (some do cardápio).
// - Saldo voltou a ficar com ESTOQUE_MINIMO_PARA_REATIVAR ou mais, vindo de um saldo
//   menor que isso: o produto volta a ficar disponível.
// - Entre 1 e 4 unidades o produto mantém o estado em que estava.
//
// Limite conhecido: o banco só tem a coluna "disponivel", então não há como distinguir
// "esgotou" de "removido pelo administrador". Um produto removido que receba uma entrada de
// estoque levando o saldo de menos de 5 para 5 ou mais volta a ficar disponível.
const ESTOQUE_MINIMO_PARA_REATIVAR = 5;

// Deve ser chamada dentro da mesma transação que alterou o saldo.
// saldoAnterior pode ser null quando só importa verificar se o produto esgotou (venda).
async function ajustarDisponibilidadePorEstoque(conexao, produtoId, saldoAnterior = null) {
    const [[produto]] = await conexao.execute(
        'SELECT quantidade FROM produtos WHERE id = ?',
        [produtoId]
    );
    if (!produto) return;

    const saldo = Number(produto.quantidade);

    if (saldo <= 0) {
        await conexao.execute(
            'UPDATE produtos SET disponivel = FALSE WHERE id = ?',
            [produtoId]
        );
        return;
    }

    if (
        saldoAnterior !== null &&
        saldoAnterior < ESTOQUE_MINIMO_PARA_REATIVAR &&
        saldo >= ESTOQUE_MINIMO_PARA_REATIVAR
    ) {
        await conexao.execute(
            'UPDATE produtos SET disponivel = TRUE WHERE id = ?',
            [produtoId]
        );
    }
}

module.exports = { ESTOQUE_MINIMO_PARA_REATIVAR, ajustarDisponibilidadePorEstoque };
