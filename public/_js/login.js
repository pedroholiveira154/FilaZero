
const pg_login = document.getElementById('pg-login');

if (pg_login) {
    pg_login.addEventListener('submit', async (event) => {
        event.preventDefault();

        const usuario = document.getElementById('usuario').value.trim();
        const senha = document.getElementById('senha').value;
        const mensagem = document.getElementById('mensagem');

        if (!usuario || !senha) {
            mensagem.textContent = 'Preencha o usuário e a senha.';
            return;
        }

        try {
            const respostaToken = await fetch('/api/csrf');

            if (!respostaToken.ok) {
                throw new Error('Não foi possível iniciar o login.');
            }

            const { csrfToken } = await respostaToken.json();

            const resposta = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken
                },
                body: JSON.stringify({ usuario, senha })
            });

            const dados = await resposta.json();

            if (!resposta.ok) {
                mensagem.textContent =
                    dados.erro || 'Não foi possível entrar.';
                return;
            }

            window.location.replace('/estoque.html');
        } catch (erro) {
            console.error(erro);
            mensagem.textContent = 'Erro ao conectar ao servidor.';
        }
    });
}