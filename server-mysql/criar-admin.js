require('dotenv').config();

const readline = require('readline/promises');
const { stdin, stdout } = require('process');
const bcrypt = require('bcrypt');
const pool = require('./db');

async function lerSenhaOculta(pergunta) {
    return new Promise((resolve, reject) => {
        if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
            reject(new Error('Execute este script em um terminal interativo para digitar a senha com segurança.'));
            return;
        }

        stdout.write(pergunta);
        let senha = '';
        stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding('utf8');

        const aoDigitar = tecla => {
            if (tecla === '\u0003') {
                stdin.setRawMode(false);
                stdin.pause();
                stdin.removeListener('data', aoDigitar);
                reject(new Error('Operação cancelada.'));
                return;
            }

            if (tecla === '\r' || tecla === '\n') {
                stdin.setRawMode(false);
                stdin.pause();
                stdin.removeListener('data', aoDigitar);
                stdout.write('\n');
                resolve(senha);
                return;
            }

            if (tecla === '\u007f' || tecla === '\b') {
                if (senha.length) {
                    senha = senha.slice(0, -1);
                    stdout.write('\b \b');
                }
                return;
            }

            if (tecla >= ' ') {
                senha += tecla;
                stdout.write('*');
            }
        };

        stdin.on('data', aoDigitar);
    });
}

async function main() {
    const rl = readline.createInterface({ input: stdin, output: stdout });

    try {
        const usuario = (await rl.question('Nome de usuário do administrador: ')).trim();
        const perfilInformado = (await rl.question('Perfil (admin/funcionario) [admin]: ')).trim();
        const perfil = perfilInformado || 'admin';

        if (!usuario || usuario.length > 100) {
            throw new Error('O usuário deve ter entre 1 e 100 caracteres.');
        }
        if (!['admin', 'funcionario'].includes(perfil)) {
            throw new Error('Perfil inválido.');
        }

        // readline é fechado para permitir a leitura oculta com stdin em modo raw.
        rl.close();

        const senha = await lerSenhaOculta('Senha (mínimo 12 caracteres, não será exibida): ');
        if (senha.length < 12 || Buffer.byteLength(senha, 'utf8') > 72) {
            throw new Error('A senha precisa ter pelo menos 12 caracteres e no máximo 72 bytes UTF-8.');
        }

        const hash = await bcrypt.hash(senha, 12);

        const [resultado] = await pool.execute(
            `INSERT INTO usuarios (usuario, senha_hash, perfil, ativo)
             VALUES (?, ?, ?, TRUE)`,
            [usuario, hash, perfil]
        );

        console.log(`Usuário criado com sucesso. ID: ${resultado.insertId}`);
    } finally {
        try { rl.close(); } catch {}
        await pool.end();
    }
}

main().catch(erro => {
    console.error('Não foi possível criar o usuário:', erro.message);
    process.exitCode = 1;
});
