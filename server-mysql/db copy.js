// db.js
// Cria um "pool" de conexões com o MySQL — isso é melhor do que uma
// conexão única porque o pool reaproveita conexões entre requisições
// e evita erros de "too many connections" quando o site tem vários
// acessos ao mesmo tempo (como no totem, que ficará rodando o dia todo).

require('dotenv').config(); // lê o arquivo .env e joga em process.env
const mysql = require('mysql2/promise'); // versão do driver que usa async/await

// const pool = mysql.createPool({
//     host: process.env.DB_HOST,
//     port: process.env.DB_PORT,
//     user: process.env.DB_USER,
//     password: process.env.DB_PASSWORD,
//     database: process.env.DB_NAME,
//     charset: 'utf8mb4',
//     waitForConnections: true, // se todas as conexões do pool estiverem ocupadas, espera uma liberar
//     connectionLimit: 10,      // no máximo 10 conexões simultâneas (suficiente para um teste local)
//     queueLimit: 0             // 0 = fila ilimitada de requisições esperando conexão
// });

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = pool;
