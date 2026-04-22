const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const fs = require('fs');
const https = require('https');
const http = require('http');
const express = require('express');
const QRCode = require('qrcode');

const app = express();
let qrAtual = null;
let sock = null;

const mensagensProcessadas = new Set();
const etapa = {};
const tempoSessao = {};

function atualizarSessao(jid) {
  tempoSessao[jid] = Date.now();
}

const URLS = {
  video1:        'https://res.cloudinary.com/dkouzu5ho/video/upload/v1773239831/video1_vx1msc.mp4',
  video2:        'https://res.cloudinary.com/dkouzu5ho/video/upload/v1773239831/video2_nyxew7.mp4',
  audio:         'https://res.cloudinary.com/dkouzu5ho/video/upload/v1773239830/audiok1_hh2sm6.ogg',
  licenciaturas: 'https://res.cloudinary.com/dkouzu5ho/image/upload/v1773239831/licenciaturas_zqtt5k.jpg'
};

const PDF = {
  pos:    './posgraduacao.pdf',
  planos: './planos.pdf'
};

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function baixarBuffer(url) {
  return new Promise((resolve, reject) => {
    const protocolo = url.startsWith('https') ? https : http;
    protocolo.get(url, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return baixarBuffer(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}



const aproveitamento = {
  "alagoas":            "✅ Dispensa Completa",
  "amazonas":           "3 disciplinas + Atividades em 3 meses",
  "bahia":              "4 disciplinas + 4 Atividades em 6 meses",
  "ceará":              "7 disciplinas em 6 meses",
  "espírito santo":     "14 disciplinas + 4 Atividades em 12 meses",
  "força aérea":        "4 disciplinas + 4 Atividades em 6 meses",
  "gcm paranaguá":      "5 Disciplinas + 4 Atividades em 6 meses",
  "maranhão":           "3 disciplinas + 4 atividades em 6 meses",
  "mato grosso":        "6 disciplinas + 4 atividades em 8 meses",
  "mato grosso do sul": "3 disciplinas + 4 atividades em 4 meses",
  "minas gerais":       "• PM: 3 disciplinas + Atividades em 3 meses\n• Bombeiros: 3 disciplinas + Atividades em 3 meses",
  "pará":               "• PM: 3 disciplinas + Atividades em 3 meses\n• Bombeiro: 7 disciplinas em 6 meses",
  "paraíba":            "6 disciplinas + Atividades em 6 meses",
  "paraná":             "• PM: 6 disciplinas em 3 meses\n• Bombeiro: 6 disciplinas + 4 atividades em 8 meses",
  "pernambuco":         "3 disciplinas + Atividades em 3 meses",
  "piauí":              "• Soldado: 3 disciplinas + 4 Atividades em 6 meses\n• Bombeiros: 6 disciplinas + 4 Atividades em 6 meses",
  "são paulo":          "✅ Dispensa Completa",
  "sergipe":            "4 disciplinas em 3 meses",
  "rondônia":           "• A partir de 2010: 6 disciplinas em 3 meses\n• Anterior a 2010: 13 disciplinas em 6 meses",
  "roraima":            "• Soldado: 16 disciplinas + Atividades em 15 meses\n• Cabo: 7 disciplinas + Atividades em 8 meses\n• Sargento: 3 disciplinas + Atividades em 4 meses",
  "rio de janeiro":     "Soldado: 3 disciplinas + 4 Atividades em 6 meses",
  "rio grande do norte":"3 disciplinas + 4 Atividades em 6 meses",
  "rio grande do sul":  "3 disciplinas + 4 Atividades em 6 meses",
  "tocantins":          "7 disciplinas + 4 atividades em 9 meses"
};

const siglas = {
  "al": "alagoas",
  "am": "amazonas",
  "ba": "bahia",
  "ce": "ceará",
  "es": "espírito santo",
  "ma": "maranhão",
  "mt": "mato grosso",
  "ms": "mato grosso do sul",
  "mg": "minas gerais",
  "pa": "pará",
  "pb": "paraíba",
  "pr": "paraná",
  "pe": "pernambuco",
  "pi": "piauí",
  "sp": "são paulo",
  "se": "sergipe",
  "ro": "rondônia",
  "rr": "roraima",
  "rj": "rio de janeiro",
  "rn": "rio grande do norte",
  "rs": "rio grande do sul",
  "to": "tocantins"
};

function detectarEstado(msg) {
  if (siglas[msg]) return siglas[msg];
  for (let estado in aproveitamento) {
    if (msg.includes(estado)) return estado;
  }
  if (msg.includes("forca aerea") || msg.includes("força aérea") || msg.includes("fab")) return "força aérea";
  if (msg.includes("gcm") || msg.includes("paranagua") || msg.includes("paranaguá")) return "gcm paranaguá";
  if (msg.includes("rondonia") || msg.includes("rondônia")) return "rondônia";
  if (msg.includes("roraima")) return "roraima";
  if (msg.includes("piaui") || msg.includes("piauí")) return "piauí";
  return null;
}

async function enviarTexto(jid, texto) {
  try {
    await sock.sendMessage(jid, { text: texto });
  } catch (e) {
    console.log("Erro ao enviar texto:", e.message);
  }
}

async function enviarImagem(jid, url, caption) {
  try {
    await sock.sendMessage(jid, {
      image: { url },
      caption
    });
    console.log("✅ Imagem enviada");
  } catch (e) {
    console.log("❌ Erro imagem:", e.message);
  }
}

async function enviarVideo(jid, url, caption) {
  try {
    await sock.sendMessage(jid, {
      video: { url },
      caption
    });
    console.log("✅ Vídeo enviado");
  } catch (e) {
    console.log("❌ Erro vídeo:", e.message);
  }
}

async function enviarAudio(jid, url) {
  try {
    await sock.sendMessage(jid, {
      audio: { url },
      mimetype: 'audio/ogg; codecs=opus',
      ptt: true
    });
    console.log("✅ Áudio enviado");
  } catch (e) {
    console.log("❌ Erro áudio:", e.message);
  }
}

async function enviarPDF(jid, caminho, caption) {
  try {
    const buffer = fs.readFileSync(caminho);
    const nome = caminho.replace('./', '');
    await sock.sendMessage(jid, { document: buffer, mimetype: 'application/pdf', fileName: nome, caption });
    console.log(`✅ PDF enviado: ${nome}`);
  } catch (e) {
    console.log(`❌ Erro PDF:`, e.message);
  }
}

async function mostrarMenu(jid) {

  etapa[jid] = "menu";

  await enviarTexto(jid,
`👮‍♂️ Olá! Seja muito bem-vindo.

Como posso te ajudar agora?

1️⃣ Plataforma de Estudo
2️⃣ Sobre seu Curso
3️⃣ Diplomas e Certificados
4️⃣ Outros assuntos

Digite apenas o número.`);
}

async function processarMensagem(jid, texto) {

const msg = texto.toLowerCase().trim();
if (!msg) return;
if (
msg.includes("oi") ||
msg.includes("ola") ||
msg.includes("olá") ||
msg.includes("bom dia") ||
msg.includes("boa tarde") ||
msg.includes("boa noite")
) {
  return mostrarMenu(jid);
}


console.log(`[${jid}] Mensagem: "${msg}" | Etapa: ${etapa[jid]}`);

if (etapa[jid] === "finalizado") {

  if (["menu","inicio","início","voltar","0"].includes(msg)) {
    etapa[jid] = "menu";
    return mostrarMenu(jid);
  }

  await enviarTexto(jid,
`✅ Atendimento finalizado.

Se precisar de algo novamente digite:

*menu*

ou

*0* para voltar ao início.`);

  return;
}

  // COMANDO MENU
if (["menu","inicio","início","voltar"].includes(msg)) {
  etapa[jid] = "menu";
  console.log(`[${jid}] Mensagem: "${msg}" | Etapa: ${etapa[jid]}`);
  return mostrarMenu(jid);
}

if (!etapa[jid]) {
  etapa[jid] = "menu";
return mostrarMenu(jid);
}

if (etapa[jid] === "menu") {

  if (msg === "5") {
    etapa[jid] = "menu";

    await enviarTexto(jid,
`🔄 Atendimento reiniciado.

Como posso te ajudar?

1️⃣ Plataforma de Estudo  
2️⃣ Sobre seu Curso  
3️⃣ Diplomas e Certificados  
4️⃣ Atendimento e Suporte  

✍️ Digite apenas o número.`);
    
    return;
  }

  if (msg === "1") {

    etapa[jid] = "finalizado";

    await enviarTexto(jid,
`📚 *Plataforma de Estudos*

Nossa plataforma é **100% online**, simples e prática.

Você pode estudar:
📱 Pelo celular  
💻 Pelo computador  
⏰ No horário que quiser

👇 Acesse a plataforma no link abaixo:

LINK_PLATAFORMA`);

    return;
  }


  if (msg === "2") {

    etapa[jid] = "curso_menu";

    await enviarTexto(jid,
`🎓 *Sobre qual curso você gostaria de saber mais?*

Escolha uma das opções abaixo:

1️⃣ Bacharelado  
2️⃣ Diplomação em Gestão Pública  
3️⃣ Licenciaturas  
4️⃣ Pós-graduação  
5️⃣ 🔙 Voltar

✍️ Digite apenas o número da opção.`);

    return;
  }


  if (msg === "3") {

    etapa[jid] = "finalizado";

    await enviarTexto(jid,
`📜 *Diplomas e Certificados*

Todos os cursos possuem **certificação válida em todo o território nacional**, conforme a legislação educacional vigente.

🎓 Os diplomas e certificados são emitidos por **instituição de ensino superior credenciada**, garantindo autenticidade, reconhecimento e validade para fins acadêmicos e profissionais.

Eles podem ser utilizados para:

✅ Progressão na carreira  
✅ Provas de títulos em concursos  
✅ Atuação profissional na área de formação  
✅ Continuidade acadêmica

📄 Após a conclusão do curso, o aluno poderá solicitar a emissão do **certificado ou diploma oficial no site abaixo**.

https://fauespmilitar.com.br/certificadosfauesp.html`);

    return;
  }


  if (msg === "4") {

    etapa[jid] = "outros_menu";

    await enviarTexto(jid,
`💬 *Outros assuntos*

Como podemos te ajudar?

1️⃣ Adquirir um novo curso  
2️⃣ Dúvidas cadastrais  
3️⃣ Financeiro  
4️⃣ Encerrar atendimento  
5️⃣ 🔙 Voltar ao início

✍️ Digite apenas o número.`);

    return;
  }

  await enviarTexto(jid, `😅 Não consegui entender.

Escolha uma opção:

1️⃣ Adquirir um novo curso  
2️⃣ Dúvidas cadastrais  
3️⃣ Financeiro  
4️⃣ Encerrar atendimento  
5️⃣ 🔙 Voltar ao início`);
}
if (etapa[jid] === "curso_menu") {

  // MENU PRINCIPAL
  if (msg === "0") {
    etapa[jid] = "menu";

    await enviarTexto(jid,
`🏠 MENU PRINCIPAL

1️⃣ Plataforma de Estudo
2️⃣ Sobre seu Curso
3️⃣ Diplomas e Certificados
4️⃣ Outros assuntos

Digite apenas o número.`);
  
  return;
}

// VOLTAR
  if (msg === "9") {
    etapa[jid] = "menu";
        await enviarTexto(jid,
`🔙 Voltando ao menu principal.

1️⃣ Plataforma de Estudo
2️⃣ Sobre seu Curso
3️⃣ Diplomas e Certificados
4️⃣ Outros assuntos`);

    return;
  }

      if (msg === "1") {
    etapa[jid] = "finalizado";


await enviarTexto(jid,
`🎓 *Bacharelado em Educação Física*

O curso possui duração de *12 meses* e é destinado a alunos que **já possuem ou estão cursando Licenciatura em Educação Física** e desejam concluir o Bacharelado de forma **rápida e estratégica**.

📚 *Formato do curso*

O curso atende aos parâmetros *semipresenciais exigidos pelo MEC*.

Os conteúdos são disponibilizados **100% online**, através de uma plataforma moderna e atualizada.

A organização acadêmica acontece em:
• *4 módulos trimestrais*
• duração total de *12 meses*

🏃‍♂️ *Requisito prático*

São exigidas *700 horas de estágio presencial*, distribuídas nas seguintes áreas:

• Lazer e Recreação  
• Atividades em Academia  
• Saúde  
• Treinamento Esportivo  

✅ Trata-se de um projeto exclusivo, estruturado para **otimizar o tempo de formação sem comprometer a qualidade acadêmica**.

`);

    return;
  }

  if (msg === "2") {
    etapa[jid] = "estado";

    await enviarTexto(jid,
`Perfeito 👮‍♂️

Para verificar o aproveitamento da sua formação policial precisamos saber:

De qual estado você é?

Digite o nome ou a sigla.

🔙 9 Voltar
🏠 0 Menu principal`);

    return;
  }

  if (msg === "3") {
    etapa[jid] = "finalizado";

   
await enviarTexto(jid,
`📚 *Licenciaturas – Complementação Pedagógica (R4)*

Os cursos de *R4 – Complementação Pedagógica* são formações de Licenciatura alinhadas às diretrizes mais recentes do MEC.

Eles foram desenvolvidos para proporcionar *habilitação docente de forma objetiva, prática e eficiente*.

💻 *Metodologia*

A formação acontece em formato *100% online*, através de uma plataforma moderna e atualizada.

A estrutura do curso é organizada em:

• *4 módulos trimestrais*  
• duração total de *12 meses*

📋 *Requisitos para conclusão*

Para finalizar o curso é necessário:

• Realizar *400 horas de estágio supervisionado*  
• Apresentar o *Trabalho de Conclusão de Curso (TCC)* no último módulo

✅ É um modelo otimizado, pensado para *conciliar rotina profissional com progressão acadêmica*, mantendo conformidade com as normas do MEC e qualidade na formação.`
);

await delay(3000);

await enviarImagem(jid, URLS.licenciaturas, "📚 Licenciaturas disponíveis");

return;
  }

  if (msg === "4") {
    etapa[jid] = "finalizado";

await enviarTexto(jid,
`🎓 *Pós-Graduações*

Os cursos de *Pós-Graduação* possuem **450 horas de carga horária** e foram estruturados para uma conclusão **rápida, prática e eficiente**.

💻 *Formato do curso*

A modalidade é **100% online**, com acesso a:

• Conteúdos em PDF  
• Aulas gravadas  
• Atividades avaliativas  

Tudo disponível em uma **plataforma moderna e intuitiva**.

⏱ *Prazo de conclusão*

O prazo mínimo para conclusão é de *4 meses*.

Após finalizar o curso, o aluno poderá solicitar o **certificado reconhecido pelo MEC e válido em todo o território nacional**.

✅ É uma solução acadêmica estratégica para quem busca **especialização com flexibilidade e rapidez**, sem abrir mão da qualidade na formação.
`);

await delay(3000);

await enviarPDF(jid, PDF.pos, "📄 Opções de Pós-graduação");

return;
  }

  await enviarTexto(jid, "Digite apenas 1, 2, 3, 4 ou 5.");
}}

// MENU OUTROS ASSUNTOS
if (etapa[jid] === "outros_menu") {

  if (msg === "1") {
    etapa[jid] = "planos_menu";

    await enviarTexto(jid,
`🚨 *OPORTUNIDADE DE FORMAÇÃO* 🚨

Temos alguns planos disponíveis.

Escolha qual deseja conhecer:

1️⃣ Plano 7 — Formação Completa
2️⃣ Plano 4 — Mais Procurado
3️⃣ Plano 6 — Pós-graduações
4️⃣ Plano 12 — Área de Segurança
5️⃣ Plano 2 — Gestão Pública
6️⃣ Plano 5 — Complementação (R4)
7️⃣ Educação Física
8️⃣ Falar com especialista
9️⃣ 🔙 Voltar

✍️ Digite apenas o número da opção.`);

    return;
  }

  if (msg === "2") {
    etapa[jid] = "finalizado";

    await enviarTexto(jid,
`📋 *Dúvidas cadastrais*

Vou encaminhar você para um atendente especializado.

Aguarde um momento.`);

    return;
  }

  if (msg === "3") {
    etapa[jid] = "finalizado";

    await enviarTexto(jid,
`💳 *Financeiro*

Vou encaminhar você para o setor responsável.

Aguarde um momento.`);

    return;
  }

  if (msg === "4") {
    etapa[jid] = "finalizado";

    await enviarTexto(jid,
`✅ Atendimento encerrado.

Sempre que precisar estamos à disposição!`);

    return;
  }

  if (msg === "5") {
    etapa[jid] = "menu";

    await enviarTexto(jid,
`👋 *Menu principal*

1️⃣ Plataforma de Estudo
2️⃣ Sobre os Cursos
3️⃣ Diplomas e Certificados
4️⃣ Outros Assuntos`);

    return;
  }

}
// MENU DE PLANOS
if (etapa[jid] === "planos_menu") {

  if (msg === "1") {

    etapa[jid] = "finalizado";

    await enviarTexto(jid,
`🔥 *PLANO 7 — FORMAÇÃO MAIS COMPLETA*

Inclui:

✅ Gestão Pública
✅ 2 Complementações (R4)
✅ 3 Pós-graduações

🎁 + 3 cursos de extensão grátis

💳 Investimento

12x R$549 no cartão
12x R$599 no boleto

👇 Para iniciar sua matrícula:

LINK_PLANO7`);

    return;
  }

  if (msg === "2") {

    etapa[jid] = "finalizado";

    await enviarTexto(jid,
`🔥 *PLANO 4 — MAIS PROCURADO*

Inclui:

✅ Gestão Pública
✅ Complementação (R4)
✅ Pós-graduação

💳 Investimento

12x R$349 no cartão
12x R$399 no boleto

👇 Faça sua matrícula:

LINK_PLANO4`);

    return;
  }

  if (msg === "3") {

    etapa[jid] = "finalizado";

    await enviarTexto(jid,
`💸 *PLANO 6 — MELHOR CUSTO-BENEFÍCIO*

Inclui:

✅ 3 Pós-graduações
✅ + 3 cursos de extensão

💳 Investimento

12x R$199 no cartão
12x R$249 no boleto

👇 Confira:

LINK_PLANO6`);

    return;
  }

  if (msg === "8") {

    etapa[jid] = "finalizado";

    await enviarTexto(jid,
`👨‍💼 Vou encaminhar você para um especialista que poderá indicar o melhor plano para seu objetivo.

Aguarde um momento.`);

    return;
  }

  if (msg === "9") {

    etapa[jid] = "outros_menu";

    await enviarTexto(jid,
`💬 *Outros assuntos*

1️⃣ Adquirir um curso
2️⃣ Dúvidas cadastrais
3️⃣ Financeiro
4️⃣ Encerrar atendimento
5️⃣ 🔙 Voltar`);

    return;
  }
if (msg === "4") {

  etapa[jid] = "finalizado";

  await enviarTexto(jid,
`🔐 *PLANO 12 — ÁREA DE SEGURANÇA*

Inclui:

✅ Gestão Pública  
✅ Gestão em Segurança Privada

💳 Investimento

12x R$449 no cartão  
12x R$499 no boleto

👇 Para iniciar sua matrícula:

LINK_PLANO12`);

  return;
}

if (msg === "5") {

  etapa[jid] = "finalizado";

  await enviarTexto(jid,
`🎓 *PLANO 2 — DIPLOMAÇÃO EM GESTÃO PÚBLICA*

Ideal para quem quer concluir graduação rapidamente.

💳 Investimento

12x R$299 no cartão  
6x R$638 no boleto

👇 Inicie sua matrícula:

LINK_PLANO2`);

  return;
}

if (msg === "6") {

  etapa[jid] = "finalizado";

  await enviarTexto(jid,
`📚 *PLANO 5 — COMPLEMENTAÇÃO PEDAGÓGICA (R4)*

Indicado para quem já possui graduação.

💳 Investimento

12x R$249 no cartão  
12x R$299 no boleto

👇 Confira as áreas disponíveis:

LINK_R4`);

  return;
}

if (msg === "7") {

  etapa[jid] = "finalizado";

  await enviarTexto(jid,
`🏋️ *FORMAÇÃO EM EDUCAÇÃO FÍSICA*

Disponível combinação de:

✅ Bacharelado  
✅ Complementação Pedagógica

💳 Planos a partir de:

12x R$399

👇 Confira as opções:

LINK_EDF`);

  return;
}
}

 if (etapa[jid] === "estado") {

  if (msg === "9") {
    etapa[jid] = "curso_menu";

    await enviarTexto(jid,
`🎓 Sobre qual curso você gostaria de saber?

1️⃣ Bacharelado  
2️⃣ Diplomação em Gestão Pública  
3️⃣ Licenciaturas  
4️⃣ Pós-graduação  
5️⃣ 🔙 Voltar`);

    return;
  }

  const estadoDetectado = detectarEstado(msg);

    if (!estadoDetectado) {
      await enviarTexto(jid,
        "Não consegui identificar o estado 😅\n\n" +
        "Pode digitar o nome completo ou a sigla, por exemplo:\n" +
        "*São Paulo* ou *SP*\n" +
        "*Minas Gerais* ou *MG*\n" +
        "*Roraima* ou *RR*"
      );
      return;
    }

    etapa[jid] = "finalizado";
    const info = aproveitamento[estadoDetectado];

    await enviarTexto(jid,
   `Sensacional! 🇧🇷\n\n` +
`Seu estado é *${estadoDetectado.charAt(0).toUpperCase() + estadoDetectado.slice(1)}*.\n\n` +
   `Sem dúvida, um grande Estado do nosso Brasil e com excelentes profissionais da segurança pública.\n\n` +
   `Vou te encaminhar agora um vídeo explicativo mostrando como funciona a *Diplomação em Gestão Pública* realizada pela Faculdade FAUESP, com o aproveitamento da nossa formação policial.\n\n` +
   `📚 Atualmente a FAUESP já está presente em *22 Estados* do Brasil.\n\n` +
   `Nos Estados de *São Paulo* e *Alagoas*, o aproveitamento da formação policial é de *100%*, ou seja, não é necessário cursar disciplinas ou atividades adicionais para a conclusão.\n\n` +
   `QRV! 🚀`
    );

    await delay(2000);
    await enviarTexto(jid, `📚 *Aproveitamento da sua formação*\n\n${info}`);
    await delay(3000);


    await enviarTexto(jid,
      `🚨🚨🚨\nAlém da Diplomação em Gestão Pública a FAUESP também oferece:\n\n• 15 Licenciaturas\n• Bacharel em Educação Física\n• 93 Pós-graduações`
    );
    await delay(3000);

    await enviarPDF(jid, PDF.planos, "💰 Planos e valores\n\n🔥 *PLANOS EM PROMOÇÃO* 🔥\nPlanos 4 e 7 - estão em promoção até 31MAR26");
    await delay(2000);

    await enviarTexto(jid,
      `Matrícula 👇\n\nhttps://www.fauespmilitar.com.br/requerimento_fauesp.html`
   );

return;
  }

function extrairTexto(msg) {
  const m = msg.message;

  if (!m) return "";

  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage) return m.extendedTextMessage.text;
  if (m.imageMessage) return m.imageMessage.caption;
  if (m.videoMessage) return m.videoMessage.caption;
  if (m.buttonsResponseMessage) return m.buttonsResponseMessage.selectedButtonId;
  if (m.listResponseMessage) return m.listResponseMessage.title;
  if (m.templateButtonReplyMessage) return m.templateButtonReplyMessage.selectedId;

  return "";
}
async function conectar() {
  const { state, saveCreds } = await useMultiFileAuthState('./baileys_auth');
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['Bot FAUESP', 'Chrome', '1.0']
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      qrAtual = qr;
      console.log('📱 QR gerado! Acesse /qr para escanear');
    }

    if (connection === 'open') {
      qrAtual = null;
      console.log('✅ Bot conectado!');
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error instanceof Boom
        ? lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut
        : true;

      console.log('⚠️ Conexão fechada. Reconectar:', shouldReconnect);
      if (shouldReconnect) {
        await delay(5000);
        conectar();
      } else {
        console.log('❌ Deslogado. Acesse /qr para reconectar.');
        // Limpa sessão para forçar novo QR
        try { fs.rmSync('./baileys_auth', { recursive: true, force: true }); } catch(e) {}
        await delay(3000);
        conectar();
      }
    }
  });

sock.ev.on('messages.upsert', async ({ messages, type }) => {
  if (type !== 'notify') return;

  for (const msg of messages) {
    try {

      if (!msg.message) continue;

      const jid = msg.key.remoteJid;

      if (msg.key.fromMe) continue;
      if (!jid) continue;
      if (jid === 'status@broadcast') continue;
      if (jid.endsWith('@g.us')) continue;

      // RESET AUTOMÁTICO DE SESSÃO
      if (tempoSessao[jid] && Date.now() - tempoSessao[jid] > 1800000) {
        etapa[jid] = "menu";
      }

      const msgId = msg.key.id;

if (mensagensProcessadas.has(msgId)) continue;
mensagensProcessadas.add(msgId);

if (mensagensProcessadas.size > 1000) {
  mensagensProcessadas.clear();
}

const texto = extrairTexto(msg);

if (!texto) continue;

// ATUALIZA O TEMPO DA SESSÃO
atualizarSessao(jid);

console.log("Mensagem recebida:", texto);

await processarMensagem(jid, texto);

    } catch (e) {
      console.log("Erro ao processar mensagem:", e);
    }
  }
}); 

}

app.get('/qr', async (req, res) => {
  if (!qrAtual || sock?.user) {
    return res.send(`
      <h2>⏳ Aguardando QR...</h2>
      <p>O QR ainda não foi gerado ou o bot já está conectado.</p>
      <script>setTimeout(()=>location.reload(), 3000)</script>
    `);
  }
  const qrImage = await QRCode.toDataURL(qrAtual);
  res.send(`
    <html><body style="text-align:center;font-family:Arial">
    <h2>📱 Escaneie com seu WhatsApp</h2>
    <img src="${qrImage}" width="300"/>
    <p>WhatsApp → Aparelhos Conectados → Conectar aparelho</p>
    </body></html>
  `);
});
app.get('/logout', async (req, res) => {
  try {
    await sock.logout();
    fs.rmSync('./baileys_auth', { recursive: true, force: true });

    res.send("✅ WhatsApp desconectado com sucesso.");
    console.log("⚠️ WhatsApp desconectado manualmente");

  } catch (e) {
    res.send("Erro ao desconectar: " + e.message);
  }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Servidor rodando na porta ${PORT}`));

conectar();