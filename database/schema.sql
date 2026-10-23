-- =====================================================================
-- totem-cantina - schema para MySQL Server 8.0.44
--
-- ATENÇÃO: este script recria o banco e APAGA os dados atuais.
-- Faça backup antes de executar. Remova/comente o DROP se não quiser apagar.
-- =====================================================================

DROP DATABASE IF EXISTS totem_cantina;

CREATE DATABASE totem_cantina
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE totem_cantina;

CREATE TABLE categorias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(50) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE produtos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    descricao VARCHAR(255),
    preco DECIMAL(10,2) NOT NULL,
    quantidade INT NOT NULL DEFAULT 0,
    imagem VARCHAR(255),
    disponivel BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT chk_produtos_preco CHECK (preco >= 0),
    CONSTRAINT chk_produtos_quantidade CHECK (quantidade >= 0)
) ENGINE=InnoDB;

CREATE TABLE produto_categorias (
    produto_id INT NOT NULL,
    categoria_id INT NOT NULL,
    PRIMARY KEY (produto_id, categoria_id),
    CONSTRAINT fk_produto_categoria_produto
        FOREIGN KEY (produto_id) REFERENCES produtos(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_produto_categoria_categoria
        FOREIGN KEY (categoria_id) REFERENCES categorias(id)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE pedidos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    numero_pedido VARCHAR(20) NOT NULL UNIQUE,
    data_pedido DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    forma_pagamento VARCHAR(30),
    status VARCHAR(30) NOT NULL DEFAULT 'Pendente',
    total DECIMAL(10,2) NOT NULL DEFAULT 0,
    CONSTRAINT chk_pedidos_total CHECK (total >= 0)
) ENGINE=InnoDB;

CREATE TABLE pedido_itens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    pedido_id INT NOT NULL,
    produto_id INT NOT NULL,
    quantidade INT NOT NULL,
    preco_unitario DECIMAL(10,2) NOT NULL,
    CONSTRAINT chk_pedido_itens_quantidade CHECK (quantidade > 0),
    CONSTRAINT chk_pedido_itens_preco CHECK (preco_unitario >= 0),
    CONSTRAINT fk_itens_pedido
        FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_itens_produto
        FOREIGN KEY (produto_id) REFERENCES produtos(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    INDEX idx_pedido_itens_produto (produto_id)
) ENGINE=InnoDB;

CREATE TABLE usuarios (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    usuario VARCHAR(100) NOT NULL UNIQUE,
    senha_hash VARCHAR(255) NOT NULL,
    perfil ENUM('admin', 'funcionario') NOT NULL DEFAULT 'funcionario',
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE movimentacoes_estoque (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

    -- NULL quando a saída foi causada por um pedido público do totem.
    usuario_id INT UNSIGNED NULL,

    -- INT assinado porque produtos.id é INT assinado.
    -- Esta compatibilidade corrige o erro MySQL 3780.
    produto_id INT NOT NULL,

    -- Preenchido para saídas geradas por pedidos; NULL para movimentação manual.
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

-- =====================================================================
-- DADOS DE TESTE
-- =====================================================================

INSERT INTO categorias (id, nome) VALUES
    (1, 'Salgados'),
    (2, 'Bebidas'),
    (3, 'Sobremesas'),
    (4, 'Lançamentos'),
    (5, 'Mais Vendidos');

INSERT INTO produtos (nome, descricao, preco, quantidade, imagem, disponivel) VALUES
    ('Coxinha', 'Massa de batata recheada com frango', 8.00, 5, 'img/imgCardapio/coxinha.png', TRUE),
    ('Suco de Laranja', 'Suco natural 300ml', 6.00, 10, 'img/imgCardapio/suco-laranja.png', TRUE),
    ('Brigadeiro', 'Doce de chocolate tradicional', 3.50, 15, 'img/imgCardapio/brigadeiro.png', TRUE),
    ('Pão de Queijo', 'Pão de queijo tradicional', 5.00, 20, 'img/imgCardapio/pao-de-queijo.png', TRUE),
    ('Coca-Cola', 'Refrigerante lata 350ml', 6.00, 15, 'img/imgCardapio/coca.png', TRUE),
    ('Croissant de Chocolate', 'Croissant recheado com chocolate', 7.00, 10, 'img/imgCardapio/croissant-chocolate.png', TRUE);

INSERT INTO produto_categorias (produto_id, categoria_id) VALUES
    (1, 1),
    (2, 2),
    (3, 3),
    (4, 1), (4, 4),
    (5, 2), (5, 4), (5, 5),
    (6, 3), (6, 4);

INSERT INTO pedidos (id, numero_pedido, data_pedido, forma_pagamento, status, total) VALUES
    (1, 'A001', '2026-06-08 15:30:00', 'PIX', 'Pago', 22.00),
    (2, 'A002', '2026-06-08 15:30:00', 'PIX', 'Cancelado', 22.00);

INSERT INTO pedido_itens (pedido_id, produto_id, quantidade, preco_unitario) VALUES
    (1, 1, 2, 8.00),
    (1, 2, 1, 6.00);

-- Não insira senhas de teste nesta tabela. Crie o primeiro administrador
-- com o script criar-admin.js, que grava um hash bcrypt em senha_hash.
