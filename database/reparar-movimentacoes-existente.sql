-- Use este arquivo se o schema falhou ao criar movimentacoes_estoque
-- e as demais tabelas já existem. Ele NÃO apaga o banco nem os dados.
USE totem_cantina;

CREATE TABLE IF NOT EXISTS movimentacoes_estoque (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT UNSIGNED NULL,
    -- produtos.id é INT assinado; manter o mesmo tipo corrige ERROR 3780.
    produto_id INT NOT NULL,
    pedido_id INT NULL,
    tipo ENUM('entrada', 'saida') NOT NULL,
    quantidade INT UNSIGNED NOT NULL,
    data_hora TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_movimentacao_quantidade CHECK (quantidade > 0),
    CONSTRAINT fk_mov_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT fk_mov_produto
        FOREIGN KEY (produto_id) REFERENCES produtos(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_mov_pedido
        FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
        ON UPDATE CASCADE ON DELETE SET NULL,

    INDEX idx_mov_data (data_hora),
    INDEX idx_mov_usuario (usuario_id),
    INDEX idx_mov_produto (produto_id),
    INDEX idx_mov_pedido (pedido_id)
) ENGINE=InnoDB;
