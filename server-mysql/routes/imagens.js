// Envio de imagens de produtos (somente administradores).
// O arquivo é conferido pelo conteúdo (não pelo nome), recebe um nome aleatório e fica em
// public/img/uploads/. A rota devolve o caminho, que é gravado em produtos.imagem.
const express = require('express');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { exigirPerfil } = require('../middleware/permissao-admin');
const { exigirCsrf } = require('../middleware/verificar-csrf');

const router = express.Router();

const PASTA_UPLOADS = path.join(__dirname, '../../public/img/uploads');
const LIMITE_BYTES = 2 * 1024 * 1024;

// Só o corpo bruto das requisições com estes tipos é lido (SVG fica de fora de propósito).
const lerCorpoBruto = express.raw({
    type: ['image/png', 'image/jpeg', 'image/webp'],
    limit: LIMITE_BYTES
});

// Identifica o formato real pelos primeiros bytes do arquivo.
function detectarExtensao(buffer) {
    const assinaturaPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(assinaturaPng)) return 'png';
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
    if (
        buffer.length >= 12 &&
        buffer.toString('ascii', 0, 4) === 'RIFF' &&
        buffer.toString('ascii', 8, 12) === 'WEBP'
    ) return 'webp';

    return null;
}

function receberArquivo(req, res, next) {
    lerCorpoBruto(req, res, (erro) => {
        if (erro) {
            if (erro.type === 'entity.too.large') {
                return res.status(413).json({ erro: 'A imagem excede o limite de 2 MB.' });
            }
            return next(erro);
        }
        next();
    });
}

router.post(
    '/produtos/imagem',
    exigirPerfil('admin'),
    exigirCsrf,
    receberArquivo,
    async (req, res, next) => {
        try {
            if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
                return res.status(400).json({ erro: 'Envie uma imagem PNG, JPEG ou WebP.' });
            }

            const extensao = detectarExtensao(req.body);
            if (!extensao) {
                return res.status(400).json({ erro: 'O arquivo não é uma imagem PNG, JPEG ou WebP válida.' });
            }

            const nomeArquivo = `${crypto.randomBytes(16).toString('hex')}.${extensao}`;
            await fs.mkdir(PASTA_UPLOADS, { recursive: true });
            await fs.writeFile(path.join(PASTA_UPLOADS, nomeArquivo), req.body, { flag: 'wx' });

            res.status(201).json({ imagem: `img/uploads/${nomeArquivo}` });
        } catch (erro) {
            next(erro);
        }
    }
);

module.exports = router;
