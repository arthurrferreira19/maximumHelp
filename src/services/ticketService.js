const mongoose = require("mongoose");
const Ticket = require("../models/Ticket");
const User = require("../models/User");
const Sector = require("../models/Sector");
const { HttpError } = require("../utils/httpError");
const { TICKET_STATUS, TICKET_PRIORITIES } = require("../utils/validators");

function isValidId(id) {
    return mongoose.isValidObjectId(id);
}

async function validateUser(id, allowedRoles = null) {
    if (!isValidId(id)) throw new HttpError(400, "Usuário inválido");
    const u = await User.findById(id).select("nome email role ativo setor");
    if (!u || !u.ativo) throw new HttpError(400, "Usuário não encontrado ou inativo");
    if (allowedRoles && !allowedRoles.includes(u.role)) {
        throw new HttpError(400, `Usuário deve ter role: ${allowedRoles.join(", ")}`);
    }
    return u;
}

async function validateSector(id) {
    if (!isValidId(id)) throw new HttpError(400, "Setor inválido");
    const s = await Sector.findById(id);
    if (!s || !s.ativo) throw new HttpError(400, "Setor não encontrado ou inativo");
    return s;
}

function validateEnums({ status, prioridade }) {
    if (status && !TICKET_STATUS.includes(status)) throw new HttpError(400, "Status inválido");
    if (prioridade && !TICKET_PRIORITIES.includes(prioridade)) throw new HttpError(400, "Prioridade inválida");
}

function buildFilter(query) {
    const filter = {};
    const search = (query.search || "").trim();
    const status = (query.status || "").trim();
    const urgente = query.urgente;
    const setor = (query.setor || "").trim();
    const responsavel = (query.responsavel || "").trim();

    if (search) filter.titulo = { $regex: search, $options: "i" };
    if (status && TICKET_STATUS.includes(status)) filter.status = status;
    if (urgente === "true") filter.urgente = true;
    if (urgente === "false") filter.urgente = false;
    if (setor && isValidId(setor)) filter.setor = setor;
    if (responsavel && isValidId(responsavel)) filter.responsavel = responsavel;

    return filter;
}

async function list(query) {
    const filter = buildFilter(query);

    const tickets = await Ticket.find(filter)
        .populate("solicitante", "nome email role")
        .populate("responsavel", "nome email role")
        .populate("setor", "nome")
        .sort({ createdAt: -1 });

    return tickets;
}

async function getById(id) {
    if (!isValidId(id)) throw new HttpError(400, "ID inválido");
    const t = await Ticket.findById(id)
        .populate("solicitante", "nome email role")
        .populate("responsavel", "nome email role setor")
        .populate("setor", "nome")
        .populate("atualizacoes.autor", "nome email role");

    if (!t) throw new HttpError(404, "Chamado não encontrado");
    return t;
}

/**
 * Regra do setor:
 * - Se o responsável tiver setor definido, usa automaticamente
 * - Senão, setor deve ser enviado (e válido/ativo)
 */
async function resolveSectorByResponsavelOrPayload(responsavelId, setorId) {
    // ✅ agora aceita USER também
    const resp = await validateUser(responsavelId, ["ADMIN", "RESPONSAVEL", "USER"]);

    // ✅ se o usuário (responsável) tiver setor, usa automaticamente
    if (resp.setor) return resp.setor;

    // fallback (caso alguém não tenha setor)
    if (!setorId) return null;
    const sec = await validateSector(setorId);
    return sec._id;
}


async function create(payload) {
    const {
        titulo,
        solicitanteAberto,
        descricao,
        prioridade,
        urgente,
        status,
        prazoDias,
        dataInicio,
        dataFim,
        solicitante,
        responsavel,
        setor,
        anexos
    } = payload;

        if (!solicitante || !responsavel) throw new HttpError(400, "Informe solicitante e responsável");

    validateEnums({ status, prioridade });

    await validateUser(solicitante, ["ADMIN", "USER", "RESPONSAVEL"]);
    const setorFinal = await resolveSectorByResponsavelOrPayload(responsavel, setor);

    const ticket = await Ticket.create({
        titulo: String(titulo || "Sem título").trim(),
        solicitanteAberto: String(solicitanteAberto || "").trim(),
        descricao: String(descricao || "").trim(),
        prioridade: prioridade || "Média",
        urgente: !!urgente,
        status: status || "Pendente",
        prazoDias: (typeof prazoDias === "number" && !Number.isNaN(prazoDias)) ? prazoDias : (prazoDias === null ? null : undefined),
        dataInicio: dataInicio ? new Date(dataInicio) : new Date(),
        dataFim: dataFim ? new Date(dataFim) : undefined,
        solicitante,
        responsavel,
        setor: setorFinal,
        anexos: Array.isArray(anexos) ? anexos : [],
        atualizacoes: []
    });

    return getById(ticket._id);
}

