# O que é a pasta Routes?

A pasta `rotas/` contém os arquivos responsáveis por definir os caminhos da API e as operações que podem ser realizadas no sistema.

Cada arquivo organiza as requisições de uma determinada funcionalidade.

**Exemplos:**
- `autenticacao.js`: gerencia as rotas relacionadas ao login.
- `produtos.js`: gerencia as operações de consulta, cadastro, atualização e exclusão de produtos.
- `usuarios.js`: criação de funcionários e administradores (`POST /api/usuarios`). Só administradores autenticados acessam, a senha é gravada com hash bcrypt (custo 12, mesmo padrão do `criar-admin.js`) e a resposta nunca devolve senha nem hash.

**Como o `server.js` usa as rotas:** ele monta `autenticacao.js`, `produtos.js` e `usuarios.js` em `/api`. As verificações de login, perfil e CSRF vêm da pasta `middleware/`, compartilhadas por `server.js` e por estes módulos.

**Testes:** `npm test` (na raiz do projeto) sobe o servidor e executa os testes de `server-mysql/testes/` usando o MySQL configurado no `.env`.
