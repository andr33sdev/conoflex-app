"use strict";
// Circuito del depósito 37 (solicitud firmada, disponible firmado, retiro que descuenta) y
// autorización de productos calientes (link público + aviso interno). Helpers puros y testeables;
// el cableado con la base y las rutas vive en server.js.
const crypto = require("crypto");

// Depósitos válidos para una solicitud interna. Solo el 37 entra en el circuito firmado.
const DEPOSITOS_VALIDOS = ["33", "26", "37", "ayolas"];
const DEP_FIRMADO = "37";

// Números que autorizan un producto caliente (WhatsApp, solo dígitos con código de país).
// Configurable por env WHATSAPP_AUTORIZADORES (separados por coma).
const AUTORIZADORES = (process.env.WHATSAPP_AUTORIZADORES || "5491159609333,5491130313691")
  .split(",")
  .map((s) => s.replace(/\D/g, ""))
  .filter(Boolean);

const esDeposito37 = (dep) => String(dep || "") === DEP_FIRMADO;
const requiereFirmaSolicitud = (dep) => esDeposito37(dep);

/** Estado inicial de la solicitud: pendiente de autorización si el producto es caliente, si no, solicitado. */
function estadoInicial({ caliente }) {
  return caliente ? "PENDIENTE_AUTORIZACION" : "SOLICITADO";
}

const nuevoToken = () => crypto.randomBytes(16).toString("hex");

/** Mensaje de WhatsApp (y del aviso interno) con el contexto de lo que se está autorizando. */
function textoAutorizacion({ cantidad, producto, motivoCaliente, solicitante, link }) {
  const partes = [
    `Autorización para retirar un producto caliente de Conoflex.`,
    `Producto: ${producto}.`,
    `Cantidad: ${cantidad}.`,
    motivoCaliente ? `Motivo (marcado como caliente): ${motivoCaliente}.` : null,
    solicitante ? `Lo pidió: ${solicitante}.` : null,
    link ? `Autorizá o rechazá acá: ${link}` : null,
  ].filter(Boolean);
  return partes.join("\n");
}

/** Link público de autorización y accesos directos de WhatsApp para enviárselo a cada autorizador. */
function accesosAutorizacion({ baseUrl, token, cantidad, producto, motivoCaliente, solicitante }) {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  const link = `${base}/?autorizar_interna=${token}`;
  const texto = textoAutorizacion({ cantidad, producto, motivoCaliente, solicitante, link });
  const whatsapp = AUTORIZADORES.map((numero) => ({ numero, url: `https://wa.me/${numero}?text=${encodeURIComponent(texto)}` }));
  return { link, texto, whatsapp };
}

module.exports = {
  DEPOSITOS_VALIDOS,
  DEP_FIRMADO,
  AUTORIZADORES,
  esDeposito37,
  requiereFirmaSolicitud,
  estadoInicial,
  nuevoToken,
  textoAutorizacion,
  accesosAutorizacion,
};
