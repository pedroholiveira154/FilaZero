# O que é a pasta Routes?

A pasta `rotas/` contém os arquivos responsáveis por definir os caminhos da API e as operações que podem ser realizadas no sistema.

Cada arquivo organiza as requisições de uma determinada funcionalidade.

**Exemplos:**
- `autenticacao.js`: gerencia as rotas relacionadas ao login.
- `produtos.js`: gerencia as operações de consulta, cadastro, atualização e exclusão de produtos.
- `usuarios.js`: criação de funcionários e administradores (`POST /api/usuarios`). Só administradores autenticados acessam, a senha é gravada com hash bcrypt (custo 12, mesmo padrão do `criar-admin.js`) e a resposta nunca devolve senha nem hash.

**Como o `server.js` usa as rotas:** ele monta `autenticacao.js`, `produtos.js` e `usuarios.js` em `/api`. As verificações de login, perfil e CSRF vêm da pasta `middleware/`, compartilhadas por `server.js` e por estes módulos.

**Testes:** `npm test` (na raiz do projeto) sobe o servidor e executa os testes de `server-mysql/testes/` usando o MySQL configurado no `.env`.
- `imagens.js`: envio de imagem de produto (`POST /api/produtos/imagem`, somente admin, com CSRF). Aceita PNG, JPEG e WebP de até 2 MB, confere o formato pelo conteúdo do arquivo, grava em `public/img/uploads/` com nome aleatório e devolve o caminho para ser salvo em `produtos.imagem`. Adicione `public/img/uploads/` ao `.gitignore`.

**Disponibilidade automática (`server-mysql/disponibilidade.js`):** quando uma venda ou uma saída de estoque zera o saldo, o produto fica indisponível; quando uma entrada leva o saldo de menos de 5 para 5 ou mais, ele volta a ficar disponível. Limite: o banco só tem a coluna `disponivel`, então um produto removido por um administrador que receba uma entrada de estoque nessa mesma condição também volta a ficar disponível.
