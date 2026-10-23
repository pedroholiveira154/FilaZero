
const path = require('path');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');

// Carrega o .env que fica na raiz do projeto totem-cantina.
// O caminho é calculado a partir da localização deste arquivo,
// independentemente da pasta em que o Node.js for executado.
dotenv.config({
    path: path.resolve(__dirname, '../.env')
});

// Verifica se as configurações essenciais foram carregadas.
const variaveisObrigatorias = [
    'DB_HOST',
    'DB_USER',
    'DB_NAME'
];

const variaveisAusentes = variaveisObrigatorias.filter(
    (variavel) => !process.env[variavel]?.trim()
);

if (variaveisAusentes.length > 0) {
    throw new Error(
        `Variáveis ausentes no .env: ${variaveisAusentes.join(', ')}`
    );
}

// Cria um pool de conexões com o MySQL.
// O pool reaproveita conexões e evita abrir uma nova conexão
// para cada requisição recebida pelo servidor.
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = pool;