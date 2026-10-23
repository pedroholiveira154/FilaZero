# O que é a pasta Middleware?

A pasta `middleware/` contém funções executadas durante uma requisição, antes de ela chegar à operação principal. Essas funções permitem verificar condições necessárias para que uma operação seja realizada.

**Exemplos:**
- `verificar-autenticacao.js`: verifica se o usuário está autenticado.
- `permissao-admin.js`: verifica se o usuário possui permissão de administrador.
