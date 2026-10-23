# O que é a pasta database?

A pasta `database/` contém os códigos para criação do Banco de Dados, com todas as tabelas necessárias. **Cuidado**: Esse código DELETA o Banco de Códigos atual, use com precaução.

---

# Utilizando BANCO DE DADOS

## Passo 0: Criando a tabela (No CMD)
  
Acesse a pasta `database/` do totem-cantina

Use o código abaixo:
- "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p < schema.sql **OBS: O caminho do programa do MYSQL muda de PC para PC**
- dir /s /b C:\mysql.exe (Ele procura onde está a pasta do MYSQL)

## Passo 1: Configurar o .env

- Copie o arquivo .env.example (deixe somente .env) e modifique conforme o arquivo pede

## Passo 2: Instalando o necessário

Volte a pasta raiz do projeto: cd C:\Users\Aluno\Desktop\FilaZero, e escreva *npm i* para instalar todas dependências do projeto

## Iniciar o servidor

Acesse a pasta `server-mysql/` e digite *node server.js*

---

# Analisando o Banco de Dados

No CMD digite:
- "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p 
**Insira a senha do root ("admin")**

Códigos:
- USE nome_do_banco;
- SHOW TABLES;

- SELECT * FROM tabelaDesejada;

- DESCRIBE tabelaDesejada;