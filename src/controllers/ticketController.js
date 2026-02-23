const { asyncHandler } = require("../utils/asyncHandler");
const { HttpError } = require("../utils/httpError");
const ticketService = require("../services/ticketService");

function isAdmin(user) {
    return user?.role === "ADMIN";
}
function isUser(user) {
    return user?.role === "USER";
}
function isResponsavel(user) {
    return user?.role === "RESPONSAVEL";
}


function filesToMeta(req) {
    const files = Array.isArray(req.files) ? req.files : [];
    return files.map(f => ({
        originalName: f.originalname,
        filename: f.filename,
        mimetype: f.mimetype,
        size: f.size,
        url: `/uploads/tickets/${f.filename}`,
        uploadedAt: new Date()
    }));
}

const list = asyncHandler(async (req, res) => {
    const me = req.user;

    // ADMIN: lista tudo com filtros normais
    if (isAdmin(me)) {
        const data = await ticketService.list(req.query);
        return res.json(data);
    }

    // USER: lista somente os próprios
    if (isUser(me)) {
        const data = await ticketService.listBySolicitante(me._id, req.query);
        return res.json(data);
    }

    // RESPONSAVEL: lista somente atribuídos a ele
    if (isResponsavel(me)) {
        const data = await ticketService.listByResponsavel(me._id, req.query);
        return res.json(data);
    }

    throw new HttpError(403, "Permissão insuficiente");
});

const getById = asyncHandler(async (req, res) => {
    const me = req.user;
    const t = await ticketService.getById(req.params.id);

    if (isAdmin(me)) return res.json(t);

    // USER pode ver se for solicitante
    if (isUser(me) && String(t.solicitante?._id || t.solicitante) === String(me._id)) {
        return res.json(t);
    }

    // RESPONSAVEL pode ver se for responsável
    if (isResponsavel(me) && String(t.responsavel?._id || t.responsavel) === String(me._id)) {
        return res.json(t);
    }

    throw new HttpError(403, "Você não tem acesso a esse chamado");
});

const create = asyncHandler(async (req, res) => {
    const me = req.user;
    const payload = req.body || {};

    // anexos (multipart/form-data)
    const anexos = filesToMeta(req);

    // ✅ USER: solicitante e responsável = ele mesmo
    if (me.role === "USER") {
        payload.solicitante = me._id;
        payload.responsavel = me._id;

        if (!payload.status) payload.status = "Pendente";

        // prazoDias é numérico
        if (payload.prazoDias !== undefined && payload.prazoDias !== null && payload.prazoDias !== "") {
            payload.prazoDias = Number(payload.prazoDias);
        } else {
            payload.prazoDias = null;
        }

        payload.anexos = anexos;

        const created = await ticketService.create(payload);
        return res.status(201).json(created);
    }

    // ADMIN: pode criar com quem quiser
    if (me.role === "ADMIN") {
        if (!payload.solicitante) payload.solicitante = me._id;
        if (!payload.responsavel) payload.responsavel = me._id; // opcional: padrão

        if (payload.prazoDias !== undefined && payload.prazoDias !== null && payload.prazoDias !== "") {
            payload.prazoDias = Number(payload.prazoDias);
        } else {
            payload.prazoDias = null;
        }

        payload.anexos = anexos;

        const created = await ticketService.create(payload);
        return res.status(201).json(created);
    }

    // RESPONSAVEL por enquanto não cria
    throw new HttpError(403, "Somente USER ou ADMIN pode abrir chamado nesta fase");
});



const addAttachments = asyncHandler(async (req, res) => {
    const me = req.user;
    const anexos = filesToMeta(req);
    if (!anexos.length) throw new HttpError(400, "Envie ao menos 1 arquivo");

    // pode anexar: ADMIN ou USER (somente se for solicitante) ou RESPONSAVEL (somente se for responsável)
    const t = await ticketService.getById(req.params.id);
    const isMineUser = me.role === "USER" && String(t.solicitante?._id || t.solicitante) === String(me._id);
    const isMineResp = me.role === "RESPONSAVEL" && String(t.responsavel?._id || t.responsavel) === String(me._id);

    if (me.role !== "ADMIN" && !isMineUser && !isMineResp) {
        throw new HttpError(403, "Você não pode anexar arquivos nesse chamado");
    }

    const updated = await ticketService.addAttachments(req.params.id, anexos);
    res.json(updated);
});

const update = asyncHandler(async (req, res) => {
    const me = req.user;

    // Somente ADMIN por enquanto
    if (!isAdmin(me)) throw new HttpError(403, "Somente ADMIN pode editar chamados nesta fase");

    const updated = await ticketService.update(req.params.id, req.body || {});
    res.json(updated);
});

const updateStatus = asyncHandler(async (req, res) => {
    const me = req.user;
    const { status } = req.body || {};
    if (!status) throw new HttpError(400, "Informe o status");

    // ADMIN/RESPONSAVEL/USER (USER somente nos próprios chamados)
    if (!isAdmin(me) && !isResponsavel(me) && !isUser(me)) {
        throw new HttpError(403, "Você não pode alterar status");
    }

    // se USER, só pode alterar se for solicitante
    if (isUser(me)) {
        const t = await ticketService.getById(req.params.id);
        const isMine = String(t.solicitante?._id || t.solicitante) === String(me._id);
        if (!isMine) throw new HttpError(403, "Você não pode alterar status desse chamado");
    }

    // se RESPONSAVEL, só pode alterar se o ticket for dele
    if (isResponsavel(me)) {
        const t = await ticketService.getById(req.params.id);
        const isMine = String(t.responsavel?._id || t.responsavel) === String(me._id);
        if (!isMine) throw new HttpError(403, "Você não pode alterar status desse chamado");
    }

    const updated = await ticketService.updateStatus(req.params.id, status);
    res.json(updated);
});

const remove = asyncHandler(async (req, res) => {
    const me = req.user;
    if (!isAdmin(me)) throw new HttpError(403, "Somente ADMIN pode excluir chamados");
    await ticketService.remove(req.params.id);
    res.status(204).send();
});

const addUpdate = asyncHandler(async (req, res) => {
    const me = req.user;
    const { mensagem, anexo } = req.body || {};
    if (!mensagem) throw new HttpError(400, "Informe a mensagem");

    // precisa ter acesso ao ticket para comentar
    const t = await ticketService.getById(req.params.id);

    if (isAdmin(me)) {
        const updated = await ticketService.addUpdate(req.params.id, { autor: me._id, mensagem, anexo: anexo || null });
        return res.json(updated);
    }

    if (isUser(me)) {
        const isMine = String(t.solicitante?._id || t.solicitante) === String(me._id);
        if (!isMine) throw new HttpError(403, "Você não pode comentar nesse chamado");
        const updated = await ticketService.addUpdate(req.params.id, { autor: me._id, mensagem, anexo: anexo || null });
        return res.json(updated);
    }

    if (isResponsavel(me)) {
        const isMine = String(t.responsavel?._id || t.responsavel) === String(me._id);
        if (!isMine) throw new HttpError(403, "Você não pode comentar nesse chamado");
        const updated = await ticketService.addUpdate(req.params.id, { autor: me._id, mensagem, anexo: anexo || null });
        return res.json(updated);
    }

    throw new HttpError(403, "Permissão insuficiente");
});

module.exports = { list, getById, create, addAttachments, update, updateStatus, remove, addUpdate };
