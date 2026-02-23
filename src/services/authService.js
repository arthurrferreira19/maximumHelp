const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { HttpError } = require("../utils/httpError");
const User = require("../models/User");

function signToken(userId) {
  const secret = process.env.JWT_SECRET;
  const expiresIn = process.env.JWT_EXPIRES_IN || "8h";
  return jwt.sign({}, secret, { subject: String(userId), expiresIn });
}

async function login(email, senha) {
  const user = await User.findOne({ email: String(email).toLowerCase().trim() });
  if (!user || !user.ativo) throw new HttpError(401, "E-mail ou senha inválidos");

  const ok = await bcrypt.compare(String(senha), user.senhaHash);
  if (!ok) throw new HttpError(401, "E-mail ou senha inválidos");

  const token = signToken(user._id);

  return {
    accessToken: token,
    user: {
      id: user._id,
      nome: user.nome,
      email: user.email,
      role: user.role
    }
  };
}

module.exports = { login };
