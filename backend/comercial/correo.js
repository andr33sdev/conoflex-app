"use strict";
// Arma el correo crudo (RFC 822) que Gmail recibe como borrador, con o sin adjunto PDF.
const MARCO = 76;
const base64En76 = (buf) => Buffer.from(buf).toString("base64").replace(new RegExp(`(.{${MARCO}})`, "g"), "$1\r\n");
const cabeceraAsunto = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`);
const urlSafe = (b64) => b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/**
 * @param {{to:string, asunto:string, html:string, threadId?:string, adjunto?:{nombre:string, datos:Buffer}}} cfg
 * @returns {{message:{raw:string, threadId?:string}}} listo para gmail.users.drafts.create({ requestBody })
 */
function crearCorreoCrudo({ to, asunto, html, threadId, adjunto }) {
  const subject = cabeceraAsunto(`Re: ${String(asunto || "Presupuesto Conoflex Argentina").replace(/^Re:\s*/i, "")}`);
  const cuerpo = base64En76(Buffer.from(html, "utf8"));
  let lineas;
  if (adjunto && adjunto.datos?.length) {
    const frontera = `conoflex_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const nombre = String(adjunto.nombre || "adjunto.pdf").replace(/[^\w.\- ]/g, "_");
    lineas = [
      `To: ${to}`, `Subject: ${subject}`, "MIME-Version: 1.0",
      `Content-Type: multipart/mixed; boundary="${frontera}"`, "",
      `--${frontera}`, "Content-Type: text/html; charset=utf-8", "Content-Transfer-Encoding: base64", "", cuerpo, "",
      `--${frontera}`, `Content-Type: application/pdf; name="${nombre}"`, "Content-Transfer-Encoding: base64", `Content-Disposition: attachment; filename="${nombre}"`, "", base64En76(adjunto.datos), "",
      `--${frontera}--`, "",
    ];
  } else {
    lineas = [`To: ${to}`, `Subject: ${subject}`, "MIME-Version: 1.0", "Content-Type: text/html; charset=utf-8", "Content-Transfer-Encoding: base64", "", cuerpo];
  }
  const requestBody = { message: { raw: urlSafe(Buffer.from(lineas.join("\r\n")).toString("base64")) } };
  if (threadId) requestBody.message.threadId = threadId;
  return requestBody;
}

module.exports = { crearCorreoCrudo };
