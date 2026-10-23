const pg_login = document.getElementById('pagina-login');
const pg_estoque = document.getElementById('pagina-estoque')

if (pg_login) {
    pg_login.addEventListener('submit', async (event) => {
        event.preventDefault();

        const usuario = document.getElementById('usuario').value.trim();
        const senha = document.getElementById('senha').value;

        if (!usuario || !senha) {
            alert('Preencha o usuário e a senha.');
            return;
        }

        try {
            const resposta = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ usuario, senha })
            });

            const dados = await resposta.json();

            if (!resposta.ok) {
                alert(dados.erro || 'Não foi possível entrar.');
                return;
            }

            window.location.href = '/estoque.html';

        } catch (erro) {
            console.error('Erro ao conectar:', erro);
            alert('Não foi possível conectar ao servidor.');
        }
    });
}


if(pg_estoque){

async function verificarAcesso() {
    try {
        const resposta = await fetch('/api/me');

        if (!resposta.ok) {
            window.location.replace('/login.html');
            return;
        }

        // Só carregue os dados do estoque
        // depois que a sessão for confirmada.
        carregarEstoque();

    } catch (erro) {
        console.error('Erro ao verificar sessão:', erro);
    }
}

verificarAcesso();

}