async function update(id, payload) {
    if (!isValidId(id)) throw new HttpError(400, "ID inválido");
    const ticket = await Ticket.findById(id);
    if (!ticket) throw new HttpError(404, "Chamado não encontrado");

    const {
        titulo,
        solicitanteAberto,
        descricao,
        prioridade,
        urgente,
        status,
        prazoDias,
        dataInicio,
        dataFim,
        solicitante,
        responsavel,
        setor
    } = payload;

    validateEnums({ status, prioridade });

    if (titulo !== undefined) ticket.titulo = String(titulo).trim();
    if (solicitanteAberto !== undefined) ticket.solicitanteAberto = String(solicitanteAberto || '').trim();
    if (descricao !== undefined) ticket.descricao = String(descricao).trim();
    if (prioridade !== undefined) ticket.prioridade = prioridade;
    if (urgente !== undefined) ticket.urgente = !!urgente;
    if (status !== undefined) ticket.status = status;
    if (dataInicio !== undefined) ticket.dataInicio = new Date(dataInicio);
    if (dataFim !== undefined) ticket.dataFim = new Date(dataFim);

    if (solicitante !== undefined) {
        await validateUser(solicitante, ["ADMIN", "USER", "RESPONSAVEL"]);
        ticket.solicitante = solicitante;
    }

    if (responsavel !== undefined) {
        const setorFinal = await resolveSectorByResponsavelOrPayload(responsavel, setor);
        ticket.responsavel = responsavel;
        ticket.setor = setorFinal;
    } else if (setor !== undefined) {
        // Se não mudou responsável, pode mudar setor manualmente se quiser
        const sec = await validateSector(setor);
        ticket.setor = sec._id;
    }

    await ticket.save();
    return getById(ticket._id);
}

async function updateStatus(id, status) {
    if (!isValidId(id)) throw new HttpError(400, "ID inválido");
    if (!TICKET_STATUS.includes(status)) throw new HttpError(400, "Status inválido");

    const ticket = await Ticket.findById(id);
    if (!ticket) throw new HttpError(404, "Chamado não encontrado");

    ticket.status = status;
    await ticket.save();
    return getById(ticket._id);
}

async function remove(id) {
    if (!isValidId(id)) throw new HttpError(400, "ID inválido");
    const t = await Ticket.findById(id);
    if (!t) throw new HttpError(404, "Chamado não encontrado");
    await Ticket.deleteOne({ _id: id });
}

async function addUpdate(id, { autor, mensagem, anexo }) {
    if (!isValidId(id)) throw new HttpError(400, "ID inválido");
    await validateUser(autor, ["ADMIN", "USER", "RESPONSAVEL"]);

    const ticket = await Ticket.findById(id);
    if (!ticket) throw new HttpError(404, "Chamado não encontrado");

    ticket.atualizacoes.push({
        autor,
        mensagem: String(mensagem).trim(),
        anexo: anexo ? String(anexo).trim() : null
    });

    await ticket.save();
    return getById(ticket._id);
}

async function listBySolicitante(userId, query) {
    const filter = buildFilter(query);
    filter.solicitante = userId;

    const tickets = await Ticket.find(filter)
        .populate("solicitante", "nome email role")
        .populate("responsavel", "nome email role")
        .populate("setor", "nome")
        .sort({ createdAt: -1 });

    return tickets;
}

async function listByResponsavel(userId, query) {
    const filter = buildFilter(query);
    filter.responsavel = userId;

    const tickets = await Ticket.find(filter)
        .populate("solicitante", "nome email role")
        .populate("responsavel", "nome email role")
        .populate("setor", "nome")
        .sort({ createdAt: -1 });

    return tickets;
}


async function addAttachments(id, anexos) {
    if (!isValidId(id)) throw new HttpError(400, "ID inválido");
    const ticket = await Ticket.findById(id);
    if (!ticket) throw new HttpError(404, "Chamado não encontrado");

    ticket.anexos = [...(ticket.anexos || []), ...(Array.isArray(anexos) ? anexos : [])];
    await ticket.save();

    return getById(ticket._id);
}

module.exports = {
    list,
    getById,
    create,
    addAttachments,
    update,
    updateStatus,
    remove,
    addUpdate,
    listBySolicitante,
    listByResponsavel
};
